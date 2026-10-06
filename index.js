const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");

const express = require("express");


// =====================================================
// CONFIG
// =====================================================

const TOKEN = process.env.TOKEN;

const CREATE_CHANNEL_ID = process.env.CREATE_CHANNEL_ID;

const CATEGORY_ID = process.env.CATEGORY_ID;

const ALLOW_ROLE_ID = process.env.ALLOW_ROLE_ID
    ? process.env.ALLOW_ROLE_ID
        .split(",")
        .map(id => id.trim())
        .filter(Boolean)
    : [];


// =====================================================
// CLIENT
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});


// =====================================================
// EXPRESS SERVER
// =====================================================

const app = express();

app.get("/", (req, res) => {
    res.send("Bot is Online!");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});


// =====================================================
// TEMP DATA
// =====================================================

// channelId -> {
//     owner: userId,
//     savedPermissions?: []
// }

const tempChannels = new Map();

// userId -> ชื่อห้องที่บันทึกไว้
const savedRoomNames = new Map();


// =====================================================
// ROLE ที่สามารถเข้าห้องได้
// =====================================================

const bigRoleIds = [
    "1502362111345426432",
    "1546873993334890577",
    "1500549655107469535",
    "1492931714887192739",
    "1555616129513164972",
    "1492931717437063342",
    "1492931719832014978",
    "1492931721384038480",
    "1555519802486030346",
    "1501857544400932904",
    "1492931725129683124",
    "1493650662624592032",
    "1492931723330064425",
    "1556184437195280515"
];


// =====================================================
// HELPER
// =====================================================

function getErrorMessage(error) {

    return (
        error?.rawError?.message ||
        error?.message ||
        "ไม่ทราบสาเหตุ"
    );

}


// =====================================================
// ตรวจสอบห้องส่วนตัว + เจ้าของ
// =====================================================

function getOwnedTempRoom(interaction) {

    const member = interaction.member;

    if (!member) {
        return null;
    }

    const voiceChannel = member.voice?.channel;

    if (!voiceChannel) {
        return null;
    }

    const data = tempChannels.get(
        voiceChannel.id
    );

    if (!data) {
        return null;
    }

    if (data.owner !== member.id) {
        return null;
    }

    return {
        channel: voiceChannel,
        data
    };

}


// =====================================================
// ชื่อห้องเริ่มต้น
// =====================================================

function getDefaultRoomName(username) {

    return `ห้องส่วนตัวของ ${username}`;

}


// =====================================================
// BOT READY
// =====================================================

client.once("clientReady", async () => {

    console.log(
        `Logged in as ${client.user.tag}`
    );

    try {

        const commands = [

            new SlashCommandBuilder()
                .setName("room")
                .setDescription(
                    "เปิดเมนูจัดการห้องส่วนตัว"
                )
                .toJSON()

        ];


        const rest = new REST({
            version: "10"
        }).setToken(TOKEN);


        await rest.put(
            Routes.applicationCommands(
                client.user.id
            ),
            {
                body: commands
            }
        );


        console.log(
            "Slash command registered successfully"
        );


        console.log(
            "======================================"
        );

        console.log(
            "Your service is live 🎉"
        );

        console.log(
            "======================================"
        );

    } catch (error) {

        console.error(
            "Slash command registration error:",
            error
        );

    }

});


