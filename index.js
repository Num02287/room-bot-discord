const {
    Client,
    GatewayIntentBits,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    UserSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} = require("discord.js");

const express = require("express");

// ======================================================
// 🌐 WEB SERVER สำหรับ Render / Cloud
// ======================================================

const app = express();

app.get("/", (req, res) => {
    res.send("Bot is Online!");
});

app.listen(
    process.env.PORT || 3000,
    () => console.log("🌐 Web Server is ready.")
);

// ======================================================
// 🔐 ENVIRONMENT VARIABLES
// ======================================================

const token = process.env.TOKEN;

const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

// URL รูป Embed สามารถใส่ใน Environment Variable
const panelImageUrl = process.env.ROOM_PANEL_IMAGE_URL || null;

// ======================================================
// 🛡️ ตรวจสอบ ENV
// ======================================================

if (!token) {
    console.error("❌ ไม่พบ TOKEN ใน Environment Variables");
    process.exit(1);
}

if (!createChannelId) {
    console.error("❌ ไม่พบ CREATE_CHANNEL_ID");
}

if (!categoryId) {
    console.error("❌ ไม่พบ CATEGORY_ID");
}

// ======================================================
// 🤖 DISCORD CLIENT
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

// ======================================================
// 🏠 TEMP CHANNEL DATA
// ======================================================

/*
    โครงสร้างข้อมูล

    tempChannels.set(channel.id, {
        owner: "USER_ID",
        locked: false,
        hidden: false,
        allowedUsers: new Set()
    });
*/

const tempChannels = new Map();

// ======================================================
// 👑 ยศใหญ่ที่สามารถมองเห็นห้องที่ Hide
// ======================================================

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
    "1492931725129683124"
];

// ======================================================
// 🧰 ฟังก์ชันช่วยเหลือ
// ======================================================

async function setEveryonePermission(channel, permissions) {
    await channel.permissionOverwrites
        .edit(channel.guild.id, permissions)
        .catch(() => {});
}

async function setRolePermission(channel, roleId, permissions) {
    if (!roleId) return;

    await channel.permissionOverwrites
        .edit(roleId, permissions)
        .catch(() => {});
}

async function setUserPermission(channel, userId, permissions) {
    if (!userId) return;

    await channel.permissionOverwrites
        .edit(userId, permissions)
        .catch(() => {});
}

// ======================================================
// 👁️ APPLY ROOM STATE
// ======================================================

/*
    ฟังก์ชันนี้คือหัวใจของระบบ

    locked = true
        🔒 เข้าไม่ได้

    locked = false
        🔓 เข้าได้

    hidden = true
        🙈 ซ่อนห้อง

    hidden = false
        👁️ แสดงห้อง
*/

async function applyRoomState(channel, data) {

    if (!channel || !data) return;

    const guildId = channel.guild.id;

    // ==================================================
    // @everyone
    // ==================================================

    await channel.permissionOverwrites
        .edit(guildId, {

            // 👁️ / 🙈
            ViewChannel: !data.hidden,

            // 🔒 / 🔓
            Connect: !data.locked

        })
        .catch(() => {});

    // ==================================================
    // 👑 ยศพิเศษ
    // ==================================================

    if (allowRoleId) {

        await channel.permissionOverwrites
            .edit(allowRoleId, {

                ViewChannel: true,

                // 🔒 / 🔓 ใช้ค่าจาก data.locked
                Connect: !data.locked

            })
            .catch(() => {});
    }

    // ==================================================
    // 🙈 ตอนซ่อน ให้ยศใหญ่ยังมองเห็น
    // ==================================================

    for (const roleId of bigRoleIds) {

        await channel.permissionOverwrites
            .edit(roleId, {

                ViewChannel: true,

                // ถ้าล็อกอยู่ก็เข้าไม่ได้
                Connect: !data.locked

            })
            .catch(() => {});
    }

    // ==================================================
    // 👑 เจ้าของห้อง
    // ==================================================

    await channel.permissionOverwrites
        .edit(data.owner, {

            ViewChannel: true,
            Connect: true

        })
        .catch(() => {});

    // ==================================================
    // 🧑‍🤝‍🧑 สมาชิกที่ Allow
    // ==================================================

    for (const userId of data.allowedUsers) {

        // ถ้าห้อง Lock คนที่ Allow ก็ยังเข้าไม่ได้
        await channel.permissionOverwrites
            .edit(userId, {

                ViewChannel: true,
                Connect: !data.locked

            })
            .catch(() => {});
    }

    // ==================================================
    // 🤖 BOT
    // ==================================================

    await channel.permissionOverwrites
        .edit(client.user.id, {

            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MoveMembers: true

        })
        .catch(() => {});
}

