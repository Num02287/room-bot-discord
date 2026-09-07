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
// BIG ROLE IDS
// ยศเหล่านี้สามารถเห็นห้องที่ซ่อนได้
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

/*
    channelId => {
        owner: userId,
        hidden: true / false,
        locked: true / false
    }

    locked:
    true  = 🔒 ล็อก
    false = 🔓 ปลดล็อก
*/

const tempChannels = new Map();

// =====================================================
// HELPER
// =====================================================

function isTempChannel(channelId) {
    return tempChannels.has(channelId);
}

function isOwner(member, channelId) {
    const data = tempChannels.get(channelId);

    if (!data) return false;

    return data.owner === member.id;
}

function canControlRoom(member, channelId) {
    if (isOwner(member, channelId)) {
        return true;
    }

    if (
        member.permissions.has(
            PermissionFlagsBits.Administrator
        )
    ) {
        return true;
    }

    return false;
}

// =====================================================
// SET OWNER PERMISSION
// =====================================================

async function setOwnerPermissions(channel, ownerId) {

    await channel.permissionOverwrites.edit(
        ownerId,
        {
            ViewChannel: true,
            Connect: true,
            Speak: true,
            ManageChannels: true,
            MoveMembers: true,
        }
    );
}

// =====================================================
// SET ALLOW ROLE
// =====================================================

async function setAllowRolePermission(channel) {

    if (!ALLOW_ROLE_ID) return;

    await channel.permissionOverwrites.edit(
        ALLOW_ROLE_ID,
        {
            ViewChannel: true,
            Connect: true,
            Speak: true,
        }
    );
}

// =====================================================
// SET BIG ROLE PERMISSION
// ใช้ตอนซ่อนห้อง
// =====================================================

async function setBigRolePermissions(channel) {

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
                `Big Role ${roleId} Error:`,
                error
            );
        }
    }
}

// =====================================================
// CREATE TEMP ROOM
// =====================================================

