require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    ChannelType,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    UserSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    SlashCommandBuilder,
    REST,
    Routes
} = require("discord.js");

// ======================================================
// CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;

const CREATE_CHANNEL_ID = process.env.CREATE_CHANNEL_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;

// ======================================================
// ROLE CONFIG
// ======================================================

// ยศใหญ่
// ใส่หลาย ID ได้ โดยคั่นด้วย ,
//
// BIG_ROLE_ID=111111111111111111,222222222222222222,333333333333333333
//
const bigRoleIds = process.env.BIG_ROLE_ID
    ? process.env.BIG_ROLE_ID
        .split(",")
        .map(id => id.trim())
        .filter(Boolean)
    : [];

// ยศที่อนุญาตทั่วไป
//
// ALLOW_ROLE_ID=111111111111111111,222222222222222222
//
const allowRoleIds = process.env.ALLOW_ROLE_ID
    ? process.env.ALLOW_ROLE_ID
        .split(",")
        .map(id => id.trim())
        .filter(Boolean)
    : [];

// ======================================================
// CHECK CONFIG
// ======================================================

if (!TOKEN) {
    console.error("❌ ไม่พบ TOKEN ใน Environment Variables");
    process.exit(1);
}

if (!CREATE_CHANNEL_ID) {
    console.error("❌ ไม่พบ CREATE_CHANNEL_ID");
    process.exit(1);
}

if (!CATEGORY_ID) {
    console.error("❌ ไม่พบ CATEGORY_ID");
    process.exit(1);
}

console.log("======================================");
console.log("🔧 CONFIG");
console.log("======================================");
console.log("CREATE_CHANNEL_ID:", CREATE_CHANNEL_ID);
console.log("CATEGORY_ID:", CATEGORY_ID);
console.log("BIG_ROLE_ID:", bigRoleIds);
console.log("ALLOW_ROLE_ID:", allowRoleIds);
console.log("======================================");

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

// ======================================================
// TEMP CHANNEL DATA
// ======================================================

// channelId => {
//     ownerId,
//     locked,
//     hidden,
//     userLimit,
//     savedOverwrites
// }

const tempChannels = new Map();

// ======================================================
// HELPERS
// ======================================================

function isBigRole(member) {
    if (!member) return false;

    return member.roles.cache.some(role =>
        bigRoleIds.includes(role.id)
    );
}

function hasAllowRole(member) {
    if (!member) return false;

    return member.roles.cache.some(role =>
        allowRoleIds.includes(role.id)
    );
}

function isPrivileged(member) {
    return isBigRole(member) || hasAllowRole(member);
}

// ======================================================
// BASE PERMISSION OVERWRITES
// ======================================================

function createRoomOverwrites(guild, ownerId) {

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            allow: [],
            deny: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect
            ]
        },

        // เจ้าของห้อง
        {
            id: ownerId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.Stream,
                PermissionFlagsBits.UseVAD
            ]
        }
    ];

    // ==================================================
    // ALLOW ROLE
    // ==================================================

    for (const roleId of allowRoleIds) {

        if (roleId === guild.roles.everyone.id) continue;

        overwrites.push({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak
            ]
        });
    }

    // ==================================================
    // BIG ROLE
    // ==================================================

    for (const roleId of bigRoleIds) {

        if (roleId === guild.roles.everyone.id) continue;

        // ป้องกัน overwrite ซ้ำกับ ALLOW_ROLE_ID
        const exists = overwrites.some(
            overwrite => overwrite.id === roleId
        );

        if (exists) continue;

        overwrites.push({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.Stream,
                PermissionFlagsBits.UseVAD
            ]
        });
    }

    return overwrites;
}

// ======================================================
// ENSURE BIG ROLES
// ======================================================

async function ensurePrivilegedRoles(channel) {

    for (const roleId of bigRoleIds) {

        try {

            await channel.permissionOverwrites.edit(roleId, {
                ViewChannel: true,
                Connect: true,
                Speak: true,
                Stream: true,
                UseVAD: true
            });

        } catch (error) {

            console.error(
                `❌ ไม่สามารถตั้ง BIG_ROLE ${roleId}:`,
                error.message
            );

        }
    }

    // ALLOW ROLE
    for (const roleId of allowRoleIds) {

        try {

            await channel.permissionOverwrites.edit(roleId, {
                ViewChannel: true,
                Connect: true,
                Speak: true
            });

        } catch (error) {

            console.error(
                `❌ ไม่สามารถตั้ง ALLOW_ROLE ${roleId}:`,
                error.message
            );

        }
    }
}