// =====================================================
// SLASH COMMAND /ROOM
// =====================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        if (
            interaction.commandName !== "room"
        ) {
            return;
        }

        try {

            const embed = new EmbedBuilder()

                .setTitle(
                    "จัดการห้องส่วนตัว"
                )

                .setDescription(
                    [
                        "ใช้ปุ่มด้านล่างเพื่อจัดการห้องส่วนตัวของคุณ",
                        "",
                        "✏️ เปลี่ยนชื่อห้อง",
                        "🔒 ล็อกห้อง",
                        "🔓 ปลดล็อกห้อง",
                        "🎯 จำกัดจำนวนสมาชิก",
                        "👑 ดูเจ้าของห้อง",
                        "🙈 ซ่อนห้อง",
                        "👁 แสดงห้อง",
                        "🔁 โอนเจ้าของห้อง",
                        "🧑‍🤝‍🧑 อนุญาตสมาชิก",
                        "🚫 ปฏิเสธสมาชิก"
                    ].join("\n")
                )

                .setColor(0x5865F2)

                .setImage(
                    "https://i.ibb.co/Kjbw5BGb/image.png"
                );


            const row1 =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                "room_name"
                            )
                            .setLabel("ชื่อ")
                            .setEmoji("✏️")
                            .setStyle(
                                ButtonStyle.Primary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                "room_lock"
                            )
                            .setLabel("ล็อก")
                            .setEmoji("🔒")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                "room_unlock"
                            )
                            .setLabel("ปลดล็อก")
                            .setEmoji("🔓")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                "room_limit"
                            )
                            .setLabel("จำกัด")
                            .setEmoji("🎯")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                "room_owner"
                            )
                            .setLabel("เจ้าของ")
                            .setEmoji("👑")
                            .setStyle(
                                ButtonStyle.Secondary
                            )

                    );


            const row2 =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId(
                                "room_hide"
                            )
                            .setLabel("ซ่อน")
                            .setEmoji("🙈")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                "room_show"
                            )
                            .setLabel("แสดง")
                            .setEmoji("👁")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                "room_transfer"
                            )
                            .setLabel("โอน")
                            .setEmoji("🔁")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                "room_allow"
                            )
                            .setLabel("อนุญาต")
                            .setEmoji("🧑‍🤝‍🧑")
                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()
                            .setCustomId(
                                "room_deny"
                            )
                            .setLabel("ปฏิเสธ")
                            .setEmoji("🚫")
                            .setStyle(
                                ButtonStyle.Danger
                            )

                    );


            await interaction.reply({
                embeds: [
                    embed
                ],
                components: [
                    row1,
                    row2
                ]
            });


        } catch (error) {

            console.error(
                "ROOM COMMAND ERROR:",
                error
            );

        }

    }
);


// =====================================================
// VOICE STATE
// =====================================================

client.on(
    "voiceStateUpdate",
    async (oldState, newState) => {

        try {

            const member =
                newState.member;

            if (!member) {
                return;
            }


            // =================================================
            // เข้าห้อง CREATE
            // =================================================

            if (
                newState.channelId ===
                    CREATE_CHANNEL_ID &&
                oldState.channelId !==
                    CREATE_CHANNEL_ID
            ) {

                const guild =
                    newState.guild;


                // -------------------------------------------------
                // ชื่อห้อง
                // -------------------------------------------------

                const roomName =
                    savedRoomNames.get(
                        member.id
                    ) ||
                    getDefaultRoomName(
                        member.user.username
                    );


                // -------------------------------------------------
                // Permission
                // -------------------------------------------------

                const permissionOverwrites = [

                    {
                        id:
                            guild.roles.everyone.id,

                        allow: [
                            PermissionFlagsBits.ViewChannel
                        ],

                        deny: [
                            PermissionFlagsBits.Connect
                        ]
                    },

                    {
                        id:
                            member.id,

                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect
                        ]
                    },

                    {
                        id:
                            client.user.id,

                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.MoveMembers
                        ]
                    }

                ];


                // -------------------------------------------------
                // Big Roles
                // -------------------------------------------------

                for (
                    const roleId
                    of bigRoleIds
                ) {

                    if (
                        !guild.roles.cache.has(
                            roleId
                        )
                    ) {
                        continue;
                    }


                    permissionOverwrites.push({

                        id: roleId,

                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect
                        ]

                    });

                }


                // -------------------------------------------------
                // Allow Roles
                // -------------------------------------------------

                for (
                    const roleId
                    of ALLOW_ROLE_ID
                ) {

                    if (
                        !guild.roles.cache.has(
                            roleId
                        )
                    ) {
                        continue;
                    }


                    permissionOverwrites.push({

                        id: roleId,

                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect
                        ]

                    });

                }


                // -------------------------------------------------
                // สร้างห้อง
                // -------------------------------------------------

                const channel =
                    await guild.channels.create({

                        name: roomName,

                        type:
                            ChannelType.GuildVoice,

                        parent:
                            CATEGORY_ID,

                        permissionOverwrites

                    });


                // -------------------------------------------------
                // บันทึกห้อง
                // -------------------------------------------------

                tempChannels.set(
                    channel.id,
                    {
                        owner:
                            member.id
                    }
                );


                // -------------------------------------------------
                // ย้ายสมาชิกเข้าห้อง
                // -------------------------------------------------

                await member.voice.setChannel(
                    channel
                );


                console.log(
                    `Created temp room: ${channel.name} | Owner: ${member.user.tag}`
                );

            }


            // =================================================
            // ลบห้องเมื่อไม่มีคน
            // =================================================

            if (oldState.channelId) {

                const oldChannel =
                    oldState.guild.channels.cache.get(
                        oldState.channelId
                    );


                if (
                    oldChannel &&
                    tempChannels.has(
                        oldChannel.id
                    ) &&
                    oldChannel.members.size === 0
                ) {

                    tempChannels.delete(
                        oldChannel.id
                    );


                    try {

                        await oldChannel.delete(
                            "Temporary room is empty"
                        );


                        console.log(
                            `Deleted temp room: ${oldChannel.name}`
                        );

                    } catch (error) {

                        console.error(
                            "Delete temp room error:",
                            error
                        );

                    }

                }

            }

        } catch (error) {

            console.error(
                "VOICE STATE ERROR:",
                error
            );

        }

    }
);


