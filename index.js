const {
    Client,
    GatewayIntentBits,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder
} = require("discord.js");

const express = require("express");

const app = express();

app.get("/", (req, res) => {
    res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
    console.log("Web server is running");
});


// ============================================================
// Discord Client
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});


// ============================================================
// ENV
// ============================================================

const TOKEN = process.env.TOKEN;

const createChannelId = process.env.CREATE_CHANNEL_ID;

const categoryId = process.env.CATEGORY_ID;

const allowRoleIds = process.env.ALLOW_ROLE_ID
    ? process.env.ALLOW_ROLE_ID
        .split(",")
        .map(id => id.trim())
        .filter(Boolean)
    : [];


// ============================================================
// ยศพิเศษ
// ============================================================

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


// ============================================================
// เก็บข้อมูลห้องชั่วคราว
// channelId => { owner: userId }
// ============================================================

const tempChannels = new Map();


// ============================================================
// จำชื่อห้องของแต่ละคน
// userId => roomName
// ============================================================

const savedRoomNames = new Map();


// ============================================================
// เก็บ Permission ก่อนซ่อนห้อง
// ============================================================

const savedPermissions = new Map();


// ============================================================
// Bot Ready
// ============================================================

client.once("ready", async () => {

    console.log(`Logged in as ${client.user.tag}`);

    try {

        await client.application.commands.set([
            {
                name: "room",
                description: "สร้างแผงควบคุมห้องส่วนตัว"
            }
        ]);

        console.log("Slash command /room registered");

    } catch (error) {

        console.error(
            "ไม่สามารถลงทะเบียน Slash Command:",
            error
        );

    }

});


// ============================================================
// Voice State Update
// ============================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

    try {

        // ========================================================
        // ลบห้องส่วนตัวเมื่อไม่มีสมาชิกอยู่
        // ========================================================

        if (
            oldState.channel &&
            tempChannels.has(oldState.channel.id)
        ) {

            const oldChannel = oldState.channel;

            if (oldChannel.members.size === 0) {

                try {

                    await oldChannel.delete();

                } catch (error) {

                    console.log(
                        "ไม่สามารถลบห้อง:",
                        error.message
                    );

                }

                tempChannels.delete(oldChannel.id);

                savedPermissions.delete(oldChannel.id);
            }
        }


        // ========================================================
        // ตรวจว่าผู้ใช้เข้าห้องสร้างหรือไม่
        // ========================================================

        if (
            !newState.channel ||
            newState.channel.id !== createChannelId
        ) {
            return;
        }


        const member = newState.member;

        if (!member) {
            return;
        }


        // ========================================================
        // ป้องกันสร้างห้องซ้ำ
        // ถ้าคนนี้มีห้องอยู่แล้ว ให้กลับเข้าห้องเดิม
        // ========================================================

        for (const [channelId, roomData] of tempChannels) {

            if (roomData.owner !== member.id) {
                continue;
            }


            const existingChannel =
                newState.guild.channels.cache.get(channelId);


            if (existingChannel) {

                try {

                    await member.voice.setChannel(
                        existingChannel
                    );

                    return;

                } catch (error) {

                    console.log(
                        "ไม่สามารถย้ายเข้าห้องเดิม:",
                        error.message
                    );

                    return;
                }

            }


            // ห้องถูกลบไปแล้ว
            tempChannels.delete(channelId);

            savedPermissions.delete(channelId);
        }


        // ========================================================
        // ชื่อห้อง
        // ========================================================

        const savedName =
            savedRoomNames.get(member.id);


        const roomName =
            savedName ||
            `ห้องส่วนตัวของ ${member.user.username}`;


        // ========================================================
        // Permission
        // ========================================================

        const permissionOverwrites = [

            {
                id: newState.guild.roles.everyone.id,

                allow: [
                    PermissionFlagsBits.ViewChannel
                ],

                deny: [
                    PermissionFlagsBits.Connect
                ]
            },

            {
                id: member.id,

                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect
                ]
            },

            {
                id: client.user.id,

                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.MoveMembers
                ]
            }

        ];


        // ========================================================
        // เพิ่มยศพิเศษ
        // ========================================================

        for (const roleId of bigRoleIds) {

            permissionOverwrites.push({

                id: roleId,

                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect
                ]

            });

        }


        // ========================================================
        // เพิ่มยศจาก ALLOW_ROLE_ID
        // ========================================================

        for (const roleId of allowRoleIds) {

            permissionOverwrites.push({

                id: roleId,

                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect
                ]

            });

        }


        // ========================================================
        // สร้างห้อง
        // ========================================================

        const channel =
            await newState.guild.channels.create({

                name: roomName,

                type: ChannelType.GuildVoice,

                parent: categoryId,

                permissionOverwrites

            });


        // ========================================================
        // บันทึกเจ้าของ
        // ========================================================

        tempChannels.set(
            channel.id,
            {
                owner: member.id
            }
        );


        // ========================================================
        // ย้ายเจ้าของเข้าห้อง
        // ========================================================

        try {

            await member.voice.setChannel(channel);

        } catch (error) {

            console.log(
                "ไม่สามารถย้ายเจ้าของเข้าห้อง:",
                error.message
            );

        }

    } catch (error) {

        console.error(
            "voiceStateUpdate Error:",
            error
        );

    }

});