// ======================================================
// ROOM CHECK
// ======================================================

function isTempChannel(channelId) {
    return tempChannels.has(channelId);
}

// ======================================================
// CREATE ROOM
// ======================================================

async function createTempRoom(member) {

    const guild = member.guild;

    try {

        const channel = await guild.channels.create({
            name: `ห้องของ ${member.user.username}`,
            type: ChannelType.GuildVoice,
            parent: CATEGORY_ID,
            userLimit: 0,
            permissionOverwrites: createRoomOverwrites(
                guild,
                member.id
            )
        });

        tempChannels.set(channel.id, {
            ownerId: member.id,
            locked: false,
            hidden: false,
            userLimit: 0,
            savedOverwrites: null
        });

        console.log(
            `✅ สร้างห้อง ${channel.name} ให้ ${member.user.tag}`
        );

        // ย้ายเจ้าของเข้าไป
        try {

            await member.voice.setChannel(channel);

        } catch (error) {

            console.error(
                "❌ ย้ายสมาชิกเข้าห้องไม่ได้:",
                error.message
            );

        }

        return channel;

    } catch (error) {

        console.error(
            "❌ สร้างห้องไม่สำเร็จ:",
            error
        );

        return null;
    }
}

// ======================================================
// DELETE ROOM
// ======================================================

async function deleteTempRoom(channel) {

    if (!channel) return;

    if (!tempChannels.has(channel.id)) return;

    try {

        tempChannels.delete(channel.id);

        await channel.delete(
            "Temporary voice channel is empty"
        );

        console.log(
            `🗑️ ลบห้อง ${channel.name}`
        );

    } catch (error) {

        console.error(
            "❌ ลบห้องไม่สำเร็จ:",
            error.message
        );

    }
}

// ======================================================
// BUTTON PANEL
// ======================================================

function createRoomPanel() {

    const embed = new EmbedBuilder()
        .setTitle("🎛️ ระบบจัดการห้องส่วนตัว")
        .setDescription(
            [
                "เลือกเมนูด้านล่างเพื่อจัดการห้องของคุณ",
                "",
                "✏️ เปลี่ยนชื่อห้อง",
                "🔒 ล็อกห้อง",
                "🔓 ปลดล็อกห้อง",
                "👥 จำกัดจำนวนคน",
                "👑 ดูเจ้าของห้อง",
                "🙈 ซ่อนห้อง",
                "👁️ แสดงห้อง",
                "🔄 โอนเจ้าของ",
                "✅ อนุญาตสมาชิก",
                "❌ ไม่อนุญาตสมาชิก"
            ].join("\n")
        )
        .setColor("#5865F2")
        .setFooter({
            text: "Temporary Voice Room System"
        });

    const row1 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId("room_name")
            .setLabel("เปลี่ยนชื่อ")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("room_lock")
            .setLabel("ล็อก")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("room_unlock")
            .setLabel("ปลดล็อก")
            .setEmoji("🔓")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("room_limit")
            .setLabel("จำกัดคน")
            .setEmoji("👥")
            .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId("room_owner")
            .setLabel("เจ้าของ")
            .setEmoji("👑")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("room_hide")
            .setLabel("ซ่อน")
            .setEmoji("🙈")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("room_show")
            .setLabel("แสดง")
            .setEmoji("👁️")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("room_transfer")
            .setLabel("โอนเจ้าของ")
            .setEmoji("🔄")
            .setStyle(ButtonStyle.Primary)
    );

    const row3 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId("room_allow")
            .setLabel("อนุญาต")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("room_deny")
            .setLabel("ไม่อนุญาต")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
    );

    return [row1, row2, row3];
}

// ======================================================
// SEND ROOM PANEL
// ======================================================

