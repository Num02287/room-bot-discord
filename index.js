```js
require("dotenv").config();

const express = require("express");

const {
    Client,
    GatewayIntentBits,
    Partials,
    ChannelType,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    SlashCommandBuilder,
} = require("discord.js");

// =====================================================
// EXPRESS SERVER
// =====================================================

const app = express();

app.get("/", (req, res) => {
    res.send("Discord Bot Online ✅");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Web Server running on port ${PORT}`);
});

// =====================================================
// CONFIG
// =====================================================

const TOKEN = process.env.TOKEN;
const CREATE_CHANNEL_ID = process.env.CREATE_CHANNEL_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const ALLOW_ROLE_ID = process.env.ALLOW_ROLE_ID;

// =====================================================
// BIG ROLES
// สมาชิกยศใหญ่สามารถมองเห็นห้องที่ซ่อนได้
// =====================================================

const bigRoleIds = [
    "1500549655107469535",
    "1502362111345426432",
    "1492931714887192739",
    "1492931717437063342",
    "1492931719832014978",
    "1493194473994326019",
    "1497961308530802691",
    "1494244850919280724",
    "1492934494616027197",
    "1493279265582616721",
    "1492935140400435265",
    "1492934562211168349",
    "1493253810993238169",
    "1492934660605346050",
    "1492934842483085536",
    "1493204336874881147",
    "1492934922896146537",
    "1492934607534952559",
    "1500491781983178825",
    "1500521553446834290",
    "1492931721384038480",
    "1501857544400932904",
    "1493650662624592032",
    "1492931723330064425",
    "1492931725129683124",
];

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [
        Partials.GuildMember,
        Partials.Channel,
    ],
});

// =====================================================
// TEMP CHANNEL DATA
// =====================================================

const tempChannels = new Map();

/*
tempChannels:

channelId => {
    owner: userId,
    hidden: true/false,
    locked: true/false
}
*/

// =====================================================
// HELPERS
// =====================================================

function isTempChannel(channelId) {
    return tempChannels.has(channelId);
}

function isOwner(member, channelId) {
    const data = tempChannels.get(channelId);

    if (!data) return false;

    return data.owner === member.id;
}

function hasBigRole(member) {
    return member.roles.cache.some(role =>
        bigRoleIds.includes(role.id)
    );
}

function canControlRoom(member, channelId) {
    if (isOwner(member, channelId)) return true;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    return false;
}

// =====================================================
// ROOM PERMISSION HELPERS
// =====================================================

async function setOwnerPermissions(channel, ownerId) {
    await channel.permissionOverwrites.edit(ownerId, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        ManageChannels: true,
        MoveMembers: true,
    });
}

// =====================================================
// CREATE ROOM
// =====================================================