async function createTempRoom(member) {

    const guild = member.guild;

    // -----------------------------------------------
    // ตรวจว่าผู้ใช้มีห้องอยู่แล้วหรือไม่
    // -----------------------------------------------

    const existingRoom = [...tempChannels.entries()]
        .find(([channelId, data]) => {
            return data.owner === member.id;
        });

    if (existingRoom) {

        const oldChannel =
            guild.channels.cache.get(existingRoom[0]);

        if (oldChannel) {

            try {

                await member.voice.setChannel(
                    oldChannel
                );

                return oldChannel;

            } catch (error) {

                console.error(
                    "Move existing room error:",
                    error
                );
            }
        }
    }

    // -----------------------------------------------
    // Permission ตอนสร้าง
    // -----------------------------------------------

    const permissionOverwrites = [

        // @everyone
        {
            id: guild.roles.everyone.id,

            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
            ],

            deny: [],
        },

        // OWNER
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
    ];

    // -----------------------------------------------
    // ALLOW ROLE
    // -----------------------------------------------

    if (ALLOW_ROLE_ID) {

        permissionOverwrites.push({
            id: ALLOW_ROLE_ID,

            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
            ],

            deny: [],
        });
    }

    // -----------------------------------------------
    // CREATE CHANNEL
    // -----------------------------------------------

    const channel = await guild.channels.create({

        name: `🔊 ห้องของ ${member.user.username}`,

        type: ChannelType.GuildVoice,

        parent: CATEGORY_ID,

        permissionOverwrites,
    });

    // -----------------------------------------------
    // SAVE DATA
    // เริ่มต้น = ปลดล็อก
    // -----------------------------------------------

    tempChannels.set(
        channel.id,
        {
            owner: member.id,
            hidden: false,
            locked: false,
        }
    );

    // -----------------------------------------------
    // MOVE USER
    // -----------------------------------------------

    try {

        await member.voice.setChannel(
            channel
        );

    } catch (error) {

        console.error(
            "Move user error:",
            error
        );
    }

    console.log(
        `Created room: ${channel.name}`
    );

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
                "จัดการห้องเสียงของคุณได้จากปุ่มด้านล่าง",
                "",
                "✏️ เปลี่ยนชื่อห้อง",
                "🔒 ล็อกห้อง",
                "🔓 ปลดล็อกห้อง",
                "🎯 จำกัดจำนวนคน",
                "👑 ดูเจ้าของห้อง",
                "🙈 ซ่อนห้อง",
                "👁️ แสดงห้อง",
                "👁️ แสดงห้องล็อก",
                "🔁 โอนเจ้าของ",
                "🧑‍🤝‍🧑 อนุญาตสมาชิก",
                "🚫 ปฏิเสธสมาชิก",
                "",
                "💡 เมื่อกด 👁️ แสดงห้อง ระบบจะคืนสถานะ",
                "🔒 หรือ 🔓 ที่เจ้าของเลือกไว้ก่อนซ่อน",
            ].join("\n")
        )

        .setFooter({
            text: "Private Voice Room System",
        });

    // =================================================
    // ROW 1
    // =================================================

    const row1 = new ActionRowBuilder()
        .addComponents(

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

    const row2 = new ActionRowBuilder()
        .addComponents(

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

    const row3 = new ActionRowBuilder()
        .addComponents(

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

const roomCommand =
    new SlashCommandBuilder()
        .setName("room")
        .setDescription("เปิดระบบจัดการห้องเสียง");

// =====================================================
// READY
// =====================================================

client.once("ready", async () => {

    console.log("-----------------------------------");
    console.log(`Bot Login: ${client.user.tag}`);
    console.log("-----------------------------------");

    try {

        await client.application.commands.set([
            roomCommand,
        ]);

        console.log(
            "Slash Command /room Registered ✅"
        );

    } catch (error) {

        console.error(
            "Command Register Error:",
            error
        );
    }
});

// =====================================================
// VOICE STATE UPDATE
// =====================================================

client.on(
    "voiceStateUpdate",
    async (oldState, newState) => {

        try {

            const member =
                newState.member ||
                oldState.member;

            if (!member) return;

            // =================================================
            // USER JOIN CREATE CHANNEL
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

                const oldChannel =
                    oldState.channel;

                if (!oldChannel) return;

                if (
                    oldChannel.members.size === 0
                ) {

                    try {

                        tempChannels.delete(
                            oldChannel.id
                        );

                        await oldChannel.delete(
                            "Temporary voice room is empty"
                        );

                        console.log(
                            `Deleted room: ${oldChannel.name}`
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
    }
);

// =====================================================
// INTERACTION CREATE
// =====================================================

client.on(
    "interactionCreate",
    async interaction => {

        try {

            // =================================================
            // /ROOM
            // =================================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === "room"
            ) {

                const channel =
                    interaction.member.voice.channel;

                if (!channel) {

                    return interaction.reply({
                        content:
                            "❌ คุณต้องอยู่ในห้องเสียงก่อน",
                        ephemeral: true,
                    });
                }

                if (
                    !isTempChannel(channel.id)
                ) {

                    return interaction.reply({
                        content:
                            "❌ ห้องนี้ไม่ใช่ห้องเสียงส่วนตัว",
                        ephemeral: true,
                    });
                }

                if (
                    !canControlRoom(
                        interaction.member,
                        channel.id
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ คุณไม่ใช่เจ้าของห้อง",
                        ephemeral: true,
                    });
                }

                await sendRoomPanel(
                    channel
                );

                return interaction.reply({
                    content:
                        "✅ ส่งแผงควบคุมห้องเรียบร้อยแล้ว",
                    ephemeral: true,
                });
            }

            // =================================================
            // BUTTON
            // =================================================

            if (interaction.isButton()) {

                const member =
                    interaction.member;

                const channel =
                    member.voice.channel;

                if (!channel) {

                    return interaction.reply({
                        content:
                            "❌ คุณต้องอยู่ในห้องเสียง",
                        ephemeral: true,
                    });
                }

                if (
                    !isTempChannel(channel.id)
                ) {

                    return interaction.reply({
                        content:
                            "❌ ห้องนี้ไม่ใช่ห้องชั่วคราว",
                        ephemeral: true,
                    });
                }

                if (
                    !canControlRoom(
                        member,
                        channel.id
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ เฉพาะเจ้าของห้องเท่านั้น",
                        ephemeral: true,
                    });
                }

                // =================================================
                // RENAME
                // =================================================

                if (
                    interaction.customId ===
                    "rename_room"
                ) {

                    const modal =
                        new ModalBuilder()
                            .setCustomId(
                                "rename_modal"
                            )
                            .setTitle(
                                "เปลี่ยนชื่อห้อง"
                            );

                    const input =
                        new TextInputBuilder()
                            .setCustomId(
                                "room_name"
                            )
                            .setLabel(
                                "ชื่อห้องใหม่"
                            )
                            .setStyle(
                                TextInputStyle.Short
                            )
                            .setRequired(true)
                            .setMaxLength(100)
                            .setValue(
                                channel.name
                            );

                    modal.addComponents(
                        new ActionRowBuilder()
                            .addComponents(input)
                    );

                    return interaction.showModal(
                        modal
                    );
                }

                // =================================================
                // LIMIT
                // =================================================

                if (
                    interaction.customId ===
                    "limit_room"
                ) {

                    const modal =
                        new ModalBuilder()
                            .setCustomId(
                                "limit_modal"
                            )
                            .setTitle(
                                "จำกัดจำนวนสมาชิก"
                            );

                    const input =
                        new TextInputBuilder()
                            .setCustomId(
                                "user_limit"
                            )
                            .setLabel(
                                "จำนวนสมาชิก 0 - 99"
                            )
                            .setStyle(
                                TextInputStyle.Short
                            )
                            .setPlaceholder(
                                "เช่น 5"
                            )
                            .setRequired(true)
                            .setMaxLength(2);

                    modal.addComponents(
                        new ActionRowBuilder()
                            .addComponents(input)
                    );

                    return interaction.showModal(
                        modal
                    );
                }

                // =================================================
                // OWNER
                // =================================================

                if (
                    interaction.customId ===
                    "owner_room"
                ) {

                    const data =
                        tempChannels.get(
                            channel.id
                        );

                    if (!data) {

                        return interaction.reply({
                            content:
                                "❌ ไม่พบข้อมูลห้อง",
                            ephemeral: true,
                        });
                    }

                    const owner =
                        await interaction.guild.members
                            .fetch(data.owner)
                            .catch(() => null);

                    return interaction.reply({
                        content:
                            `👑 เจ้าของห้องคือ ${
                                owner
                                    ? owner
                                    : `<@${data.owner}>`
                            }`,
                        ephemeral: true,
                    });
                }

                // =================================================
                // LOCK
                // =================================================

                if (
                    interaction.customId ===
                    "lock_room"
                ) {

                    const data =
                        tempChannels.get(
                            channel.id
                        );

                    // เห็นห้อง
                    // แต่ @everyone เข้าไม่ได้

                    await channel.permissionOverwrites.edit(
                        interaction.guild.roles.everyone.id,
                        {
                            ViewChannel: true,
                            Connect: false,
                        }
                    );

                    // เจ้าของยังเข้าได้
                    await setOwnerPermissions(
                        channel,
                        data.owner
                    );

                    // Allow Role ยังเข้าได้
                    await setAllowRolePermission(
                        channel
                    );

                    // ---------------------------------------------
                    // บันทึกสถานะ
                    // ---------------------------------------------

                    data.locked = true;
                    data.hidden = false;

                    return interaction.reply({
                        content:
                            "🔒 ล็อกห้องเรียบร้อยแล้ว",
                        ephemeral: true,
                    });
                }

                // =================================================
                // UNLOCK
                // =================================================

                if (
                    interaction.customId ===
                    "unlock_room"
                ) {

                    const data =
                        tempChannels.get(
                            channel.id
                        );

                    // เห็นห้อง
                    // @everyone เข้าได้

                    await channel.permissionOverwrites.edit(
                        interaction.guild.roles.everyone.id,
                        {
                            ViewChannel: true,
                            Connect: true,
                        }
                    );

                    // เจ้าของ
                    await setOwnerPermissions(
                        channel,
                        data.owner
                    );

                    // Allow Role
                    await setAllowRolePermission(
                        channel
                    );

                    // ---------------------------------------------
                    // บันทึกสถานะ
                    // ---------------------------------------------

                    data.locked = false;
                    data.hidden = false;

                    return interaction.reply({
                        content:
                            "🔓 ปลดล็อกห้องเรียบร้อยแล้ว",
                        ephemeral: true,
                    });
                }

                // =================================================
                // HIDE
                // =================================================

                if (
                    interaction.customId ===
                    "hide_room"
                ) {

                    const data =
                        tempChannels.get(
                            channel.id
                        );

                    if (!data) {

                        return interaction.reply({
                            content:
                                "❌ ไม่พบข้อมูลห้อง",
                            ephemeral: true,
                        });
                    }

                    /*
                        สำคัญ:

                        ไม่แตะ data.locked

                        เพราะต้องจำว่าเจ้าของเลือก
                        🔒 หรือ 🔓 ไว้ก่อนซ่อน
                    */

                    // ---------------------------------------------
                    // ซ่อนจาก @everyone
                    // ---------------------------------------------

                    await channel.permissionOverwrites.edit(
                        interaction.guild.roles.everyone.id,
                        {
                            ViewChannel: false,
                            Connect: false,
                        }
                    );

                    // ---------------------------------------------
                    // เจ้าของ
                    // ---------------------------------------------

                    await setOwnerPermissions(
                        channel,
                        data.owner
                    );

                    // ---------------------------------------------
                    // ALLOW ROLE
                    // ---------------------------------------------

                    await setAllowRolePermission(
                        channel
                    );

                    // ---------------------------------------------
                    // BIG ROLES
                    // ---------------------------------------------

                    await setBigRolePermissions(
                        channel
                    );

                    // ---------------------------------------------
                    // เปลี่ยนเฉพาะ hidden
                    // ห้ามเปลี่ยน locked
                    // ---------------------------------------------

                    data.hidden = true;

                    return interaction.reply({
                        content:
                            "🙈 ซ่อนเรียบร้อยแล้ว",
                        ephemeral: true,
                    });
                }

                // =================================================
                // SHOW ROOM
                // คืนสถานะเดิม
                // =================================================

                if (
                    interaction.customId ===
                    "show_room"
                ) {

                    const data =
                        tempChannels.get(
                            channel.id
                        );

                    if (!data) {

                        return interaction.reply({
                            content:
                                "❌ ไม่พบข้อมูลห้อง",
                            ephemeral: true,
                        });
                    }

                    // ---------------------------------------------
                    // ถ้าสถานะเดิมคือ LOCK
                    // ---------------------------------------------

                    if (
                        data.locked === true
                    ) {

                        await channel.permissionOverwrites.edit(
                            interaction.guild.roles.everyone.id,
                            {
                                ViewChannel: true,
                                Connect: false,
                            }
                        );

                    }

                    // ---------------------------------------------
                    // ถ้าสถานะเดิมคือ UNLOCK
                    // ---------------------------------------------

                    else {

                        await channel.permissionOverwrites.edit(
                            interaction.guild.roles.everyone.id,
                            {
                                ViewChannel: true,
                                Connect: true,
                            }
                        );
                    }

                    // ---------------------------------------------
                    // เจ้าของ
                    // ---------------------------------------------

                    await setOwnerPermissions(
                        channel,
                        data.owner
                    );

                    // ---------------------------------------------
                    // ALLOW ROLE
                    // ---------------------------------------------

                    await setAllowRolePermission(
                        channel
                    );

                    // ---------------------------------------------
                    // ห้องแสดงแล้ว
                    // ---------------------------------------------

                    data.hidden = false;

                    if (
                        data.locked === true
                    ) {

                        return interaction.reply({
                            content:
                                "👁️ แสดงห้องเรียบร้อยแล้ว 🔒 ห้องยังล็อกอยู่",
                            ephemeral: true,
                        });

                    } else {

                        return interaction.reply({
                            content:
                                "👁️ แสดงห้องเรียบร้อยแล้ว 🔓 ห้องปลดล็อกอยู่",
                            ephemeral: true,
                        });
                    }
                }

                // =================================================
                // SHOW LOCKED
                // บังคับแสดง + ล็อก
                // =================================================

                if (
                    interaction.customId ===
                    "show_locked_room"
                ) {

                    const data =
                        tempChannels.get(
                            channel.id
                        );

                    if (!data) {

                        return interaction.reply({
                            content:
                                "❌ ไม่พบข้อมูลห้อง",
                            ephemeral: true,
                        });
                    }

                    // ---------------------------------------------
                    // แสดงห้อง
                    // แต่ล็อกไม่ให้ @everyone เข้า
                    // ---------------------------------------------

                    await channel.permissionOverwrites.edit(
                        interaction.guild.roles.everyone.id,
                        {
                            ViewChannel: true,
                            Connect: false,
                        }
                    );

                    // เจ้าของ
                    await setOwnerPermissions(
                        channel,
                        data.owner
                    );

                    // Allow Role
                    await setAllowRolePermission(
                        channel
                    );

                    // ---------------------------------------------
                    // บันทึกสถานะ
                    // ---------------------------------------------

                    data.hidden = false;
                    data.locked = true;

                    return interaction.reply({
                        content:
                            "👁️ แสดงห้องล็อกเรียบร้อยแล้ว",
                        ephemeral: true,
                    });
                }

                // =================================================
                // TRANSFER
                // =================================================

                if (
                    interaction.customId ===
                    "transfer_room"
                ) {

                    const menu =
                        new StringSelectMenuBuilder()
                            .setCustomId(
                                "select_transfer"
                            )
                            .setPlaceholder(
                                "เลือกสมาชิกที่จะเป็นเจ้าของห้อง"
                            )
                            .setMinValues(1)
                            .setMaxValues(1);

                    const members =
                        channel.members
                            .filter(
                                m =>
                                    m.id !==
                                    interaction.member.id
                            )
                            .first(25);

                    if (!members.length) {

                        return interaction.reply({
                            content:
                                "❌ ไม่มีสมาชิกคนอื่นในห้อง",
                            ephemeral: true,
                        });
                    }

                    for (
                        const m of members
                    ) {

                        menu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(
                                    m.user.username
                                )
                                .setDescription(
                                    `โอนห้องให้ ${m.user.username}`
                                )
                                .setValue(
                                    m.id
                                )
                        );
                    }

                    return interaction.reply({
                        content:
                            "👑 เลือกสมาชิกที่จะเป็นเจ้าของห้อง",
                        components: [
                            new ActionRowBuilder()
                                .addComponents(menu)
                        ],
                        ephemeral: true,
                    });
                }

                // =================================================
                // ALLOW
                // =================================================

                if (
                    interaction.customId ===
                    "allow_room"
                ) {

                    const menu =
                        new StringSelectMenuBuilder()
                            .setCustomId(
                                "select_allow"
                            )
                            .setPlaceholder(
                                "เลือกสมาชิกที่ต้องการอนุญาต"
                            )
                            .setMinValues(1)
                            .setMaxValues(1);

                    const members =
                        await interaction.guild.members
                            .fetch();

                    const options =
                        members
                            .filter(
                                m => !m.user.bot
                            )
                            .filter(
                                m =>
                                    m.id !==
                                    interaction.member.id
                            )
                            .first(25);

                    if (!options.length) {

                        return interaction.reply({
                            content:
                                "❌ ไม่พบสมาชิก",
                            ephemeral: true,
                        });
                    }

                    for (
                        const m of options
                    ) {

                        menu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(
                                    m.user.username
                                )
                                .setDescription(
                                    `อนุญาต ${m.user.username}`
                                )
                                .setValue(
                                    m.id
                                )
                        );
                    }

                    return interaction.reply({
                        content:
                            "🧑‍🤝‍🧑 เลือกสมาชิกที่ต้องการอนุญาต",
                        components: [
                            new ActionRowBuilder()
                                .addComponents(menu)
                        ],
                        ephemeral: true,
                    });
                }

                // =================================================
                // DENY
                // =================================================

                if (
                    interaction.customId ===
                    "deny_room"
                ) {

                    const menu =
                        new StringSelectMenuBuilder()
                            .setCustomId(
                                "select_deny"
                            )
                            .setPlaceholder(
                                "เลือกสมาชิกที่ต้องการปฏิเสธ"
                            )
                            .setMinValues(1)
                            .setMaxValues(1);

                    const members =
                        await interaction.guild.members
                            .fetch();

                    const options =
                        members
                            .filter(
                                m => !m.user.bot
                            )
                            .filter(
                                m =>
                                    m.id !==
                                    interaction.member.id
                            )
                            .first(25);

                    if (!options.length) {

                        return interaction.reply({
                            content:
                                "❌ ไม่พบสมาชิก",
                            ephemeral: true,
                        });
                    }

                    for (
                        const m of options
                    ) {

                        menu.addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel(
                                    m.user.username
                                )
                                .setDescription(
                                    `ปฏิเสธ ${m.user.username}`
                                )
                                .setValue(
                                    m.id
                                )
                        );
                    }

                    return interaction.reply({
                        content:
                            "🚫 เลือกสมาชิกที่ต้องการปฏิเสธ",
                        components: [
                            new ActionRowBuilder()
                                .addComponents(menu)
                        ],
                        ephemeral: true,
                    });
                }
            }

            // =================================================
            // SELECT MENU
            // =================================================

            if (
                interaction.isStringSelectMenu()
            ) {

                const member =
                    interaction.member;

                const channel =
                    member.voice.channel;

                if (!channel) {

                    return interaction.reply({
                        content:
                            "❌ คุณต้องอยู่ในห้องเสียง",
                        ephemeral: true,
                    });
                }

                if (
                    !isTempChannel(channel.id)
                ) {

                    return interaction.reply({
                        content:
                            "❌ ห้องนี้ไม่ใช่ห้องชั่วคราว",
                        ephemeral: true,
                    });
                }

                if (
                    !canControlRoom(
                        member,
                        channel.id
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ เฉพาะเจ้าของห้องเท่านั้น",
                        ephemeral: true,
                    });
                }

                // =================================================
                // TRANSFER
                // =================================================

                if (
                    interaction.customId ===
                    "select_transfer"
                ) {

                    const data =
                        tempChannels.get(
                            channel.id
                        );

                    const newOwnerId =
                        interaction.values[0];

                    const oldOwnerId =
                        data.owner;

                    // ---------------------------------------------
                    // เจ้าของเดิม
                    // ---------------------------------------------

                    await channel.permissionOverwrites.edit(
                        oldOwnerId,
                        {
                            ManageChannels: false,
                            MoveMembers: false,
                        }
                    );

                    // ---------------------------------------------
                    // เจ้าของใหม่
                    // ---------------------------------------------

                    await setOwnerPermissions(
                        channel,
                        newOwnerId
                    );

                    data.owner =
                        newOwnerId;

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
                    interaction.customId ===
                    "select_allow"
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
                    interaction.customId ===
                    "select_deny"
                ) {

                    const targetId =
                        interaction.values[0];

                    // ---------------------------------------------
                    // ปฏิเสธถาวรจนกว่าเจ้าของจะ Allow
                    // ---------------------------------------------

                    await channel.permissionOverwrites.edit(
                        targetId,
                        {
                            ViewChannel: false,
                            Connect: false,
                            Speak: false,
                        }
                    );

                    // ---------------------------------------------
                    // ถ้าอยู่ในห้อง ให้เตะออก
                    // ---------------------------------------------

                    const targetMember =
                        await interaction.guild.members
                            .fetch(targetId)
                            .catch(() => null);

                    if (
                        targetMember &&
                        targetMember.voice.channelId ===
                            channel.id
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
            // MODAL
            // =================================================

            if (
                interaction.isModalSubmit()
            ) {

                const member =
                    interaction.member;

                const channel =
                    member.voice.channel;

                if (!channel) {

                    return interaction.reply({
                        content:
                            "❌ คุณต้องอยู่ในห้องเสียง",
                        ephemeral: true,
                    });
                }

                if (
                    !isTempChannel(channel.id)
                ) {

                    return interaction.reply({
                        content:
                            "❌ ห้องนี้ไม่ใช่ห้องชั่วคราว",
                        ephemeral: true,
                    });
                }

                if (
                    !canControlRoom(
                        member,
                        channel.id
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ เฉพาะเจ้าของห้องเท่านั้น",
                        ephemeral: true,
                    });
                }

                // =================================================
                // RENAME
                // =================================================

                if (
                    interaction.customId ===
                    "rename_modal"
                ) {

                    const name =
                        interaction.fields
                            .getTextInputValue(
                                "room_name"
                            )
                            .trim();

                    if (!name) {

                        return interaction.reply({
                            content:
                                "❌ กรุณาระบุชื่อห้อง",
                            ephemeral: true,
                        });
                    }

                    await channel.setName(
                        name
                    );

                    return interaction.reply({
                        content:
                            `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`,
                        ephemeral: true,
                    });
                }

                // =================================================
                // LIMIT
                // =================================================

                if (
                    interaction.customId ===
                    "limit_modal"
                ) {

                    const value =
                        interaction.fields
                            .getTextInputValue(
                                "user_limit"
                            )
                            .trim();

                    const limit =
                        Number(value);

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

                    await channel.setUserLimit(
                        limit
                    );

                    return interaction.reply({
                        content:
                            `🎯 ตั้งจำนวนสมาชิกสูงสุดเป็น **${
                                limit === 0
                                    ? "ไม่จำกัด"
                                    : limit
                            }** เรียบร้อยแล้ว`,
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

                if (
                    interaction.replied ||
                    interaction.deferred
                ) {

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
    }
);

// =====================================================
// CHECK CONFIG
// =====================================================

if (!TOKEN) {

    console.error(
        "❌ ไม่พบ TOKEN ในไฟล์ .env"
    );

    process.exit(1);
}

if (!CREATE_CHANNEL_ID) {

    console.error(
        "❌ ไม่พบ CREATE_CHANNEL_ID ในไฟล์ .env"
    );

    process.exit(1);
}

if (!CATEGORY_ID) {

    console.error(
        "❌ ไม่พบ CATEGORY_ID ในไฟล์ .env"
    );

    process.exit(1);
}

// =====================================================
// LOGIN
// =====================================================

client.login(TOKEN);