async function sendRoomPanel(interaction) {

    const channel = interaction.member?.voice?.channel;

    if (!channel || !isTempChannel(channel.id)) {

        return interaction.reply({
            content: "❌ คุณต้องอยู่ในห้องส่วนตัวของระบบก่อน",
            ephemeral: true
        });

    }

    const data = tempChannels.get(channel.id);

    if (!data) {

        return interaction.reply({
            content: "❌ ไม่พบข้อมูลห้องนี้",
            ephemeral: true
        });

    }

    if (data.ownerId !== interaction.user.id) {

        return interaction.reply({
            content: "❌ เฉพาะเจ้าของห้องเท่านั้นที่ใช้คำสั่งนี้ได้",
            ephemeral: true
        });

    }

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("🎛️ จัดการห้องส่วนตัว")
                .setDescription(
                    "ใช้ปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
                )
                .setColor("#5865F2")
        ],
        components: createRoomPanel()
    });
}

// ======================================================
// VOICE STATE
// ======================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

    try {

        // ==================================================
        // CREATE ROOM
        // ==================================================

        if (
            newState.channelId === CREATE_CHANNEL_ID &&
            oldState.channelId !== CREATE_CHANNEL_ID
        ) {

            const member = newState.member;

            if (!member) return;

            await createTempRoom(member);
        }

        // ==================================================
        // DELETE EMPTY ROOM
        // ==================================================

        if (
            oldState.channelId &&
            isTempChannel(oldState.channelId)
        ) {

            const oldChannel = oldState.channel;

            if (
                oldChannel &&
                oldChannel.members.size === 0
            ) {

                await deleteTempRoom(oldChannel);
            }
        }

    } catch (error) {

        console.error(
            "❌ voiceStateUpdate error:",
            error
        );

    }
});

// ======================================================
// INTERACTION
// ======================================================