async function createTempRoom(member) {

    const guild = member.guild;

    const existingRoom = [...tempChannels.entries()]
        .find(([channelId, data]) => data.owner === member.id);

    if (existingRoom) {

        const oldChannel = guild.channels.cache.get(existingRoom[0]);

        if (oldChannel) {
            try {
                await member.voice.setChannel(oldChannel);
                return oldChannel;
            } catch (err) {
                console.error(err);
            }
        }
    }

    const channel = await guild.channels.create({
        name: `🔊 ห้องของ ${member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: CATEGORY_ID,

        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,

                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect,
                ],

                deny: [],
            },

            {
                id: member.id,

                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect,
                    PermissionFlagsBits.Speak,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.MoveMembers,
                ],

                deny: [],
            },

            ...(ALLOW_ROLE_ID
                ? [
                    {
                        id: ALLOW_ROLE_ID,

                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.Speak,
                        ],

                        deny: [],
                    },
                ]
                : []),
        ],
    });

    tempChannels.set(channel.id, {
        owner: member.id,
        hidden: false,
        locked: false,
    });

    try {
        await member.voice.setChannel(channel);
    } catch (err) {
        console.error("Move user error:", err);
    }

    return channel;
}

// =====================================================
// ROOM CONTROL PANEL
// =====================================================

async function sendRoomPanel(channel) {

    const embed = new EmbedBuilder()
        .setTitle("🎛️ ระบบจัดการห้องเสียง")
        .setDescription(
            [
                "จัดการห้องเสียงส่วนตัวของคุณได้จากปุ่มด้านล่าง",
                "",
                "✏️ เปลี่ยนชื่อห้อง",
                "🔒 ล็อกห้อง",
                "🔓 ปลดล็อกห้อง",
                "🎯 จำกัดจำนวนสมาชิก",
                "👑 ดูเจ้าของห้อง",
                "🙈 ซ่อนห้อง",
                "👁️ แสดงห้อง",
                "👁️ แสดงห้องล็อก",
                "🔁 โอนเจ้าของ",
                "🧑‍🤝‍🧑 อนุญาตสมาชิก",
                "🚫 ปฏิเสธสมาชิก",
            ].join("\n")
        )
        .setFooter({
            text: "Private Voice Room System",
        });

    // =================================================
    // ROW 1
    // =================================================

    const row1 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId("rename_room")
            .setLabel("เปลี่ยนชื่อ")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("lock_room")
            .setLabel("ล็อก")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("unlock_room")
            .setLabel("ปลดล็อก")
            .setEmoji("🔓")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("limit_room")
            .setLabel("จำกัดคน")
            .setEmoji("🎯")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("owner_room")
            .setLabel("เจ้าของ")
            .setEmoji("👑")
            .setStyle(ButtonStyle.Secondary)
    );

    // =================================================
    // ROW 2
    // =================================================

    const row2 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId("hide_room")
            .setLabel("ซ่อน")
            .setEmoji("🙈")
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId("show_room")
            .setLabel("แสดง")
            .setEmoji("👁️")
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId("show_locked_room")
            .setLabel("แสดงห้องล็อก")
            .setEmoji("👁️")
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId("transfer_room")
            .setLabel("โอนเจ้าของ")
            .setEmoji("🔁")
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId("allow_room")
            .setLabel("อนุญาต")
            .setEmoji("🧑‍🤝‍🧑")
            .setStyle(ButtonStyle.Success)
    );

    // =================================================
    // ROW 3
    // =================================================

    const row3 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
            .setCustomId("deny_room")
            .setLabel("ปฏิเสธ")
            .setEmoji("🚫")
            .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        embeds: [embed],
        components: [
            row1,
            row2,
            row3,
        ],
    });
}

// =====================================================
// SLASH COMMAND
// =====================================================

const roomCommand = new SlashCommandBuilder()
    .setName("room")
    .setDescription("เปิดระบบจัดการห้องเสียง");

// =====================================================
// READY
// =====================================================

client.once("ready", async () => {

    console.log("=================================");
    console.log(`Bot Login: ${client.user.tag}`);
    console.log("=================================");

    try {

        await client.application.commands.set([
            roomCommand,
        ]);

        console.log("Slash Command Registered ✅");

    } catch (error) {

        console.error(
            "Command Register Error:",
            error
        );
    }
});

// =====================================================
// VOICE STATE
// =====================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

    try {

        const member = newState.member;

        if (!member) return;

        // =================================================
        // JOIN CREATE CHANNEL
        // =================================================

        if (
            newState.channelId === CREATE_CHANNEL_ID &&
            oldState.channelId !== CREATE_CHANNEL_ID
        ) {

            await createTempRoom(member);

            return;
        }

        // =================================================
        // DELETE EMPTY TEMP ROOM
        // =================================================

        if (
            oldState.channelId &&
            isTempChannel(oldState.channelId)
        ) {

            const channel = oldState.channel;

            if (!channel) return;

            if (channel.members.size === 0) {

                try {

                    tempChannels.delete(channel.id);

                    await channel.delete(
                        "Temporary voice room is empty"
                    );

                    console.log(
                        `Deleted temp room: ${channel.name}`
                    );

                } catch (error) {

                    console.error(
                        "Delete room error:",
                        error
                    );
                }
            }
        }

    } catch (error) {

        console.error(
            "VoiceState Error:",
            error
        );
    }
});

// =====================================================
// INTERACTIONS
// =====================================================

client.on("interactionCreate", async interaction => {

    try {

        // =================================================
        // SLASH COMMAND /room
        // =================================================

        if (
            interaction.isChatInputCommand() &&
            interaction.commandName === "room"
        ) {

            const channel = interaction.member.voice.channel;

            if (!channel) {

                return interaction.reply({
                    content: "❌ คุณต้องอยู่ในห้องเสียงก่อน",
                    ephemeral: true,
                });
            }

            if (!isTempChannel(channel.id)) {

                return interaction.reply({
                    content: "❌ ห้องนี้ไม่ใช่ห้องเสียงส่วนตัว",
                    ephemeral: true,
                });
            }

            if (!canControlRoom(
                interaction.member,
                channel.id
            )) {

                return interaction.reply({
                    content: "❌ คุณไม่ใช่เจ้าของห้อง",
                    ephemeral: true,
                });
            }

            await sendRoomPanel(channel);

            return interaction.reply({
                content: "✅ ส่งแผงควบคุมห้องเรียบร้อยแล้ว",
                ephemeral: true,
            });
        }

        // =================================================
        // BUTTONS
        // =================================================

        if (interaction.isButton()) {

            const member = interaction.member;

            const channel = member.voice.channel;

            if (!channel) {

                return interaction.reply({
                    content: "❌ คุณต้องอยู่ในห้องเสียง",
                    ephemeral: true,
                });
            }

            if (!isTempChannel(channel.id)) {

                return interaction.reply({
                    content: "❌ ห้องนี้ไม่ใช่ห้องชั่วคราว",
                    ephemeral: true,
                });
            }

            // =================================================
            // OWNER CHECK
            // =================================================

            if (!canControlRoom(member, channel.id)) {

                return interaction.reply({
                    content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
                    ephemeral: true,
                });
            }

            // =================================================
            // RENAME
            // =================================================

            if (interaction.customId === "rename_room") {

                const modal = new ModalBuilder()
                    .setCustomId("rename_modal")
                    .setTitle("เปลี่ยนชื่อห้อง");

                const input = new TextInputBuilder()
                    .setCustomId("room_name")
                    .setLabel("ชื่อห้องใหม่")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100)
                    .setValue(channel.name);

                const row = new ActionRowBuilder()
                    .addComponents(input);

                modal.addComponents(row);

                return interaction.showModal(modal);
            }

            // =================================================
            // LIMIT
            // =================================================

            if (interaction.customId === "limit_room") {

                const modal = new ModalBuilder()
                    .setCustomId("limit_modal")
                    .setTitle("จำกัดจำนวนสมาชิก");

                const input = new TextInputBuilder()
                    .setCustomId("user_limit")
                    .setLabel("จำนวนสมาชิก 0 - 99")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder("เช่น 5")
                    .setRequired(true)
                    .setMaxLength(2);

                const row = new ActionRowBuilder()
                    .addComponents(input);

                modal.addComponents(row);

                return interaction.showModal(modal);
            }

            // =================================================
            // OWNER
            // =================================================

            if (interaction.customId === "owner_room") {

                const data = tempChannels.get(channel.id);

                const owner = await interaction.guild.members
                    .fetch(data.owner)
                    .catch(() => null);

                return interaction.reply({
                    content:
                        `👑 เจ้าของห้องคือ ${owner ? owner : `<@${data.owner}>`}`,
                    ephemeral: true,
                });
            }

            // =================================================
            // LOCK
            // =================================================

            if (interaction.customId === "lock_room") {

                await channel.permissionOverwrites.edit(
                    interaction.guild.roles.everyone,
                    {
                        ViewChannel: true,
                        Connect: false,
                    }
                );

                await setOwnerPermissions(
                    channel,
                    interaction.member.id
                );

                const data = tempChannels.get(channel.id);

                if (data) {
                    data.locked = true;
                    data.hidden = false;
                }

                return interaction.reply({
                    content: "🔒 ล็อกห้องเรียบร้อยแล้ว",
                    ephemeral: true,
                });
            }

            // =================================================
            // UNLOCK
            // =================================================

            if (interaction.customId === "unlock_room") {

                /*
                 * สำคัญ:
                 * เราแก้เฉพาะ @everyone
                 * ไม่ลบ permission deny ของสมาชิกเฉพาะคน
                 */

                await channel.permissionOverwrites.edit(
                    interaction.guild.roles.everyone,
                    {
                        ViewChannel: true,
                        Connect: true,
                    }
                );

                await setOwnerPermissions(
                    channel,
                    interaction.member.id
                );

                const data = tempChannels.get(channel.id);

                if (data) {
                    data.locked = false;
                    data.hidden = false;
                }

                return interaction.reply({
                    content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว",
                    ephemeral: true,
                });
            }

            // =================================================
            // HIDE
            // =================================================

            if (interaction.customId === "hide_room") {

                await channel.permissionOverwrites.edit(
                    interaction.guild.roles.everyone,
                    {
                        ViewChannel: false,
                        Connect: false,
                    }
                );

                // เจ้าของ
                await setOwnerPermissions(
                    channel,
                    interaction.member.id
                );

                // ALLOW ROLE
                if (ALLOW_ROLE_ID) {

                    await channel.permissionOverwrites.edit(
                        ALLOW_ROLE_ID,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true,
                        }
                    );
                }

                // BIG ROLES
                for (const roleId of bigRoleIds) {

                    try {

                        await channel.permissionOverwrites.edit(
                            roleId,
                            {
                                ViewChannel: true,
                                Connect: true,
                            }
                        );

                    } catch (error) {

                        console.error(
                            `Big role ${roleId} error:`,
                            error
                        );
                    }
                }

                const data = tempChannels.get(channel.id);

                if (data) {
                    data.hidden = true;
                    data.locked = false;
                }

                return interaction.reply({
                    content: "🙈 ซ่อนเรียบร้อยแล้ว",
                    ephemeral: true,
                });
            }

            // =================================================
            // SHOW
            // =================================================

            if (interaction.customId === "show_room") {

                await channel.permissionOverwrites.edit(
                    interaction.guild.roles.everyone,
                    {
                        ViewChannel: true,
                        Connect: true,
                    }
                );

                await setOwnerPermissions(
                    channel,
                    interaction.member.id
                );

                if (ALLOW_ROLE_ID) {

                    await channel.permissionOverwrites.edit(
                        ALLOW_ROLE_ID,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true,
                        }
                    );
                }

                const data = tempChannels.get(channel.id);

                if (data) {
                    data.hidden = false;
                    data.locked = false;
                }

                return interaction.reply({
                    content: "👁️ แสดงห้องเรียบร้อยแล้ว",
                    ephemeral: true,
                });
            }

            // =================================================
            // SHOW LOCKED
            // =================================================

            if (interaction.customId === "show_locked_room") {

                /*
                 * แสดงห้องให้เห็น
                 * แต่ @everyone เข้าไม่ได้
                 */

                await channel.permissionOverwrites.edit(
                    interaction.guild.roles.everyone,
                    {
                        ViewChannel: true,
                        Connect: false,
                    }
                );

                await setOwnerPermissions(
                    channel,
                    interaction.member.id
                );

                if (ALLOW_ROLE_ID) {

                    await channel.permissionOverwrites.edit(
                        ALLOW_ROLE_ID,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true,
                        }
                    );
                }

                const data = tempChannels.get(channel.id);

                if (data) {
                    data.hidden = false;
                    data.locked = true;
                }

                return interaction.reply({
                    content: "👁️ แสดงห้องล็อกเรียบร้อยแล้ว",
                    ephemeral: true,
                });
            }

            // =================================================
            // TRANSFER
            // =================================================

            if (interaction.customId === "transfer_room") {

                const menu = new StringSelectMenuBuilder()
                    .setCustomId("select_transfer")
                    .setPlaceholder("เลือกสมาชิกที่จะเป็นเจ้าของห้อง")
                    .setMinValues(1)
                    .setMaxValues(1);

                const members = channel.members
                    .filter(m => m.id !== interaction.member.id)
                    .first(25);

                if (!members.length) {

                    return interaction.reply({
                        content: "❌ ไม่มีสมาชิกคนอื่นในห้อง",
                        ephemeral: true,
                    });
                }

                for (const m of members) {

                    menu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(m.user.username)
                            .setDescription(`โอนห้องให้ ${m.user.username}`)
                            .setValue(m.id)
                    );
                }

                const row = new ActionRowBuilder()
                    .addComponents(menu);

                return interaction.reply({
                    content: "👑 เลือกสมาชิกที่จะเป็นเจ้าของห้อง",
                    components: [row],
                    ephemeral: true,
                });
            }

            // =================================================
            // ALLOW
            // =================================================

            if (interaction.customId === "allow_room") {

                const menu = new StringSelectMenuBuilder()
                    .setCustomId("select_allow")
                    .setPlaceholder("เลือกสมาชิกที่ต้องการอนุญาต")
                    .setMinValues(1)
                    .setMaxValues(1);

                const members = await interaction.guild.members
                    .fetch();

                const options = members
                    .filter(m => !m.user.bot)
                    .filter(m => m.id !== interaction.member.id)
                    .first(25);

                for (const m of options) {

                    menu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(m.user.username)
                            .setDescription(`อนุญาต ${m.user.username}`)
                            .setValue(m.id)
                    );
                }

                if (!options.length) {

                    return interaction.reply({
                        content: "❌ ไม่พบสมาชิก",
                        ephemeral: true,
                    });
                }

                const row = new ActionRowBuilder()
                    .addComponents(menu);

                return interaction.reply({
                    content: "🧑‍🤝‍🧑 เลือกสมาชิกที่ต้องการอนุญาต",
                    components: [row],
                    ephemeral: true,
                });
            }

            // =================================================
            // DENY
            // =================================================

            if (interaction.customId === "deny_room") {

                const menu = new StringSelectMenuBuilder()
                    .setCustomId("select_deny")
                    .setPlaceholder("เลือกสมาชิกที่ต้องการปฏิเสธ")
                    .setMinValues(1)
                    .setMaxValues(1);

                const members = await interaction.guild.members
                    .fetch();

                const options = members
                    .filter(m => !m.user.bot)
                    .filter(m => m.id !== interaction.member.id)
                    .first(25);

                for (const m of options) {

                    menu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(m.user.username)
                            .setDescription(`ปฏิเสธ ${m.user.username}`)
                            .setValue(m.id)
                    );
                }

                if (!options.length) {

                    return interaction.reply({
                        content: "❌ ไม่พบสมาชิก",
                        ephemeral: true,
                    });
                }

                const row = new ActionRowBuilder()
                    .addComponents(menu);

                return interaction.reply({
                    content: "🚫 เลือกสมาชิกที่ต้องการปฏิเสธ",
                    components: [row],
                    ephemeral: true,
                });
            }
        }

        // =================================================
        // SELECT MENUS
        // =================================================

        if (interaction.isStringSelectMenu()) {

            const member = interaction.member;

            const channel = member.voice.channel;

            if (!channel) {

                return interaction.reply({
                    content: "❌ คุณต้องอยู่ในห้องเสียง",
                    ephemeral: true,
                });
            }

            if (!isTempChannel(channel.id)) {

                return interaction.reply({
                    content: "❌ ห้องนี้ไม่ใช่ห้องชั่วคราว",
                    ephemeral: true,
                });
            }

            if (!canControlRoom(member, channel.id)) {

                return interaction.reply({
                    content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
                    ephemeral: true,
                });
            }

            // =================================================
            // TRANSFER
            // =================================================

            if (
                interaction.customId === "select_transfer"
            ) {

                const newOwnerId =
                    interaction.values[0];

                const oldOwnerId =
                    tempChannels.get(channel.id).owner;

                // ลบสิทธิ์เจ้าของเดิม
                await channel.permissionOverwrites.edit(
                    oldOwnerId,
                    {
                        ManageChannels: false,
                        MoveMembers: false,
                    }
                );

                // ตั้งเจ้าของใหม่
                await setOwnerPermissions(
                    channel,
                    newOwnerId
                );

                const data =
                    tempChannels.get(channel.id);

                data.owner = newOwnerId;

                return interaction.update({
                    content:
                        `👑 โอนเจ้าของห้องให้ <@${newOwnerId}> เรียบร้อยแล้ว`,
                    components: [],
                });
            }

            // =================================================
            // ALLOW
            // =================================================

            if (
                interaction.customId === "select_allow"
            ) {

                const targetId =
                    interaction.values[0];

                await channel.permissionOverwrites.edit(
                    targetId,
                    {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true,
                    }
                );

                return interaction.update({
                    content:
                        `🧑‍🤝‍🧑 อนุญาต <@${targetId}> เข้าห้องเรียบร้อยแล้ว`,
                    components: [],
                });
            }

            // =================================================
            // DENY
            // =================================================

            if (
                interaction.customId === "select_deny"
            ) {

                const targetId =
                    interaction.values[0];

                await channel.permissionOverwrites.edit(
                    targetId,
                    {
                        ViewChannel: false,
                        Connect: false,
                        Speak: false,
                    }
                );

                const targetMember =
                    await interaction.guild.members
                        .fetch(targetId)
                        .catch(() => null);

                // ถ้าคนนั้นอยู่ในห้อง ให้เตะออก
                if (
                    targetMember &&
                    targetMember.voice.channelId === channel.id
                ) {

                    await targetMember.voice.disconnect(
                        "Denied from private room"
                    ).catch(() => {});
                }

                return interaction.update({
                    content:
                        `🚫 ปฏิเสธ <@${targetId}> เรียบร้อยแล้ว`,
                    components: [],
                });
            }
        }

        // =================================================
        // MODALS
        // =================================================

        if (interaction.isModalSubmit()) {

            const member = interaction.member;

            const channel = member.voice.channel;

            if (!channel) {

                return interaction.reply({
                    content: "❌ คุณต้องอยู่ในห้องเสียง",
                    ephemeral: true,
                });
            }

            if (!isTempChannel(channel.id)) {

                return interaction.reply({
                    content: "❌ ห้องนี้ไม่ใช่ห้องชั่วคราว",
                    ephemeral: true,
                });
            }

            if (!canControlRoom(member, channel.id)) {

                return interaction.reply({
                    content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
                    ephemeral: true,
                });
            }

            // =================================================
            // RENAME MODAL
            // =================================================

            if (
                interaction.customId === "rename_modal"
            ) {

                const name =
                    interaction.fields.getTextInputValue(
                        "room_name"
                    ).trim();

                if (!name) {

                    return interaction.reply({
                        content: "❌ กรุณาระบุชื่อห้อง",
                        ephemeral: true,
                    });
                }

                await channel.setName(name);

                return interaction.reply({
                    content:
                        `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`,
                    ephemeral: true,
                });
            }

            // =================================================
            // LIMIT MODAL
            // =================================================

            if (
                interaction.customId === "limit_modal"
            ) {

                const value =
                    interaction.fields.getTextInputValue(
                        "user_limit"
                    ).trim();

                const limit = Number(value);

                if (
                    Number.isNaN(limit) ||
                    limit < 0 ||
                    limit > 99
                ) {

                    return interaction.reply({
                        content:
                            "❌ กรุณาใส่ตัวเลขตั้งแต่ 0 ถึง 99",
                        ephemeral: true,
                    });
                }

                await channel.setUserLimit(limit);

                return interaction.reply({
                    content:
                        `🎯 ตั้งจำนวนสมาชิกสูงสุดเป็น **${limit === 0 ? "ไม่จำกัด" : limit}** เรียบร้อยแล้ว`,
                    ephemeral: true,
                });
            }
        }

    } catch (error) {

        console.error(
            "Interaction Error:",
            error
        );

        try {

            if (interaction.replied ||
                interaction.deferred) {

                await interaction.followUp({
                    content:
                        "❌ เกิดข้อผิดพลาดในการทำงาน",
                    ephemeral: true,
                });

            } else {

                await interaction.reply({
                    content:
                        "❌ เกิดข้อผิดพลาดในการทำงาน",
                    ephemeral: true,
                });
            }

        } catch {}
    }
});

// =====================================================
// LOGIN
// =====================================================

if (!TOKEN) {

    console.error(
        "❌ ไม่พบ TOKEN ในไฟล์ .env"
    );

    process.exit(1);
}

client.login(TOKEN);
```

### `.env`

```env
TOKEN=ใส่_BOT_TOKEN_ตรงนี้

CREATE_CHANNEL_ID=ไอดีห้องเสียงสำหรับสร้างห้อง

CATEGORY_ID=ไอดีหมวดหมู่ที่จะให้สร้างห้อง

ALLOW_ROLE_ID=ไอดียศที่อนุญาตให้เข้าห้อง
```

### `package.json`

```json
{
  "name": "discord-private-voice",
  "version": "1.0.0",
  "description": "Discord Temporary Private Voice Room",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "discord.js": "^14.22.1",
    "dotenv": "^17.2.1",
    "express": "^5.1.0"
  }
}
```

**สำคัญ:** Bot ต้องมีสิทธิ์อย่างน้อย `Manage Channels`, `Move Members` และ `Connect` ในหมวด/ห้องที่ใช้งาน และต้องเปิด Intents `Server Members Intent` กับ `Guild Voice States` ใน Discord Developer Portal ด้วย