// ======================================================
// 📜 SLASH COMMAND
// ======================================================

const commands = [

    new SlashCommandBuilder()
        .setName("room")
        .setDescription("เปิดแผงควบคุมห้องส่วนตัว")
        .setDMPermission(false)

].map(command => command.toJSON());

// ======================================================
// 🔄 REST
// ======================================================

const rest = new REST({
    version: "10"
}).setToken(token);

// ======================================================
// 🤖 BOT READY
// ======================================================

client.once("ready", async () => {

    console.log("");
    console.log("================================");
    console.log(`✅ Login as: ${client.user.tag}`);
    console.log("================================");

    try {

        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: commands
            }
        );

        console.log("🚀 ติดตั้ง /room เรียบร้อยแล้ว");

    } catch (error) {

        console.error(
            "❌ ไม่สามารถติดตั้ง Slash Command:",
            error
        );

    }
});

// ======================================================
// 🎙️ VOICE STATE UPDATE
// ======================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

    try {

        // ==================================================
        // 🏠 สมาชิกเข้าห้องสร้างห้อง
        // ==================================================

        if (
            newState.channelId === createChannelId &&
            oldState.channelId !== createChannelId
        ) {

            const guild = newState.guild;
            const ownerId = newState.member.id;

            // ==================================================
            // 🔐 Permission ตอนสร้างห้อง
            // ==================================================

            const permissionOverwrites = [

                // @everyone
                {
                    id: guild.id,

                    allow: [
                        "ViewChannel"
                    ],

                    deny: [
                        "Connect"
                    ]
                },

                // เจ้าของ
                {
                    id: ownerId,

                    allow: [
                        "ViewChannel",
                        "Connect"
                    ]
                },

                // Bot
                {
                    id: client.user.id,

                    allow: [
                        "ViewChannel",
                        "Connect",
                        "ManageChannels",
                        "MoveMembers"
                    ]
                }

            ];

            // ==================================================
            // 👑 ยศพิเศษ
            // ==================================================

            if (allowRoleId) {

                permissionOverwrites.push({

                    id: allowRoleId,

                    allow: [
                        "ViewChannel",
                        "Connect"
                    ]

                });
            }

            // ==================================================
            // 🏠 สร้างห้อง
            // ==================================================

            const channel = await guild.channels.create({

                name:
                    `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,

                type:
                    ChannelType.GuildVoice,

                parent:
                    categoryId,

                permissionOverwrites

            });

            // ==================================================
            // 🚶 ย้ายสมาชิกเข้า
            // ==================================================

            await newState
                .setChannel(channel)
                .catch(() => {});

            // ==================================================
            // 💾 บันทึกข้อมูล
            // ==================================================

            tempChannels.set(channel.id, {

                owner: ownerId,

                // 🔓 เริ่มต้นปลดล็อก
                locked: false,

                // 👁️ เริ่มต้นแสดง
                hidden: false,

                // สมาชิกที่ Allow
                allowedUsers: new Set()

            });

            console.log(
                `🏠 สร้างห้อง ${channel.name} | Owner: ${ownerId}`
            );

            return;
        }

        // ==================================================
        // 🗑️ ตรวจสอบห้องชั่วคราวตอนมีคนออก
        // ==================================================

        if (
            oldState.channelId &&
            tempChannels.has(oldState.channelId)
        ) {

            const channel = await oldState.guild.channels
                .fetch(oldState.channelId)
                .catch(() => null);

            if (!channel) {

                tempChannels.delete(
                    oldState.channelId
                );

                return;
            }

            // ==================================================
            // ถ้าไม่มีคนแล้วลบ
            // ==================================================

            if (channel.members.size === 0) {

                await channel
                    .delete()
                    .catch(() => {});

                tempChannels.delete(
                    oldState.channelId
                );

                console.log(
                    `🗑️ ลบห้อง ${channel.name}`
                );

            }
        }

    } catch (error) {

        console.error(
            "❌ voiceStateUpdate Error:",
            error
        );

    }

});

// ======================================================
// 🎛️ INTERACTION CREATE
// ======================================================

client.on("interactionCreate", async interaction => {

    try {

        // ==================================================
        // /room
        // ==================================================

        if (
            interaction.isChatInputCommand() &&
            interaction.commandName === "room"
        ) {

            const embed = new EmbedBuilder()

                .setTitle(
                    "🏠 ระบบสร้างห้องส่วนตัวประจำโซน"
                )

                .setDescription(
                    [
                        "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว",
                        "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ",
                        "",
                        "🔒 **Lock** — ล็อกไม่ให้สมาชิกเข้าห้อง",
                        "🔓 **Unlock** — ปลดล็อกให้สมาชิกเข้าห้อง",
                        "🙈 **Hide** — ซ่อนห้อง",
                        "👁️ **Show** — แสดงห้อง",
                        "",
                        "📌 **หมายเหตุ:**",
                        "สมาชิกที่มียศพิเศษจะสามารถเข้าห้องได้ตามสิทธิ์ที่กำหนด"
                    ].join("\n")
                )

                .setFooter({
                    text:
                        "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
                })

                .setColor(0x2b2d31);

            // ==================================================
            // รูปภาพจาก ENV
            // ==================================================

            if (panelImageUrl) {

                embed.setImage(
                    panelImageUrl
                );

            }

            // ==================================================
            // ROW 1
            // ==================================================

            const row1 =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId("name")
                            .setEmoji("✏️")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("lock")
                            .setEmoji("🔒")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("unlock")
                            .setEmoji("🔓")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("limit")
                            .setEmoji("🎯")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("owner")
                            .setEmoji("👑")
                            .setStyle(
                                ButtonStyle.Secondary
                            )

                    );

            // ==================================================
            // ROW 2
            // ==================================================

            const row2 =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId("hide")
                            .setEmoji("🙈")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("show")
                            .setEmoji("👁️")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("transfer")
                            .setEmoji("🔁")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("allow")
                            .setEmoji("🧑‍🤝‍🧑")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("deny")
                            .setEmoji("🚫")
                            .setStyle(
                                ButtonStyle.Secondary
                            )

                    );

            // ==================================================
            // ส่ง Panel
            // ==================================================

            await interaction.channel.send({

                embeds: [
                    embed
                ],

                components: [
                    row1,
                    row2
                ]

            });

            // ==================================================
            // ตอบแบบ Ephemeral
            // ==================================================

            await interaction.reply({

                content:
                    "✅ สร้างแผงควบคุมเรียบร้อยแล้ว",

                ephemeral: true

            });

            return;
        }

        // ==================================================
        // 🔘 BUTTONS
        // ==================================================

        if (interaction.isButton()) {

            const member =
                interaction.member;

            const channel =
                member.voice.channel;

            // ==================================================
            // ต้องอยู่ในห้องเสียง
            // ==================================================

            if (!channel) {

                return interaction.reply({

                    content:
                        "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

                    ephemeral: true

                });

            }

            // ==================================================
            // ตรวจสอบว่าเป็นห้องระบบหรือไม่
            // ==================================================

            const data =
                tempChannels.get(channel.id);

            if (!data) {

                return interaction.reply({

                    content:
                        "❌ ห้องนี้ไม่ได้อยู่ในระบบห้องส่วนตัว",

                    ephemeral: true

                });

            }

            // ==================================================
            // 👑 OWNER
            // ==================================================

            if (
                interaction.customId === "owner"
            ) {

                const ownerMember =
                    interaction.guild.members.cache.get(
                        data.owner
                    );

                return interaction.reply({

                    embeds: [

                        new EmbedBuilder()

                            .setTitle(
                                "👑 เจ้าของห้อง"
                            )

                            .setDescription(
                                `เจ้าของห้องปัจจุบันคือ: <@${data.owner}>`
                            )

                            .setColor(
                                0xFFD700
                            )

                            .setThumbnail(
                                ownerMember
                                    ? ownerMember.user.displayAvatarURL()
                                    : null
                            )

                    ],

                    ephemeral: true

                });

            }

            // ==================================================
            // 🛡️ ตรวจสอบ OWNER
            // ==================================================

            if (
                data.owner !== member.id
            ) {

                return interaction.reply({

                    content:
                        "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ ไม่สามารถสั่งการได้",

                    ephemeral: true

                });

            }

            // ==================================================
            // ✏️ NAME
            // ==================================================

            if (
                interaction.customId === "name"
            ) {

                const modal =
                    new ModalBuilder()

                        .setCustomId(
                            "rename_room"
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

                        .setMaxLength(100);

                modal.addComponents(

                    new ActionRowBuilder()
                        .addComponents(
                            input
                        )

                );

                return interaction.showModal(
                    modal
                );

            }

            // ==================================================
            // 🎯 LIMIT
            // ==================================================

            if (
                interaction.customId === "limit"
            ) {

                const modal =
                    new ModalBuilder()

                        .setCustomId(
                            "limit_room"
                        )

                        .setTitle(
                            "ตั้งจำนวนคน"
                        );

                const input =
                    new TextInputBuilder()

                        .setCustomId(
                            "limit_input"
                        )

                        .setLabel(
                            "ใส่จำนวนคน (0 = ไม่จำกัด)"
                        )

                        .setStyle(
                            TextInputStyle.Short
                        )

                        .setRequired(true)

                        .setMaxLength(2);

                modal.addComponents(

                    new ActionRowBuilder()
                        .addComponents(
                            input
                        )

                );

                return interaction.showModal(
                    modal
                );

            }

            // ==================================================
            // 👥 SELECT MENU
            // ==================================================

            if (
                [
                    "allow",
                    "deny",
                    "transfer"
                ].includes(
                    interaction.customId
                )
            ) {

                const menu =
                    new UserSelectMenuBuilder()

                        .setCustomId(
                            `select_${interaction.customId}`
                        )

                        .setPlaceholder(
                            "เลือกสมาชิกที่ต้องการ..."
                        )

                        .setMinValues(1)

                        .setMaxValues(1);

                return interaction.reply({

                    content:
                        "🎯 โปรดเลือกสมาชิกจากเมนูด้านล่าง",

                    components: [

                        new ActionRowBuilder()
                            .addComponents(
                                menu
                            )

                    ],

                    ephemeral: true

                });

            }

            // ==================================================
            // defer สำหรับ Lock / Unlock / Hide / Show
            // ==================================================

            await interaction.deferReply({
                ephemeral: true
            });

            // ==================================================
            // 🔒 LOCK
            // ==================================================

            if (
                interaction.customId === "lock"
            ) {

                // ⭐ จำค่า Lock
                data.locked = true;

                await applyRoomState(
                    channel,
                    data
                );

                return interaction.editReply({

                    content:
                        "🔒 ล็อกห้องเรียบร้อยแล้ว"

                });

            }

            // ==================================================
            // 🔓 UNLOCK
            // ==================================================

            if (
                interaction.customId === "unlock"
            ) {

                // ⭐ จำค่า Unlock
                data.locked = false;

                await applyRoomState(
                    channel,
                    data
                );

                return interaction.editReply({

                    content:
                        "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"

                });

            }

            // ==================================================
            // 🙈 HIDE
            // ==================================================

            if (
                interaction.customId === "hide"
            ) {

                // ⭐ จำค่า Hide
                data.hidden = true;

                /*
                    สำคัญมาก:

                    ตรงนี้ไม่ได้แก้ data.locked

                    ถ้าเดิม Lock:
                        locked = true

                    ก็ยังเป็น:
                        locked = true

                    ถ้าเดิม Unlock:
                        locked = false

                    ก็ยังเป็น:
                        locked = false
                */

                await applyRoomState(
                    channel,
                    data
                );

                return interaction.editReply({

                    content:
                        data.locked

                            ? "🙈 ซ่อนห้องเรียบร้อยแล้ว 🔒 ห้องยังล็อกอยู่"

                            : "🙈 ซ่อนห้องเรียบร้อยแล้ว 🔓 ห้องยังปลดล็อกอยู่"

                });

            }

            // ==================================================
            // 👁️ SHOW
            // ==================================================

            if (
                interaction.customId === "show"
            ) {

                // ⭐ จำค่า Show
                data.hidden = false;

                /*
                    สำคัญที่สุด:

                    Show จะไม่กำหนด Lock เอง

                    แต่จะอ่าน:
                        data.locked

                    ถ้า true:
                        🔒 Connect = false

                    ถ้า false:
                        🔓 Connect = true
                */

                await applyRoomState(
                    channel,
                    data
                );

                return interaction.editReply({

                    content:
                        data.locked

                            ? "👁️ แสดงห้องเรียบร้อยแล้ว 🔒 ห้องยังล็อกอยู่"

                            : "👁️ แสดงห้องเรียบร้อยแล้ว 🔓 ห้องปลดล็อกอยู่"

                });

            }

        }

        // ==================================================
        // 👥 USER SELECT MENU
        // ==================================================

        if (
            interaction.isUserSelectMenu()
        ) {

            const channel =
                interaction.member.voice.channel;

            if (!channel) {

                return interaction.reply({

                    content:
                        "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

                    ephemeral: true

                });

            }

            const data =
                tempChannels.get(channel.id);

            if (
                !data ||
                data.owner !== interaction.member.id
            ) {

                return interaction.reply({

                    content:
                        "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของเท่านั้น",

                    ephemeral: true

                });

            }

            const targetId =
                interaction.values[0];

            // ==================================================
            // 🧑‍🤝‍🧑 ALLOW
            // ==================================================

            if (
                interaction.customId ===
                "select_allow"
            ) {

                data.allowedUsers.add(
                    targetId
                );

                await channel.permissionOverwrites
                    .edit(
                        targetId,
                        {
                            ViewChannel: true,

                            // ถ้าห้อง Lock อยู่
                            // คนนี้ยังเข้าไม่ได้
                            Connect:
                                !data.locked
                        }
                    )
                    .catch(() => {});

                return interaction.reply({

                    content:
                        data.locked

                            ? `✅ อนุญาตให้ <@${targetId}> มองเห็นห้องแล้ว แต่ห้องยัง 🔒 ล็อกอยู่`

                            : `✅ อนุญาตให้ <@${targetId}> มองเห็นและเข้าห้องได้แล้ว`,

                    ephemeral: true

                });

            }

            // ==================================================
            // 🚫 DENY
            // ==================================================

            if (
                interaction.customId ===
                "select_deny"
            ) {

                data.allowedUsers.delete(
                    targetId
                );

                await channel.permissionOverwrites
                    .edit(
                        targetId,
                        {
                            ViewChannel: false,
                            Connect: false
                        }
                    )
                    .catch(() => {});

                // ถ้าอยู่ในห้อง ให้เตะออก
                const targetMember =
                    channel.members.get(
                        targetId
                    );

                if (targetMember) {

                    await targetMember.voice
                        .disconnect()
                        .catch(() => {});

                }

                return interaction.reply({

                    content:
                        `🚫 บล็อก <@${targetId}> ไม่ให้เข้าห้องเรียบร้อยแล้ว`,

                    ephemeral: true

                });

            }

            // ==================================================
            // 🔁 TRANSFER OWNER
            // ==================================================

            if (
                interaction.customId ===
                "select_transfer"
            ) {

                const oldOwner =
                    data.owner;

                // เปลี่ยนเจ้าของ
                data.owner =
                    targetId;

                // เจ้าของเก่าไม่ใช่ Owner แล้ว
                await channel.permissionOverwrites
                    .edit(
                        oldOwner,
                        {
                            ViewChannel: true,
                            Connect:
                                !data.locked
                        }
                    )
                    .catch(() => {});

                // เจ้าของใหม่
                await channel.permissionOverwrites
                    .edit(
                        targetId,
                        {
                            ViewChannel: true,
                            Connect: true
                        }
                    )
                    .catch(() => {});

                const targetUser =
                    await client.users
                        .fetch(targetId)
                        .catch(() => null);

                if (targetUser) {

                    await channel
                        .setName(
                            `📍・ห้องส่วนตัวของ ${targetUser.username}`
                        )
                        .catch(() => {});

                }

                // เอาเจ้าของใหม่ออกจาก allowed
                data.allowedUsers.delete(
                    targetId
                );

                return interaction.reply({

                    content:
                        `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้วครับ`,

                    ephemeral: true

                });

            }

        }

        // ==================================================
        // 📝 MODAL SUBMIT
        // ==================================================

        if (
            interaction.isModalSubmit()
        ) {

            const channel =
                interaction.member.voice.channel;

            if (!channel) {

                return interaction.reply({

                    content:
                        "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

                    ephemeral: true

                });

            }

            const data =
                tempChannels.get(channel.id);

            if (
                !data ||
                data.owner !== interaction.member.id
            ) {

                return interaction.reply({

                    content:
                        "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของเท่านั้น",

                    ephemeral: true

                });

            }

            // ==================================================
            // ✏️ RENAME
            // ==================================================

            if (
                interaction.customId ===
                "rename_room"
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

                        ephemeral: true

                    });

                }

                await channel
                    .setName(name)
                    .catch(() => {});

                return interaction.reply({

                    content:
                        `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`,

                    ephemeral: true

                });

            }

            // ==================================================
            // 🎯 LIMIT
            // ==================================================

            if (
                interaction.customId ===
                "limit_room"
            ) {

                const limitInput =
                    interaction.fields
                        .getTextInputValue(
                            "limit_input"
                        )
                        .trim();

                const limit =
                    Number(limitInput);

                if (
                    !Number.isInteger(limit) ||
                    limit < 0 ||
                    limit > 99
                ) {

                    return interaction.reply({

                        content:
                            "❌ โปรดใส่หมายเลขที่ถูกต้องระหว่าง 0 - 99",

                        ephemeral: true

                    });

                }

                await channel
                    .setUserLimit(limit)
                    .catch(() => {});

                return interaction.reply({

                    content:
                        limit === 0

                            ? "🎯 ตั้งจำนวนคนเป็น **ไม่จำกัด** เรียบร้อยแล้ว"

                            : `🎯 จำกัดจำนวนคนไว้ที่ **${limit} คน** เรียบร้อยแล้ว`,

                    ephemeral: true

                });

            }

        }

    } catch (error) {

        console.error(
            "❌ Interaction Error:",
            error
        );

        try {

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({

                    content:
                        "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง",

                    ephemeral: true

                });

            } else if (
                interaction.deferred
            ) {

                await interaction.editReply({

                    content:
                        "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง"

                });

            }

        } catch (replyError) {

            console.error(
                "Reply Error:",
                replyError
            );

        }

    }

});

// ======================================================
// 🚀 LOGIN
// ======================================================

client.login(token);