client.on("interactionCreate", async interaction => {

    try {

        // ==================================================
        // SLASH COMMAND
        // ==================================================

        if (interaction.isChatInputCommand()) {

            if (interaction.commandName === "room") {

                if (
                    !interaction.member.permissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {

                    return interaction.reply({
                        content: "❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้",
                        ephemeral: true
                    });

                }

                return sendRoomPanel(interaction);
            }
        }

        // ==================================================
        // BUTTON
        // ==================================================

        if (interaction.isButton()) {

            const channel =
                interaction.member?.voice?.channel;

            if (
                !channel ||
                !isTempChannel(channel.id)
            ) {

                return interaction.reply({
                    content: "❌ คุณต้องอยู่ในห้องส่วนตัวก่อน",
                    ephemeral: true
                });

            }

            const data = tempChannels.get(channel.id);

            if (!data) {

                return interaction.reply({
                    content: "❌ ไม่พบข้อมูลห้อง",
                    ephemeral: true
                });

            }

            // ==============================================
            // OWNER CHECK
            // ==============================================

            if (
                data.ownerId !== interaction.user.id &&
                !isBigRole(interaction.member)
            ) {

                return interaction.reply({
                    content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
                    ephemeral: true
                });

            }

            // ==============================================
            // NAME
            // ==============================================

            if (interaction.customId === "room_name") {

                const modal = new ModalBuilder()
                    .setCustomId("room_name_modal")
                    .setTitle("✏️ เปลี่ยนชื่อห้อง");

                const input = new TextInputBuilder()
                    .setCustomId("room_name_input")
                    .setLabel("ชื่อห้องใหม่")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100)
                    .setPlaceholder("กรอกชื่อห้อง");

                modal.addComponents(
                    new ActionRowBuilder().addComponents(input)
                );

                return interaction.showModal(modal);
            }

            // ==============================================
            // LOCK
            // ==============================================

            if (interaction.customId === "room_lock") {

                await channel.permissionOverwrites.edit(
                    channel.guild.roles.everyone.id,
                    {
                        Connect: false
                    }
                );

                // เจ้าของยังเข้าได้
                await channel.permissionOverwrites.edit(
                    data.ownerId,
                    {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true
                    }
                );

                // ALLOW ROLE ยังคงเข้าได้
                for (const roleId of allowRoleIds) {

                    await channel.permissionOverwrites.edit(
                        roleId,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true
                        }
                    );
                }

                // BIG ROLE ยังคงเข้าได้
                for (const roleId of bigRoleIds) {

                    await channel.permissionOverwrites.edit(
                        roleId,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true,
                            Stream: true,
                            UseVAD: true
                        }
                    );
                }

                data.locked = true;

                return interaction.reply({
                    content: "🔒 ล็อกห้องเรียบร้อยแล้ว",
                    ephemeral: true
                });
            }

            // ==============================================
            // UNLOCK
            // ==============================================

            if (interaction.customId === "room_unlock") {

                await channel.permissionOverwrites.edit(
                    channel.guild.roles.everyone.id,
                    {
                        Connect: true
                    }
                );

                // เจ้าของ
                await channel.permissionOverwrites.edit(
                    data.ownerId,
                    {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true
                    }
                );

                // ALLOW ROLE
                for (const roleId of allowRoleIds) {

                    await channel.permissionOverwrites.edit(
                        roleId,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true
                        }
                    );
                }

                // BIG ROLE
                for (const roleId of bigRoleIds) {

                    await channel.permissionOverwrites.edit(
                        roleId,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true,
                            Stream: true,
                            UseVAD: true
                        }
                    );
                }

                data.locked = false;

                return interaction.reply({
                    content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว",
                    ephemeral: true
                });
            }

            // ==============================================
            // LIMIT
            // ==============================================

            if (interaction.customId === "room_limit") {

                const modal = new ModalBuilder()
                    .setCustomId("room_limit_modal")
                    .setTitle("👥 จำกัดจำนวนสมาชิก");

                const input = new TextInputBuilder()
                    .setCustomId("room_limit_input")
                    .setLabel("จำนวนสมาชิก")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(2)
                    .setPlaceholder("0 = ไม่จำกัด");

                modal.addComponents(
                    new ActionRowBuilder().addComponents(input)
                );

                return interaction.showModal(modal);
            }

            // ==============================================
            // OWNER
            // ==============================================

            if (interaction.customId === "room_owner") {

                const owner = await channel.guild.members
                    .fetch(data.ownerId)
                    .catch(() => null);

                return interaction.reply({
                    content: owner
                        ? `👑 เจ้าของห้องคือ ${owner}`
                        : "❌ ไม่พบเจ้าของห้อง",
                    ephemeral: true
                });
            }

            // ==============================================
            // HIDE
            // ==============================================

            if (interaction.customId === "room_hide") {

                await channel.permissionOverwrites.edit(
                    channel.guild.roles.everyone.id,
                    {
                        ViewChannel: false,
                        Connect: false
                    }
                );

                // เจ้าของ
                await channel.permissionOverwrites.edit(
                    data.ownerId,
                    {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true
                    }
                );

                // ALLOW ROLE
                for (const roleId of allowRoleIds) {

                    await channel.permissionOverwrites.edit(
                        roleId,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true
                        }
                    );
                }

                // BIG ROLE
                for (const roleId of bigRoleIds) {

                    await channel.permissionOverwrites.edit(
                        roleId,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true,
                            Stream: true,
                            UseVAD: true
                        }
                    );
                }

                data.hidden = true;

                return interaction.reply({
                    content: "🙈 ซ่อนห้องเรียบร้อยแล้ว",
                    ephemeral: true
                });
            }

            // ==============================================
            // SHOW
            // ==============================================

            if (interaction.customId === "room_show") {

                await channel.permissionOverwrites.edit(
                    channel.guild.roles.everyone.id,
                    {
                        ViewChannel: true,
                        Connect: data.locked ? false : true
                    }
                );

                // เจ้าของ
                await channel.permissionOverwrites.edit(
                    data.ownerId,
                    {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true
                    }
                );

                // ALLOW ROLE
                for (const roleId of allowRoleIds) {

                    await channel.permissionOverwrites.edit(
                        roleId,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true
                        }
                    );
                }

                // BIG ROLE
                for (const roleId of bigRoleIds) {

                    await channel.permissionOverwrites.edit(
                        roleId,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true,
                            Stream: true,
                            UseVAD: true
                        }
                    );
                }

                data.hidden = false;

                return interaction.reply({
                    content: "👁️ แสดงห้องเรียบร้อยแล้ว",
                    ephemeral: true
                });
            }

            // ==============================================
            // TRANSFER
            // ==============================================

            if (interaction.customId === "room_transfer") {

                const menu = new UserSelectMenuBuilder()
                    .setCustomId("room_transfer_user")
                    .setPlaceholder("เลือกสมาชิกที่จะเป็นเจ้าของห้อง")
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.reply({
                    content: "🔄 เลือกเจ้าของห้องคนใหม่",
                    components: [
                        new ActionRowBuilder().addComponents(menu)
                    ],
                    ephemeral: true
                });
            }

            // ==============================================
            // ALLOW
            // ==============================================

            if (interaction.customId === "room_allow") {

                const menu = new UserSelectMenuBuilder()
                    .setCustomId("room_allow_user")
                    .setPlaceholder("เลือกสมาชิกที่อนุญาตให้เข้าห้อง")
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.reply({
                    content: "✅ เลือกสมาชิก",
                    components: [
                        new ActionRowBuilder().addComponents(menu)
                    ],
                    ephemeral: true
                });
            }

            // ==============================================
            // DENY
            // ==============================================

            if (interaction.customId === "room_deny") {

                const menu = new UserSelectMenuBuilder()
                    .setCustomId("room_deny_user")
                    .setPlaceholder("เลือกสมาชิกที่ไม่อนุญาต")
                    .setMinValues(1)
                    .setMaxValues(1);

                return interaction.reply({
                    content: "❌ เลือกสมาชิก",
                    components: [
                        new ActionRowBuilder().addComponents(menu)
                    ],
                    ephemeral: true
                });
            }
        }

        // ==================================================
        // USER SELECT
        // ==================================================

        if (interaction.isUserSelectMenu()) {

            const channel =
                interaction.member?.voice?.channel;

            if (
                !channel ||
                !isTempChannel(channel.id)
            ) {

                return interaction.reply({
                    content: "❌ คุณไม่ได้อยู่ในห้องส่วนตัว",
                    ephemeral: true
                });

            }

            const data = tempChannels.get(channel.id);

            if (!data) {

                return interaction.reply({
                    content: "❌ ไม่พบข้อมูลห้อง",
                    ephemeral: true
                });

            }

            if (
                data.ownerId !== interaction.user.id &&
                !isBigRole(interaction.member)
            ) {

                return interaction.reply({
                    content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
                    ephemeral: true
                });

            }

            const targetId = interaction.values[0];

            // ==============================================
            // TRANSFER
            // ==============================================

            if (
                interaction.customId ===
                "room_transfer_user"
            ) {

                const target =
                    await interaction.guild.members
                        .fetch(targetId)
                        .catch(() => null);

                if (!target) {

                    return interaction.update({
                        content: "❌ ไม่พบสมาชิก",
                        components: []
                    });
                }

                data.ownerId = targetId;

                await channel.permissionOverwrites.edit(
                    targetId,
                    {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true,
                        Stream: true,
                        UseVAD: true
                    }
                );

                return interaction.update({
                    content:
                        `🔄 โอนเจ้าของห้องให้ ${target} เรียบร้อยแล้ว`,
                    components: []
                });
            }

            // ==============================================
            // ALLOW USER
            // ==============================================

            if (
                interaction.customId ===
                "room_allow_user"
            ) {

                await channel.permissionOverwrites.edit(
                    targetId,
                    {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true,
                        Stream: true,
                        UseVAD: true
                    }
                );

                return interaction.update({
                    content:
                        `✅ อนุญาต <@${targetId}> ให้เข้าห้องแล้ว`,
                    components: []
                });
            }

            // ==============================================
            // DENY USER
            // ==============================================

            if (
                interaction.customId ===
                "room_deny_user"
            ) {

                await channel.permissionOverwrites.edit(
                    targetId,
                    {
                        ViewChannel: false,
                        Connect: false
                    }
                );

                return interaction.update({
                    content:
                        `❌ ไม่อนุญาต <@${targetId}> ให้เข้าห้องแล้ว`,
                    components: []
                });
            }
        }

        // ==================================================
        // MODAL
        // ==================================================

        if (interaction.isModalSubmit()) {

            const channel =
                interaction.member?.voice?.channel;

            if (
                !channel ||
                !isTempChannel(channel.id)
            ) {

                return interaction.reply({
                    content: "❌ คุณไม่ได้อยู่ในห้องส่วนตัว",
                    ephemeral: true
                });

            }

            const data = tempChannels.get(channel.id);

            if (!data) {

                return interaction.reply({
                    content: "❌ ไม่พบข้อมูลห้อง",
                    ephemeral: true
                });

            }

            if (
                data.ownerId !== interaction.user.id &&
                !isBigRole(interaction.member)
            ) {

                return interaction.reply({
                    content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
                    ephemeral: true
                });

            }

            // ==============================================
            // RENAME
            // ==============================================

            if (
                interaction.customId ===
                "room_name_modal"
            ) {

                const name =
                    interaction.fields.getTextInputValue(
                        "room_name_input"
                    ).trim();

                if (!name) {

                    return interaction.reply({
                        content: "❌ กรุณาใส่ชื่อห้อง",
                        ephemeral: true
                    });
                }

                await channel.setName(name);

                return interaction.reply({
                    content:
                        `✏️ เปลี่ยนชื่อห้องเป็น **${name}** แล้ว`,
                    ephemeral: true
                });
            }

            // ==============================================
            // LIMIT
            // ==============================================

            if (
                interaction.customId ===
                "room_limit_modal"
            ) {

                const value =
                    interaction.fields.getTextInputValue(
                        "room_limit_input"
                    ).trim();

                const limit = Number(value);

                if (
                    !Number.isInteger(limit) ||
                    limit < 0 ||
                    limit > 99
                ) {

                    return interaction.reply({
                        content:
                            "❌ กรุณาใส่ตัวเลข 0 - 99",
                        ephemeral: true
                    });
                }

                await channel.setUserLimit(limit);

                data.userLimit = limit;

                return interaction.reply({
                    content:
                        limit === 0
                            ? "👥 ตั้งเป็นไม่จำกัดจำนวนคนแล้ว"
                            : `👥 จำกัดห้องไว้ ${limit} คน`,
                    ephemeral: true
                });
            }
        }

    } catch (error) {

        console.error(
            "❌ interaction error:",
            error
        );

        try {

            if (interaction.replied || interaction.deferred) {

                await interaction.followUp({
                    content: "❌ เกิดข้อผิดพลาด",
                    ephemeral: true
                });

            } else {

                await interaction.reply({
                    content: "❌ เกิดข้อผิดพลาด",
                    ephemeral: true
                });

            }

        } catch {}
    }
});