// =====================================================
// BUTTON HANDLER
// =====================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isButton()) {
            return;
        }


        try {

            const member =
                interaction.member;


            const voiceChannel =
                member?.voice?.channel;


            // =================================================
            // ดูเจ้าของห้อง
            // =================================================

            if (
                interaction.customId ===
                "room_owner"
            ) {

                if (!voiceChannel) {

                    return await interaction.reply({

                        content:
                            "❌ คุณต้องอยู่ในห้องส่วนตัวก่อน",

                        ephemeral: true

                    });

                }


                const data =
                    tempChannels.get(
                        voiceChannel.id
                    );


                if (!data) {

                    return await interaction.reply({

                        content:
                            "❌ ห้องนี้ไม่ใช่ห้องส่วนตัวของระบบ",

                        ephemeral: true

                    });

                }


                return await interaction.reply({

                    content:
                        `👑 เจ้าของห้องคือ <@${data.owner}>`,

                    ephemeral: true

                });

            }


            // =================================================
            // ตรวจสอบเจ้าของ
            // =================================================

            const room =
                getOwnedTempRoom(
                    interaction
                );


            if (!room) {

                return await interaction.reply({

                    content:
                        "❌ คุณต้องอยู่ในห้องส่วนตัวและต้องเป็นเจ้าของห้อง",

                    ephemeral: true

                });

            }


            const {
                channel,
                data
            } = room;


            // =================================================
            // เปลี่ยนชื่อ
            // =================================================

            if (
                interaction.customId ===
                "room_name"
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

                        .setPlaceholder(
                            "เว้นว่างแล้วกดส่ง = รีเซ็ตชื่อเริ่มต้น"
                        )

                        .setStyle(
                            TextInputStyle.Short
                        )

                        .setRequired(false)

                        .setMaxLength(100);


                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            input
                        );


                modal.addComponents(
                    row
                );


                return await interaction.showModal(
                    modal
                );

            }


            // =================================================
            // ล็อก
            // =================================================

            if (
                interaction.customId ===
                "room_lock"
            ) {

                await channel.permissionOverwrites.edit(

                    interaction.guild.roles.everyone.id,

                    {
                        Connect: false
                    }

                );


                return await interaction.reply({

                    content:
                        "🔒 ล็อกห้องเรียบร้อยแล้ว",

                    ephemeral: true

                });

            }


            // =================================================
            // ปลดล็อก
            // =================================================

            if (
                interaction.customId ===
                "room_unlock"
            ) {

                await channel.permissionOverwrites.edit(

                    interaction.guild.roles.everyone.id,

                    {
                        Connect: true
                    }

                );


                return await interaction.reply({

                    content:
                        "🔓 ปลดล็อกห้องเรียบร้อยแล้ว",

                    ephemeral: true

                });

            }


            // =================================================
            // จำกัดจำนวนคน
            // =================================================

            if (
                interaction.customId ===
                "room_limit"
            ) {

                const modal =
                    new ModalBuilder()

                        .setCustomId(
                            "limit_room"
                        )

                        .setTitle(
                            "จำกัดจำนวนสมาชิก"
                        );


                const input =
                    new TextInputBuilder()

                        .setCustomId(
                            "room_limit"
                        )

                        .setLabel(
                            "จำนวนสมาชิก"
                        )

                        .setPlaceholder(
                            "0 = ไม่จำกัด"
                        )

                        .setStyle(
                            TextInputStyle.Short
                        )

                        .setRequired(true)

                        .setMaxLength(2);


                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            input
                        );


                modal.addComponents(
                    row
                );


                return await interaction.showModal(
                    modal
                );

            }


            // =================================================
            // ซ่อนห้อง
            // =================================================

            if (
                interaction.customId ===
                "room_hide"
            ) {

                const savedPermissions = [];


                for (
                    const overwrite
                    of channel.permissionOverwrites.cache.values()
                ) {

                    savedPermissions.push({

                        id:
                            overwrite.id,

                        type:
                            overwrite.type,

                        allow:
                            overwrite.allow.bitfield.toString(),

                        deny:
                            overwrite.deny.bitfield.toString()

                    });

                }


                data.savedPermissions =
                    savedPermissions;


                await channel.permissionOverwrites.set([

                    {
                        id:
                            interaction.guild.roles.everyone.id,

                        deny: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect
                        ]
                    },

                    {
                        id:
                            interaction.client.user.id,

                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.MoveMembers
                        ]
                    },

                    {
                        id:
                            data.owner,

                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.Connect
                        ]
                    }

                ]);


                return await interaction.reply({

                    content:
                        "🙈 ซ่อนห้องเรียบร้อยแล้ว",

                    ephemeral: true

                });

            }


            // =================================================
            // แสดงห้อง
            // =================================================

            if (
                interaction.customId ===
                "room_show"
            ) {

                if (
                    !data.savedPermissions
                ) {

                    return await interaction.reply({

                        content:
                            "❌ ยังไม่มีข้อมูลสิทธิ์ก่อนซ่อนห้อง",

                        ephemeral: true

                    });

                }


                await channel.permissionOverwrites.set(

                    data.savedPermissions.map(
                        overwrite => ({

                            id:
                                overwrite.id,

                            type:
                                overwrite.type,

                            allow:
                                BigInt(
                                    overwrite.allow
                                ),

                            deny:
                                BigInt(
                                    overwrite.deny
                                )

                        })
                    )

                );


                delete data.savedPermissions;


                return await interaction.reply({

                    content:
                        "👁 แสดงห้องเรียบร้อยแล้ว",

                    ephemeral: true

                });

            }


            // =================================================
            // โอนเจ้าของ
            // =================================================

            if (
                interaction.customId ===
                "room_transfer"
            ) {

                const menu =
                    new UserSelectMenuBuilder()

                        .setCustomId(
                            "transfer_owner"
                        )

                        .setPlaceholder(
                            "เลือกสมาชิกที่จะเป็นเจ้าของห้อง"
                        )

                        .setMinValues(1)

                        .setMaxValues(1);


                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            menu
                        );


                return await interaction.reply({

                    content:
                        "🔁 เลือกเจ้าของห้องคนใหม่",

                    components: [
                        row
                    ],

                    ephemeral: true

                });

            }


            // =================================================
            // อนุญาต
            // =================================================

            if (
                interaction.customId ===
                "room_allow"
            ) {

                const menu =
                    new UserSelectMenuBuilder()

                        .setCustomId(
                            "allow_member"
                        )

                        .setPlaceholder(
                            "เลือกสมาชิกที่อนุญาต"
                        )

                        .setMinValues(1)

                        .setMaxValues(1);


                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            menu
                        );


                return await interaction.reply({

                    content:
                        "🧑‍🤝‍🧑 เลือกสมาชิกที่ต้องการอนุญาต",

                    components: [
                        row
                    ],

                    ephemeral: true

                });

            }


            // =================================================
            // ปฏิเสธ
            // =================================================

            if (
                interaction.customId ===
                "room_deny"
            ) {

                const menu =
                    new UserSelectMenuBuilder()

                        .setCustomId(
                            "deny_member"
                        )

                        .setPlaceholder(
                            "เลือกสมาชิกที่ต้องการปฏิเสธ"
                        )

                        .setMinValues(1)

                        .setMaxValues(1);


                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            menu
                        );


                return await interaction.reply({

                    content:
                        "🚫 เลือกสมาชิกที่ต้องการปฏิเสธ",

                    components: [
                        row
                    ],

                    ephemeral: true

                });

            }


        } catch (error) {

            console.error(
                "BUTTON ERROR:",
                error
            );


            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({

                    content:
                        `❌ เกิดข้อผิดพลาด\n${getErrorMessage(error)}`,

                    ephemeral: true

                }).catch(() => {});

            }

        }

    }
);