// ============================================================
// Interaction Create
// ============================================================

client.on("interactionCreate", async (interaction) => {

    try {

        // ========================================================
        // /room
        // ========================================================

        if (interaction.isChatInputCommand()) {

            if (interaction.commandName !== "room") {
                return;
            }


            // ====================================================
            // EMBED เดิมตามรูป
            // ====================================================

            const embed = new EmbedBuilder()

                .setTitle(
                    "🏠 ระบบสร้างห้องส่วนตัวประจำโซน"
                )

                .setDescription(
                    "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
                    "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n" +
                    "🔹 **หมายเหตุ :** สมาชิกที่มียศพิเศษจะสามารถเข้าห้องนี้ได้ทันที"
                )

                .setColor(0x2b2d31)

                .setFooter({
                    text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
                })

                .setImage(
                    "https://i.ibb.co/Kjbw5BGb/image.png"
                );


            // ====================================================
            // แถวที่ 1
            // ====================================================

            const row1 =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId("name")
                            .setLabel("ตั้งชื่อห้อง")
                            .setEmoji("🖊️")
                            .setStyle(
                                ButtonStyle.Primary
                            ),

                        new ButtonBuilder()
                            .setCustomId("lock")
                            .setLabel("ล็อก")
                            .setEmoji("🔒")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("unlock")
                            .setLabel("ปลดล็อก")
                            .setEmoji("🔓")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("limit")
                            .setLabel("จำกัดจำนวนคน")
                            .setEmoji("🎯")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("owner")
                            .setLabel("โอนความเป็นเจ้าของ")
                            .setEmoji("👑")
                            .setStyle(
                                ButtonStyle.Secondary
                            )

                    );


            // ====================================================
            // แถวที่ 2
            // ====================================================

            const row2 =
                new ActionRowBuilder()
                    .addComponents(

                        new ButtonBuilder()
                            .setCustomId("hide")
                            .setLabel("ซ่อนห้อง")
                            .setEmoji("🙈")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("show")
                            .setLabel("แสดงห้อง")
                            .setEmoji("👁️")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("transfer")
                            .setLabel("โอนห้อง")
                            .setEmoji("🔄")
                            .setStyle(
                                ButtonStyle.Secondary
                            ),

                        new ButtonBuilder()
                            .setCustomId("allow")
                            .setLabel("อนุญาตสมาชิก")
                            .setEmoji("🟢")
                            .setStyle(
                                ButtonStyle.Success
                            ),

                        new ButtonBuilder()
                            .setCustomId("deny")
                            .setLabel("ไม่อนุญาตสมาชิก")
                            .setEmoji("🔴")
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

            return;
        }


        // ========================================================
        // ตรวจปุ่ม
        // ========================================================

        if (interaction.isButton()) {

            const validButtons = [
                "name",
                "lock",
                "unlock",
                "limit",
                "owner",
                "hide",
                "show",
                "transfer",
                "allow",
                "deny"
            ];


            if (!validButtons.includes(interaction.customId)) {
                return;
            }


            const member =
                interaction.member;


            const channel =
                member.voice.channel;


            if (!channel) {

                return interaction.reply({

                    content:
                        "❌ กรุณาเข้าห้องเสียงก่อน",

                    ephemeral: true

                });

            }


            const data =
                tempChannels.get(channel.id);


            if (!data) {

                return interaction.reply({

                    content:
                        "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",

                    ephemeral: true

                });

            }


            // ====================================================
            // ดูเจ้าของห้อง
            // ====================================================

            if (
                interaction.customId === "owner"
            ) {

                return interaction.reply({

                    content:
                        `👑 เจ้าของห้องปัจจุบันคือ <@${data.owner}>`,

                    ephemeral: true

                });

            }


            // ====================================================
            // ตรวจเจ้าของปัจจุบัน
            // ====================================================

            if (
                data.owner !== member.id
            ) {

                return interaction.reply({

                    content:
                        "❌ เฉพาะเจ้าของห้องเท่านั้นที่สามารถจัดการห้องนี้ได้",

                    ephemeral: true

                });

            }


            // ====================================================
            // ตั้งชื่อห้อง
            // ====================================================

            if (
                interaction.customId === "name"
            ) {

                const modal =
                    new ModalBuilder()

                        .setCustomId(
                            "rename"
                        )

                        .setTitle(
                            "เปลี่ยนชื่อห้อง"
                        );


                const input =
                    new TextInputBuilder()

                        .setCustomId(
                            "roomName"
                        )

                        .setLabel(
                            "ชื่อห้องใหม่"
                        )

                        .setStyle(
                            TextInputStyle.Short
                        )

                        .setRequired(false)

                        .setPlaceholder(
                            "เว้นว่างแล้วกดส่ง = รีเซ็ตชื่อเริ่มต้น"
                        );


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


            // ====================================================
            // จำกัดจำนวนคน
            // ====================================================

            if (
                interaction.customId === "limit"
            ) {

                const modal =
                    new ModalBuilder()

                        .setCustomId(
                            "limitModal"
                        )

                        .setTitle(
                            "จำกัดจำนวนสมาชิก"
                        );


                const input =
                    new TextInputBuilder()

                        .setCustomId(
                            "limit"
                        )

                        .setLabel(
                            "จำนวนสมาชิก"
                        )

                        .setStyle(
                            TextInputStyle.Short
                        )

                        .setRequired(true)

                        .setPlaceholder(
                            "ใส่ 0 = ไม่จำกัด"
                        );


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


            // ====================================================
            // ล็อกห้อง
            // ====================================================

            if (
                interaction.customId === "lock"
            ) {

                await channel.permissionOverwrites.edit(

                    interaction.guild.roles.everyone.id,

                    {
                        ViewChannel: true,
                        Connect: false
                    }

                );


                for (
                    const roleId of allowRoleIds
                ) {

                    await channel.permissionOverwrites.edit(

                        roleId,

                        {
                            Connect: false
                        }

                    );

                }


                return interaction.reply({

                    content:
                        "🔒 ล็อกห้องเรียบร้อยแล้ว",

                    ephemeral: true

                });

            }


            // ====================================================
            // ปลดล็อก
            // ====================================================

            if (
                interaction.customId === "unlock"
            ) {

                await channel.permissionOverwrites.edit(

                    interaction.guild.roles.everyone.id,

                    {
                        ViewChannel: true,
                        Connect: false
                    }

                );


                for (
                    const roleId of allowRoleIds
                ) {

                    await channel.permissionOverwrites.edit(

                        roleId,

                        {
                            Connect: true
                        }

                    );

                }


                return interaction.reply({

                    content:
                        "🔓 ปลดล็อกห้องเรียบร้อยแล้ว",

                    ephemeral: true

                });

            }


            // ====================================================
            // ซ่อนห้อง
            // ====================================================

            if (
                interaction.customId === "hide"
            ) {

                savedPermissions.set(

                    channel.id,

                    channel.permissionOverwrites.cache.map(
                        overwrite => ({

                            id: overwrite.id,

                            type: overwrite.type,

                            allow:
                                overwrite.allow.bitfield.toString(),

                            deny:
                                overwrite.deny.bitfield.toString()

                        })
                    )

                );


                await channel.permissionOverwrites.edit(

                    interaction.guild.roles.everyone.id,

                    {
                        ViewChannel: false,
                        Connect: false
                    }

                );


                await channel.permissionOverwrites.edit(

                    client.user.id,

                    {
                        ViewChannel: true,
                        Connect: true
                    }

                );


                await channel.permissionOverwrites.edit(

                    member.id,

                    {
                        ViewChannel: true,
                        Connect: true
                    }

                );


                return interaction.reply({

                    content:
                        "🙈 ซ่อนห้องเรียบร้อยแล้ว",

                    ephemeral: true

                });

            }


            // ====================================================
            // แสดงห้อง
            // ====================================================

            if (
                interaction.customId === "show"
            ) {

                const permissions =
                    savedPermissions.get(
                        channel.id
                    );


                if (permissions) {

                    for (
                        const permission of permissions
                    ) {

                        try {

                            const allow =
                                BigInt(
                                    permission.allow
                                );

                            const deny =
                                BigInt(
                                    permission.deny
                                );


                            await channel.permissionOverwrites.edit(

                                permission.id,

                                {

                                    ViewChannel:
                                        (
                                            allow &
                                            BigInt(
                                                PermissionFlagsBits.ViewChannel
                                            )
                                        ) !== 0n,

                                    Connect:
                                        (
                                            allow &
                                            BigInt(
                                                PermissionFlagsBits.Connect
                                            )
                                        ) !== 0n

                                }

                            );

                        } catch (error) {

                            console.log(
                                "ไม่สามารถคืนสิทธิ์:",
                                error.message
                            );

                        }

                    }


                    savedPermissions.delete(
                        channel.id
                    );

                } else {

                    await channel.permissionOverwrites.edit(

                        interaction.guild.roles.everyone.id,

                        {
                            ViewChannel: true
                        }

                    );

                }


                return interaction.reply({

                    content:
                        "👁️ แสดงห้องเรียบร้อยแล้ว",

                    ephemeral: true

                });

            }


            // ====================================================
            // อนุญาต
            // ====================================================

            if (
                interaction.customId === "allow"
            ) {

                const select =
                    new UserSelectMenuBuilder()

                        .setCustomId(
                            "allow_user"
                        )

                        .setPlaceholder(
                            "เลือกสมาชิกที่ต้องการอนุญาต"
                        )

                        .setMinValues(1)

                        .setMaxValues(1);


                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            select
                        );


                return interaction.reply({

                    content:
                        "👤 เลือกสมาชิกที่ต้องการอนุญาต",

                    components: [
                        row
                    ],

                    ephemeral: true

                });

            }


            // ====================================================
            // ไม่อนุญาต
            // ====================================================

            if (
                interaction.customId === "deny"
            ) {

                const select =
                    new UserSelectMenuBuilder()

                        .setCustomId(
                            "deny_user"
                        )

                        .setPlaceholder(
                            "เลือกสมาชิกที่ต้องการไม่อนุญาต"
                        )

                        .setMinValues(1)

                        .setMaxValues(1);


                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            select
                        );


                return interaction.reply({

                    content:
                        "👤 เลือกสมาชิกที่ต้องการไม่อนุญาต",

                    components: [
                        row
                    ],

                    ephemeral: true

                });

            }


            // ====================================================
            // โอนเจ้าของ
            // ====================================================

            if (
                interaction.customId === "transfer"
            ) {

                const select =
                    new UserSelectMenuBuilder()

                        .setCustomId(
                            "transfer_user"
                        )

                        .setPlaceholder(
                            "เลือกเจ้าของห้องคนใหม่"
                        )

                        .setMinValues(1)

                        .setMaxValues(1);


                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            select
                        );


                return interaction.reply({

                    content:
                        "👑 เลือกสมาชิกที่ต้องการโอนความเป็นเจ้าของ",

                    components: [
                        row
                    ],

                    ephemeral: true

                });

            }

        }


        // ========================================================
        // User Select Menu
        // ========================================================

        if (
            interaction.isUserSelectMenu()
        ) {

            const member =
                interaction.member;


            const channel =
                member.voice.channel;


            if (!channel) {

                return interaction.reply({

                    content:
                        "❌ กรุณาเข้าห้องเสียงก่อน",

                    ephemeral: true

                });

            }


            const data =
                tempChannels.get(
                    channel.id
                );


            if (!data) {

                return interaction.reply({

                    content:
                        "❌ ไม่พบข้อมูลห้องนี้",

                    ephemeral: true

                });

            }


            // ====================================================
            // ตรวจเจ้าของปัจจุบัน
            // ====================================================

            if (
                data.owner !== member.id
            ) {

                return interaction.reply({

                    content:
                        "❌ คุณไม่ใช่เจ้าของห้องนี้",

                    ephemeral: true

                });

            }


            const targetId =
                interaction.values[0];


            // ====================================================
            // อนุญาตสมาชิก
            // ====================================================

            if (
                interaction.customId === "allow_user"
            ) {

                await channel.permissionOverwrites.edit(

                    targetId,

                    {
                        ViewChannel: true,
                        Connect: true
                    }

                );


                return interaction.update({

                    content:
                        `✅ อนุญาตให้ <@${targetId}> เข้าห้องแล้ว`,

                    components: []

                });

            }


            // ====================================================
            // ไม่อนุญาตสมาชิก
            // ====================================================

            if (
                interaction.customId === "deny_user"
            ) {

                await channel.permissionOverwrites.edit(

                    targetId,

                    {
                        Connect: false
                    }

                );


                const targetMember =
                    await interaction.guild.members
                        .fetch(targetId)
                        .catch(() => null);


                if (
                    targetMember &&
                    targetMember.voice.channelId === channel.id
                ) {

                    try {

                        await targetMember.voice.disconnect();

                    } catch (error) {

                        console.log(
                            "ไม่สามารถนำสมาชิกออกจากห้อง:",
                            error.message
                        );

                    }

                }


                return interaction.update({

                    content:
                        `❌ ไม่อนุญาตให้ <@${targetId}> เข้าห้องแล้ว`,

                    components: []

                });

            }


            // ====================================================
            // โอนเจ้าของห้อง
            // ====================================================

            if (
                interaction.customId === "transfer_user"
            ) {

                // ไม่ให้โอนให้ตัวเอง
                if (
                    targetId === member.id
                ) {

                    return interaction.update({

                        content:
                            "❌ ไม่สามารถโอนห้องให้ตัวเองได้",

                        components: []

                    });

                }


                const targetMember =
                    await interaction.guild.members
                        .fetch(targetId);


                const oldOwnerId =
                    data.owner;


                // =================================================
                // สำคัญ:
                // เปลี่ยนเจ้าของใน tempChannels ทันที
                // =================================================

                data.owner =
                    targetId;


                tempChannels.set(

                    channel.id,

                    data

                );


                // =================================================
                // ชื่อห้องใหม่ของเจ้าของใหม่
                // =================================================

                const newRoomName =
                    `ห้องส่วนตัวของ ${targetMember.user.username}`;


                await channel.setName(
                    newRoomName
                );


                // =================================================
                // จำชื่อห้องของเจ้าของใหม่
                // =================================================

                savedRoomNames.set(

                    targetId,

                    newRoomName

                );


                // =================================================
                // ลบชื่อที่จำไว้ของเจ้าของเก่า
                // =================================================

                savedRoomNames.delete(
                    oldOwnerId
                );


                // =================================================
                // ให้เจ้าของใหม่เข้าถึงห้อง
                // =================================================

                await channel.permissionOverwrites.edit(

                    targetId,

                    {
                        ViewChannel: true,
                        Connect: true
                    }

                );


                // =================================================
                // ถ้าเจ้าของใหม่อยู่ห้องอื่น
                // ย้ายเข้าห้องใหม่
                // =================================================

                if (
                    targetMember.voice.channelId &&
                    targetMember.voice.channelId !== channel.id
                ) {

                    try {

                        await targetMember.voice.setChannel(
                            channel
                        );

                    } catch (error) {

                        console.log(
                            "ไม่สามารถย้ายเจ้าของใหม่:",
                            error.message
                        );

                    }

                }


                return interaction.update({

                    content:
                        `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้ว`,

                    components: []

                });

            }

        }


        // ========================================================
        // Modal เปลี่ยนชื่อห้อง
        // ========================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId === "rename"
        ) {

            const member =
                interaction.member;


            const channel =
                member.voice.channel;


            if (!channel) {

                return interaction.reply({

                    content:
                        "❌ คุณไม่ได้อยู่ในห้องเสียง",

                    ephemeral: true

                });

            }


            const data =
                tempChannels.get(
                    channel.id
                );


            if (!data) {

                return interaction.reply({

                    content:
                        "❌ ไม่พบข้อมูลห้องนี้",

                    ephemeral: true

                });

            }


            // ====================================================
            // ตรวจเจ้าของใหม่จาก tempChannels
            // ====================================================

            if (
                data.owner !== member.id
            ) {

                return interaction.reply({

                    content:
                        "❌ คุณไม่ใช่เจ้าของห้องนี้",

                    ephemeral: true

                });

            }


            const newName =
                interaction.fields
                    .getTextInputValue(
                        "roomName"
                    )
                    .trim();


            // ====================================================
            // รีเซ็ตชื่อ
            // ====================================================

            if (!newName) {

                const defaultName =
                    `ห้องส่วนตัวของ ${member.user.username}`;


                // จำชื่อเริ่มต้นของเจ้าของปัจจุบัน
                savedRoomNames.set(

                    member.id,

                    defaultName

                );


                await channel.setName(
                    defaultName
                );


                return interaction.reply({

                    content:
                        "🔄 รีเซ็ตชื่อห้องเรียบร้อยแล้ว",

                    ephemeral: true

                });

            }


            // ====================================================
            // ตั้งชื่อใหม่
            // ====================================================

            savedRoomNames.set(

                member.id,

                newName

            );


            await channel.setName(
                newName
            );


            return interaction.reply({

                content:
                    `✅ เปลี่ยนชื่อห้องเป็น **${newName}** เรียบร้อยแล้ว`,

                ephemeral: true

            });

        }


        // ========================================================
        // Modal จำกัดจำนวนคน
        // ========================================================

        if (
            interaction.isModalSubmit() &&
            interaction.customId === "limitModal"
        ) {

            const member =
                interaction.member;


            const channel =
                member.voice.channel;


            if (!channel) {

                return interaction.reply({

                    content:
                        "❌ คุณไม่ได้อยู่ในห้องเสียง",

                    ephemeral: true

                });

            }


            const data =
                tempChannels.get(
                    channel.id
                );


            if (!data) {

                return interaction.reply({

                    content:
                        "❌ ไม่พบข้อมูลห้องนี้",

                    ephemeral: true

                });

            }


            if (
                data.owner !== member.id
            ) {

                return interaction.reply({

                    content:
                        "❌ คุณไม่ใช่เจ้าของห้องนี้",

                    ephemeral: true

                });

            }


            const value =
                interaction.fields
                    .getTextInputValue(
                        "limit"
                    )
                    .trim();


            const limit =
                Number(value);


            if (
                !Number.isInteger(limit) ||
                limit < 0 ||
                limit > 99
            ) {

                return interaction.reply({

                    content:
                        "❌ กรุณาใส่ตัวเลขตั้งแต่ 0 ถึง 99",

                    ephemeral: true

                });

            }


            // ====================================================
            // 0 = ไม่จำกัด
            // ====================================================

            if (limit === 0) {

                await channel.setUserLimit(0);


                return interaction.reply({

                    content:
                        "👥 ตั้งห้องเป็นแบบไม่จำกัดจำนวนสมาชิกแล้ว",

                    ephemeral: true

                });

            }


            await channel.setUserLimit(
                limit
            );


            return interaction.reply({

                content:
                    `👥 จำกัดจำนวนสมาชิกไว้ที่ ${limit} คนแล้ว`,

                ephemeral: true

            });

        }

    } catch (error) {

        console.error(
            "Interaction Error:",
            error
        );


        // ========================================================
        // แจ้งข้อผิดพลาด
        // ========================================================

        try {

            if (
                interaction.replied ||
                interaction.deferred
            ) {

                await interaction.followUp({

                    content:
                        "❌ เกิดข้อผิดพลาด ลองอีกครั้ง",

                    ephemeral: true

                });

            } else {

                await interaction.reply({

                    content:
                        "❌ เกิดข้อผิดพลาด ลองอีกครั้ง",

                    ephemeral: true

                });

            }

        } catch (replyError) {

            console.log(
                "ไม่สามารถส่งข้อความแจ้งข้อผิดพลาด:",
                replyError.message
            );

        }

    }

});


// ============================================================
// Login
// ============================================================

client.login(TOKEN);