// ======================================================
// READY
// ======================================================

client.once("ready", () => {

    console.log("======================================");
    console.log(`🟢 BOT ONLINE: ${client.user.tag}`);
    console.log(`🏠 BIG ROLE: ${bigRoleIds.length}`);
    console.log(`👤 ALLOW ROLE: ${allowRoleIds.length}`);
    console.log("======================================");

    client.user.setPresence({
        activities: [
            {
                name: "Temporary Voice Room",
                type: 0
            }
        ],
        status: "online"
    });
});

// ======================================================
// SLASH COMMAND REGISTER
// ======================================================

async function registerCommands() {

    try {

        const commands = [

            new SlashCommandBuilder()
                .setName("room")
                .setDescription(
                    "เปิดระบบจัดการห้องส่วนตัว"
                )
                .setDefaultMemberPermissions(
                    PermissionFlagsBits.Administrator
                )
                .toJSON()

        ];

        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);

        const applicationId =
            client.user.id;

        console.log(
            "🔄 กำลังลงทะเบียน Slash Commands..."
        );

        await rest.put(
            Routes.applicationCommands(applicationId),
            {
                body: commands
            }
        );

        console.log(
            "✅ ลงทะเบียน Slash Commands สำเร็จ"
        );

    } catch (error) {

        console.error(
            "❌ ลงทะเบียน Slash Commands ไม่สำเร็จ:",
            error
        );

    }
}

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