// =====================================================
// USER SELECT MENU
// =====================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isUserSelectMenu()) {
            return;
        }


        try {

            const member =
                interaction.member;


            const channel =
                member?.voice?.channel;


            if (!channel) {

                return await interaction.update({

                    content:
                        "❌ คุณไม่ได้อยู่ในห้องส่วนตัว",

                    components: []

                });

            }


            const data =
                tempChannels.get(
                    channel.id
                );


            if (!data) {

                return await interaction.update({

                    content:
                        "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",

                    components: []

                });

            }


            if (
                data.owner !==
                member.id
            ) {

                return await interaction.update({

                    content:
                        "❌ คุณไม่ใช่เจ้าของห้องนี้",

                    components: []

                });

            }


            const targetId =
                interaction.values[0];


            // =================================================
            // TRANSFER
            // =================================================

            if (
                interaction.customId ===
                "transfer_owner"
            ) {

                if (
                    targetId ===
                    member.id
                ) {

                    return await interaction.update({

                        content:
                            "❌ คนนี้เป็นเจ้าของห้องอยู่แล้ว",

                        components: []

                    });

                }


                const oldOwnerId =
                    data.owner;


                // -------------------------------------------------
                // เก็บชื่อห้องปัจจุบัน
                // -------------------------------------------------

                const currentRoomName =
                    channel.name;


                // -------------------------------------------------
                // เปลี่ยนเจ้าของทันที
                // -------------------------------------------------

                data.owner =
                    targetId;


                // -------------------------------------------------
                // ให้ชื่อปัจจุบันติดกับเจ้าของใหม่
                // -------------------------------------------------

                savedRoomNames.set(
                    targetId,
                    currentRoomName
                );


                // -------------------------------------------------
                // ลบชื่อของเจ้าของเก่า
                // -------------------------------------------------

                savedRoomNames.delete(
                    oldOwnerId
                );


                // -------------------------------------------------
                // ให้สิทธิ์เจ้าของใหม่
                // -------------------------------------------------

                await channel.permissionOverwrites.edit(

                    targetId,

                    {
                        ViewChannel: true,
                        Connect: true
                    }

                );


                console.log(
                    `TRANSFER: ${oldOwnerId} -> ${targetId}`
                );


                return await interaction.update({

                    content:
                        `✅ โอนเจ้าของห้องเรียบร้อยแล้ว\n` +
                        `👑 เจ้าของใหม่: <@${targetId}>\n` +
                        `🏠 ห้อง: ${channel.name}`,

                    components: []

                });

            }


            // =================================================
            // ALLOW
            // =================================================

            if (
                interaction.customId ===
                "allow_member"
            ) {

                await channel.permissionOverwrites.edit(

                    targetId,

                    {
                        ViewChannel: true,
                        Connect: true
                    }

                );


                return await interaction.update({

                    content:
                        `🧑‍🤝‍🧑 อนุญาต <@${targetId}> เข้าห้องเรียบร้อยแล้ว`,

                    components: []

                });

            }


            // =================================================
            // DENY
            // =================================================

            if (
                interaction.customId ===
                "deny_member"
            ) {

                await channel.permissionOverwrites.edit(

                    targetId,

                    {
                        Connect: false
                    }

                );


                const targetMember =
                    interaction.guild.members.cache.get(
                        targetId
                    );


                if (
                    targetMember &&
                    targetMember.voice?.channelId ===
                        channel.id
                ) {

                    await targetMember.voice
                        .disconnect(
                            "Denied by room owner"
                        )
                        .catch(() => {});

                }


                return await interaction.update({

                    content:
                        `🚫 ปฏิเสธ <@${targetId}> เรียบร้อยแล้ว`,

                    components: []

                });

            }


        } catch (error) {

            console.error(
                "SELECT MENU ERROR:",
                error
            );


            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.update({

                    content:
                        `❌ เกิดข้อผิดพลาด\n${getErrorMessage(error)}`,

                    components: []

                }).catch(() => {});

            }

        }

    }
);


