```js
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

// =====================================================
// 🌐 WEB SERVER สำหรับ Render / Cloud
// =====================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web Server is ready.");
});


// =====================================================
// 🔐 ENVIRONMENT VARIABLES
// =====================================================

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

if (!token) {
  console.error("❌ ไม่พบ TOKEN ใน Environment Variables");
  process.exit(1);
}

if (!createChannelId) {
  console.warn("⚠️ ไม่พบ CREATE_CHANNEL_ID");
}

if (!categoryId) {
  console.warn("⚠️ ไม่พบ CATEGORY_ID");
}


// =====================================================
// 🤖 DISCORD CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});


// =====================================================
// 🏠 TEMPORARY CHANNEL DATA
// =====================================================

// channelId => {
//   owner: userId,
//   hidden: false
// }

const tempChannels = new Map();


// =====================================================
// 👑 ยศใหญ่ที่สามารถมองเห็นห้องตอน HIDE
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
  "1492931725129683124"
];


// =====================================================
// 📝 SLASH COMMAND
// =====================================================

const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("เปิดแผงควบคุมห้องเสียงส่วนตัว")
    .setDMPermission(false)
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);


// =====================================================
// ✅ BOT READY
// =====================================================

client.once("ready", async () => {

  console.log("====================================");
  console.log(`✅ Login as: ${client.user.tag}`);
  console.log(`🆔 Bot ID: ${client.user.id}`);
  console.log("====================================");

  try {

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("🚀 ติดตั้ง Slash Command /room เรียบร้อยแล้ว");

  } catch (error) {

    console.error("❌ ไม่สามารถติดตั้ง Slash Command:", error);

  }

});


// =====================================================
// 🏠 สร้างห้องเสียงอัตโนมัติ
// =====================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // =================================================
    // 1️⃣ สมาชิกเข้าห้อง CREATE CHANNEL
    // =================================================

    if (
      newState.channelId &&
      newState.channelId === createChannelId
    ) {

      const guild = newState.guild;
      const member = newState.member;

      if (!member) return;

      const ownerId = member.id;

      console.log(
        `🏠 ${member.user.username} กำลังสร้างห้องส่วนตัว`
      );


      // ===============================================
      // Permission เริ่มต้น
      // ===============================================

      const permissionOverwrites = [

        // @everyone
        {
          id: guild.id,

          allow: [
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
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers
          ]
        },

        // Bot
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


      // ===============================================
      // ยศพิเศษ
      // ===============================================

      if (allowRoleId) {

        permissionOverwrites.push({
          id: allowRoleId,

          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect
          ]
        });

      }


      // ===============================================
      // สร้างห้อง
      // ===============================================

      const channel = await guild.channels.create({

        name: `ห้องส่วนตัวของ ${member.user.username}`,

        type: ChannelType.GuildVoice,

        parent: categoryId || null,

        permissionOverwrites

      });


      // ===============================================
      // บันทึกข้อมูลห้อง
      // ===============================================

      tempChannels.set(channel.id, {

        owner: ownerId,

        hidden: false

      });


      // ===============================================
      // ย้ายสมาชิกเข้าห้อง
      // ===============================================

      await member.voice.setChannel(channel).catch(error => {

        console.error(
          "❌ ย้ายสมาชิกเข้าห้องไม่ได้:",
          error
        );

      });


      console.log(
        `✅ สร้างห้อง ${channel.name} (${channel.id})`
      );

      return;
    }


    // =================================================
    // 2️⃣ ตรวจสอบห้องชั่วคราวเมื่อสมาชิกออก
    // =================================================

    if (
      oldState.channelId &&
      tempChannels.has(oldState.channelId)
    ) {

      const channelId = oldState.channelId;

      const channel =
        await oldState.guild.channels
          .fetch(channelId)
          .catch(() => null);


      // ห้องถูกลบไปแล้ว
      if (!channel) {

        tempChannels.delete(channelId);

        return;

      }


      // ไม่มีสมาชิกเหลือ
      if (channel.members.size === 0) {

        console.log(
          `🗑️ ลบห้อง ${channel.name}`
        );

        await channel.delete().catch(error => {

          console.error(
            "❌ ลบห้องไม่ได้:",
            error
          );

        });

        tempChannels.delete(channelId);

      }

    }

  } catch (error) {

    console.error(
      "❌ voiceStateUpdate Error:",
      error
    );

  }

});


// =====================================================
// 🎛️ INTERACTION SYSTEM
// =====================================================

client.on("interactionCreate", async interaction => {

  try {

    // =================================================
    // /room
    // =================================================

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "room"
    ) {

      const embed = new EmbedBuilder()

        .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")

        .setDescription(
          "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n\n" +
          "✏️ เปลี่ยนชื่อห้อง\n" +
          "🔒 ล็อกห้อง\n" +
          "🔓 ปลดล็อกห้อง\n" +
          "🎯 จำกัดจำนวนสมาชิก\n" +
          "👑 ตรวจสอบเจ้าของห้อง\n" +
          "🙈 ซ่อนห้อง\n" +
          "👁️ แสดงห้อง\n" +
          "🔁 โอนเจ้าของห้อง\n" +
          "🧑‍🤝‍🧑 อนุญาตสมาชิก\n" +
          "🚫 บล็อกสมาชิก"
        )

        .setImage(
          "https://i.ibb.co/Kjbw5BGb/image.png"
        )

        .setFooter({
          text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        })

        .setColor(0x2b2d31);


      // =================================================
      // ROW 1
      // =================================================

      const row1 =
        new ActionRowBuilder().addComponents(

          new ButtonBuilder()
            .setCustomId("name")
            .setEmoji("✏️")
            .setLabel("ชื่อ")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("lock")
            .setEmoji("🔒")
            .setLabel("ล็อก")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("unlock")
            .setEmoji("🔓")
            .setLabel("ปลดล็อก")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("limit")
            .setEmoji("🎯")
            .setLabel("จำกัดคน")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("owner")
            .setEmoji("👑")
            .setLabel("เจ้าของ")
            .setStyle(ButtonStyle.Secondary)

        );


      // =================================================
      // ROW 2
      // =================================================

      const row2 =
        new ActionRowBuilder().addComponents(

          new ButtonBuilder()
            .setCustomId("hide")
            .setEmoji("🙈")
            .setLabel("ซ่อน")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("show")
            .setEmoji("👁️")
            .setLabel("แสดง")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("transfer")
            .setEmoji("🔁")
            .setLabel("โอนเจ้าของ")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("allow")
            .setEmoji("🧑‍🤝‍🧑")
            .setLabel("อนุญาต")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("deny")
            .setEmoji("🚫")
            .setLabel("บล็อก")
            .setStyle(ButtonStyle.Secondary)

        );


      // ส่ง Panel ลงช่อง
      await interaction.channel.send({

        embeds: [embed],

        components: [
          row1,
          row2
        ]

      });


      // ตอบ Interaction แบบเงียบ
      await interaction.reply({

        content: "✅ สร้างแผงควบคุมเรียบร้อยแล้ว",

        ephemeral: true

      });


      return;

    }


    // =================================================
    // 🔘 BUTTONS
    // =================================================

    if (interaction.isButton()) {

      const member = interaction.member;

      if (!member) return;


      const channel =
        member.voice?.channel;


      if (!channel) {

        return interaction.reply({

          content:
            "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

          ephemeral: true

        });

      }


      const data =
        tempChannels.get(channel.id);


      if (!data) {

        return interaction.reply({

          content:
            "❌ ห้องนี้ไม่ใช่ห้องส่วนตัวของระบบ",

          ephemeral: true

        });

      }


      // =================================================
      // 👑 OWNER
      // =================================================

      if (
        interaction.customId === "owner"
      ) {

        const ownerMember =
          await interaction.guild.members
            .fetch(data.owner)
            .catch(() => null);


        return interaction.reply({

          embeds: [

            new EmbedBuilder()

              .setTitle("👑 เจ้าของห้อง")

              .setDescription(
                `เจ้าของห้องปัจจุบันคือ <@${data.owner}>`
              )

              .setThumbnail(
                ownerMember
                  ? ownerMember.user.displayAvatarURL()
                  : null
              )

              .setColor(0xFFD700)

          ],

          ephemeral: true

        });

      }


      // =================================================
      // 🛡️ ตรวจสอบเจ้าของ
      // =================================================

      if (
        data.owner !== member.id
      ) {

        return interaction.reply({

          content:
            "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ",

          ephemeral: true

        });

      }


      // =================================================
      // ✏️ RENAME
      // =================================================

      if (
        interaction.customId === "name"
      ) {

        const modal =
          new ModalBuilder()

            .setCustomId("rename_room")

            .setTitle("✏️ เปลี่ยนชื่อห้อง");


        const input =
          new TextInputBuilder()

            .setCustomId("room_name")

            .setLabel("ชื่อห้องใหม่")

            .setPlaceholder("เช่น ห้องพูดคุย")

            .setStyle(TextInputStyle.Short)

            .setMaxLength(100)

            .setRequired(true);


        modal.addComponents(

          new ActionRowBuilder()
            .addComponents(input)

        );


        return interaction.showModal(modal);

      }


      // =================================================
      // 🎯 LIMIT
      // =================================================

      if (
        interaction.customId === "limit"
      ) {

        const modal =
          new ModalBuilder()

            .setCustomId("limit_room")

            .setTitle("🎯 ตั้งจำนวนคน");


        const input =
          new TextInputBuilder()

            .setCustomId("limit_input")

            .setLabel("จำนวนคน 0 = ไม่จำกัด")

            .setPlaceholder("0 - 99")

            .setStyle(TextInputStyle.Short)

            .setRequired(true);


        modal.addComponents(

          new ActionRowBuilder()
            .addComponents(input)

        );


        return interaction.showModal(modal);

      }


      // =================================================
      // 👥 SELECT MEMBER
      // =================================================

      if (
        [
          "allow",
          "deny",
          "transfer"
        ].includes(interaction.customId)
      ) {

        const menu =
          new UserSelectMenuBuilder()

            .setCustomId(
              `select_${interaction.customId}`
            )

            .setPlaceholder(
              "เลือกสมาชิกที่ต้องการ..."
            );


        return interaction.reply({

          content:
            "🎯 โปรดเลือกสมาชิกจากเมนูด้านล่าง",

          components: [

            new ActionRowBuilder()
              .addComponents(menu)

          ],

          ephemeral: true

        });

      }


      // =================================================
      // DEFER
      // =================================================

      await interaction.deferReply({
        ephemeral: true
      });


      // =================================================
      // 🔒 LOCK
      // =================================================

      if (
        interaction.customId === "lock"
      ) {

        // @everyone เห็น แต่เข้าไม่ได้
        await channel.permissionOverwrites.edit(

          interaction.guild.id,

          {
            ViewChannel: true,
            Connect: false
          }

        );


        // เจ้าของเข้าได้
        await channel.permissionOverwrites.edit(

          data.owner,

          {
            ViewChannel: true,
            Connect: true
          }

        );


        // ยศพิเศษเข้าได้
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(

            allowRoleId,

            {
              ViewChannel: true,
              Connect: true
            }

          );

        }


        return interaction.editReply({

          content:
            "🔒 ล็อกห้องเรียบร้อยแล้ว"

        });

      }

// =====================================================
// 🔓 UNLOCK — ปลดล็อกห้อง
// =====================================================
if (interaction.customId === "unlock") {

  // @everyone
  // ให้มองเห็น + สามารถเข้าห้องได้
  await channel.permissionOverwrites.edit(
    interaction.guild.id,
    {
      ViewChannel: true,
      Connect: true
    }
  );

  // 👑 เจ้าของห้อง
  await channel.permissionOverwrites.edit(
    data.owner,
    {
      ViewChannel: true,
      Connect: true,
      ManageChannels: true,
      MoveMembers: true
    }
  );

  // ⭐ ยศพิเศษ
  if (allowRoleId) {
    await channel.permissionOverwrites.edit(
      allowRoleId,
      {
        ViewChannel: true,
        Connect: true
      }
    );
  }

  return interaction.editReply({
    content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"
  });
}


      // =================================================
      // 🙈 HIDE
      // =================================================

      if (
        interaction.customId === "hide"
      ) {

        data.hidden = true;


        // @everyone มองไม่เห็น
        await channel.permissionOverwrites.edit(

          interaction.guild.id,

          {
            ViewChannel: false,
            Connect: false
          }

        );


        // เจ้าของ
        await channel.permissionOverwrites.edit(

          data.owner,

          {
            ViewChannel: true,
            Connect: true
          }

        );


        // Bot
        await channel.permissionOverwrites.edit(

          client.user.id,

          {
            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MoveMembers: true
          }

        );


        // ยศใหญ่
        for (
          const roleId of bigRoleIds
        ) {

          if (
            interaction.guild.roles.cache.has(roleId)
          ) {

            await channel.permissionOverwrites.edit(

              roleId,

              {
                ViewChannel: true,
                Connect: true
              }

            ).catch(() => {});

          }

        }


        // ยศพิเศษ
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(

            allowRoleId,

            {
              ViewChannel: true,
              Connect: true
            }

          );

        }


        return interaction.editReply({

          content:
            "🙈 ซ่อนเรียบร้อยแล้ว"

        });

      }


      // =================================================
      // 👁️ SHOW
      // =================================================

      if (
        interaction.customId === "show"
      ) {

        data.hidden = false;


        // @everyone เห็นและเข้าได้
        await channel.permissionOverwrites.edit(

          interaction.guild.id,

          {
            ViewChannel: true,
            Connect: true
          }

        );


        // เจ้าของ
        await channel.permissionOverwrites.edit(

          data.owner,

          {
            ViewChannel: true,
            Connect: true
          }

        );


        // ยศพิเศษ
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(

            allowRoleId,

            {
              ViewChannel: true,
              Connect: true
            }

          );

        }


        return interaction.editReply({

          content:
            "👁️ แสดงห้องเรียบร้อยแล้ว"

        });

      }

    }


    // =================================================
    // 👥 USER SELECT MENU
    // =================================================

    if (
      interaction.isUserSelectMenu()
    ) {

      const channel =
        interaction.member.voice?.channel;


      if (!channel) {

        return interaction.reply({

          content:
            "❌ คุณต้องอยู่ในห้องเสียง",

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
            "❌ คุณต้องเป็นเจ้าของห้อง",

          ephemeral: true

        });

      }


      const targetId =
        interaction.values[0];


      // =================================================
      // 🧑‍🤝‍🧑 ALLOW
      // =================================================

      if (
        interaction.customId === "select_allow"
      ) {

        await channel.permissionOverwrites.edit(

          targetId,

          {
            ViewChannel: true,
            Connect: true
          }

        );


        return interaction.reply({

          content:
            `✅ อนุญาตให้ <@${targetId}> เข้าห้องได้แล้ว`,

          ephemeral: true

        });

      }


      // =================================================
      // 🚫 DENY
      // =================================================

      if (
        interaction.customId === "select_deny"
      ) {

        await channel.permissionOverwrites.edit(

          targetId,

          {
            ViewChannel: false,
            Connect: false
          }

        );


        const targetMember =
          channel.members.get(targetId);


        if (targetMember) {

          await targetMember.voice
            .disconnect()
            .catch(() => {});

        }


        return interaction.reply({

          content:
            `🚫 บล็อก <@${targetId}> เรียบร้อยแล้ว`,

          ephemeral: true

        });

      }


      // =================================================
      // 🔁 TRANSFER OWNER
      // =================================================

      if (
        interaction.customId === "select_transfer"
      ) {

        // เจ้าของเก่า
        await channel.permissionOverwrites.edit(

          data.owner,

          {
            ViewChannel: true,
            Connect: true,
            ManageChannels: false,
            MoveMembers: false
          }

        );


        // เปลี่ยนเจ้าของ
        data.owner = targetId;


        // เจ้าของใหม่
        await channel.permissionOverwrites.edit(

          targetId,

          {
            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MoveMembers: true
          }

        );


        const targetUser =
          await client.users
            .fetch(targetId)
            .catch(() => null);


        if (targetUser) {

          await channel.setName(

            `ห้องส่วนตัวของ ${targetUser.username}`

          ).catch(() => {});

        }


        return interaction.reply({

          content:
            `🔁 โอนความเป็นเจ้าของให้ <@${targetId}> เรียบร้อยแล้ว`,

          ephemeral: true

        });

      }

    }


    // =================================================
    // 📝 MODAL SUBMIT
    // =================================================

    if (
      interaction.isModalSubmit()
    ) {

      const channel =
        interaction.member.voice?.channel;


      if (!channel) {

        return interaction.reply({

          content:
            "❌ คุณต้องอยู่ในห้องเสียง",

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
            "❌ คุณต้องเป็นเจ้าของห้อง",

          ephemeral: true

        });

      }


      // =================================================
      // ✏️ RENAME
      // =================================================

      if (
        interaction.customId === "rename_room"
      ) {

        const name =
          interaction.fields
            .getTextInputValue("room_name")
            .trim();


        if (!name) {

          return interaction.reply({

            content:
              "❌ กรุณาใส่ชื่อห้อง",

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


      // =================================================
      // 🎯 LIMIT
      // =================================================

      if (
        interaction.customId === "limit_room"
      ) {

        const input =
          interaction.fields
            .getTextInputValue("limit_input")
            .trim();


        const limit =
          Number(input);


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


        await channel
          .setUserLimit(limit)
          .catch(() => {});


        return interaction.reply({

          content:

            limit === 0

              ? "🎯 ตั้งจำนวนคนเป็น **ไม่จำกัด** เรียบร้อยแล้ว"

              : `🎯 จำกัดจำนวนสมาชิกไว้ที่ **${limit} คน** เรียบร้อยแล้ว`,

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
        interaction.replied ||
        interaction.deferred
      ) {

        await interaction.editReply({

          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง"

        });

      } else {

        await interaction.reply({

          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง",

          ephemeral: true

        });

      }

    } catch {}

  }

});


// =====================================================
// 🚀 LOGIN
// =====================================================

client.login(token);
```