// =====================================================
// MODAL SUBMIT
// =====================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isModalSubmit()) {
            return;
        }


        console.log(
            `MODAL RECEIVED: ${interaction.customId} | User: ${interaction.user.tag}`
        );


        // =================================================
        // RENAME ROOM
        // =================================================

        if (
            interaction.customId ===
            "rename_room"
        ) {

            try {

                // -------------------------------------------------
                // สำคัญมาก
                // ตอบ Interaction ทันที
                // -------------------------------------------------

                await interaction.deferReply({
                    ephemeral: true
                });


                const member =
                    interaction.member;


                // -------------------------------------------------
                // ต้องอยู่ในห้อง
                // -------------------------------------------------

                const voiceChannel =
                    member?.voice?.channel;


                if (!voiceChannel) {

                    return await interaction.editReply({

                        content:
                            "❌ คุณต้องอยู่ในห้องส่วนตัวก่อนจึงจะเปลี่ยนชื่อห้องได้"

                    });

                }


                console.log(
                    `Rename channel: ${voiceChannel.name} (${voiceChannel.id})`
                );


                // -------------------------------------------------
                // ตรวจสอบห้อง
                // -------------------------------------------------

                const data =
                    tempChannels.get(
                        voiceChannel.id
                    );


                if (!data) {

                    console.log(
                        `ไม่พบห้องใน tempChannels: ${voiceChannel.id}`
                    );


                    return await interaction.editReply({

                        content:
                            "❌ ห้องนี้ไม่ใช่ห้องส่วนตัวของระบบ\n" +
                            "กรุณาสร้างห้องใหม่แล้วลองอีกครั้ง"

                    });

                }


                console.log(
                    `Current owner: ${data.owner} | Current user: ${member.id}`
                );


                // -------------------------------------------------
                // ตรวจสอบเจ้าของ
                // -------------------------------------------------

                if (
                    data.owner !==
                    member.id
                ) {

                    return await interaction.editReply({

                        content:
                            "❌ คุณไม่ใช่เจ้าของห้องนี้"

                    });

                }


                // -------------------------------------------------
                // อ่านชื่อ
                // -------------------------------------------------

                let name = "";


                try {

                    name =
                        interaction.fields
                            .getTextInputValue(
                                "room_name"
                            )
                            ?.trim() || "";

                } catch (error) {

                    console.log(
                        "อ่านค่าชื่อห้องไม่ได้:",
                        error
                    );

                    name = "";

                }


                console.log(
                    `New room name: "${name}"`
                );


                // =================================================
                // RESET NAME
                // =================================================

                if (!name) {

                    console.log(
                        "กำลังรีเซ็ตชื่อห้อง..."
                    );


                    // -------------------------------------------------
                    // ใช้ username ของเจ้าของปัจจุบัน
                    // -------------------------------------------------

                    const defaultName =
                        getDefaultRoomName(
                            member.user.username
                        );


                    console.log(
                        `Default name: ${defaultName}`
                    );


                    // -------------------------------------------------
                    // เปลี่ยนชื่อ
                    // -------------------------------------------------

                    try {

                        await voiceChannel.setName(

                            defaultName,

                            "Reset temporary room name"

                        );

                    } catch (error) {

                        console.error(
                            "RESET NAME ERROR:",
                            error
                        );


                        return await interaction.editReply({

                            content:
                                `❌ ไม่สามารถรีเซ็ตชื่อห้องได้\n\n` +
                                `สาเหตุ: ${getErrorMessage(error)}`

                        });

                    }


                    // -------------------------------------------------
                    // ลบชื่อที่บันทึกไว้
                    // -------------------------------------------------

                    savedRoomNames.delete(
                        member.id
                    );


                    console.log(
                        `Reset room successfully: ${defaultName}`
                    );


                    return await interaction.editReply({

                        content:
                            `✅ รีเซ็ตชื่อห้องเรียบร้อยแล้ว\n` +
                            `🏠 ${defaultName}`

                    });

                }


                // =================================================
                // CHECK LENGTH
                // =================================================

                if (
                    name.length > 100
                ) {

                    return await interaction.editReply({

                        content:
                            "❌ ชื่อห้องยาวเกิน 100 ตัวอักษร"

                    });

                }


                // =================================================
                // RENAME
                // =================================================

                try {

                    await voiceChannel.setName(

                        name,

                        "Room owner changed room name"

                    );

                } catch (error) {

                    console.error(
                        "CHANGE NAME ERROR:",
                        error
                    );


                    return await interaction.editReply({

                        content:
                            `❌ ไม่สามารถเปลี่ยนชื่อห้องได้\n\n` +
                            `สาเหตุ: ${getErrorMessage(error)}`

                    });

                }


                // -------------------------------------------------
                // บันทึกหลังเปลี่ยนสำเร็จ
                // -------------------------------------------------

                savedRoomNames.set(
                    member.id,
                    name
                );


                console.log(
                    `Room renamed successfully: ${name}`
                );


                return await interaction.editReply({

                    content:
                        `✅ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`

                });


            } catch (error) {

                console.error(
                    "RENAME MODAL ERROR:",
                    error
                );


                try {

                    if (
                        interaction.deferred ||
                        interaction.replied
                    ) {

                        await interaction.editReply({

                            content:
                                `❌ เกิดข้อผิดพลาด\n\n` +
                                `รายละเอียด: ${getErrorMessage(error)}`

                        });

                    } else {

                        await interaction.reply({

                            content:
                                `❌ เกิดข้อผิดพลาด\n\n` +
                                `รายละเอียด: ${getErrorMessage(error)}`,

                            ephemeral: true

                        });

                    }

                } catch (replyError) {

                    console.error(
                        "REPLY ERROR:",
                        replyError
                    );

                }

            }

        }


        // =================================================
        // LIMIT ROOM
        // =================================================

        if (
            interaction.customId ===
            "limit_room"
        ) {

            try {

                await interaction.deferReply({
                    ephemeral: true
                });


                const member =
                    interaction.member;


                const voiceChannel =
                    member?.voice?.channel;


                if (!voiceChannel) {

                    return await interaction.editReply({

                        content:
                            "❌ คุณต้องอยู่ในห้องส่วนตัวก่อน"

                    });

                }


                const data =
                    tempChannels.get(
                        voiceChannel.id
                    );


                if (!data) {

                    return await interaction.editReply({

                        content:
                            "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว"

                    });

                }


                if (
                    data.owner !==
                    member.id
                ) {

                    return await interaction.editReply({

                        content:
                            "❌ คุณไม่ใช่เจ้าของห้องนี้"

                    });

                }


                const value =
                    interaction.fields
                        .getTextInputValue(
                            "room_limit"
                        )
                        .trim();


                const limit =
                    Number(value);


                if (
                    !Number.isInteger(limit) ||
                    limit < 0 ||
                    limit > 99
                ) {

                    return await interaction.editReply({

                        content:
                            "❌ กรุณาใส่ตัวเลขตั้งแต่ 0 ถึง 99"

                    });

                }


                await voiceChannel.setUserLimit(
                    limit
                );


                return await interaction.editReply({

                    content:
                        limit === 0
                            ? "🎯 ตั้งห้องเป็นไม่จำกัดจำนวนสมาชิกแล้ว"
                            : `🎯 จำกัดห้องไว้ที่ **${limit} คน**`

                });


            } catch (error) {

                console.error(
                    "LIMIT MODAL ERROR:",
                    error
                );


                if (
                    interaction.deferred ||
                    interaction.replied
                ) {

                    await interaction.editReply({

                        content:
                            `❌ เกิดข้อผิดพลาด\n${getErrorMessage(error)}`

                    }).catch(() => {});

                } else {

                    await interaction.reply({

                        content:
                            `❌ เกิดข้อผิดพลาด\n${getErrorMessage(error)}`,

                        ephemeral: true

                    }).catch(() => {});

                }

            }

        }

    }
);


// =====================================================
// LOGIN
// =====================================================

client.login(TOKEN);
