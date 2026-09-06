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
  TextInputStyle
} = require("discord.js");

const express = require("express");

// ======================================================
// 🌐 WEB SERVER
// ======================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web Server is ready.");
});

// ======================================================
// ⚙️ CONFIG
// ======================================================

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

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
// 🏠 TEMPORARY CHANNEL DATA
// ======================================================

const tempChannels = new Map();

/*
tempChannels structure

channelId => {
  owner: userId,
  locked: false,
  hidden: false
}
*/

// ======================================================
// 👑 ยศใหญ่ที่สามารถมองเห็นห้องตอน HIDE
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
// 📌 SLASH COMMAND
// ======================================================

const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("เปิดแผงควบคุมห้องส่วนตัว")
    .setDMPermission(false)
].map(command => command.toJSON());

const rest = new REST({
  version: "10"
}).setToken(token);

// ======================================================
// 🚀 BOT READY
// ======================================================

client.once("ready", async () => {
  console.log(`✅ Login as: ${client.user.tag}`);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("🚀 ติดตั้ง Slash Command /room เรียบร้อยแล้ว");
  } catch (error) {
    console.error("❌ Slash Command Error:", error);
  }
});

// ======================================================
// 🏠 สร้างห้องส่วนตัวอัตโนมัติ
// ======================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // ==================================================
    // 1️⃣ สมาชิกเข้าห้อง CREATE CHANNEL
    // ==================================================

    if (newState.channelId === createChannelId) {

      const guild = newState.guild;
      const member = newState.member;

      const ownerId = member.id;

      // -----------------------------------------------
      // Permission เริ่มต้น
      // -----------------------------------------------

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

      // -----------------------------------------------
      // ยศพิเศษ
      // -----------------------------------------------

      if (allowRoleId) {

        permissionOverwrites.push({

          id: allowRoleId,

          allow: [
            "ViewChannel",
            "Connect"
          ]

        });

      }

      // -----------------------------------------------
      // สร้างห้อง
      // -----------------------------------------------

      const channel = await guild.channels.create({

        name: `ห้องส่วนตัวของ ${member.user.username}`,

        type: ChannelType.GuildVoice,

        parent: categoryId,

        permissionOverwrites

      });

      // -----------------------------------------------
      // ย้ายสมาชิกเข้าห้อง
      // -----------------------------------------------

      await newState.setChannel(channel).catch(() => {});

      // -----------------------------------------------
      // เก็บข้อมูลห้อง
      // -----------------------------------------------

      tempChannels.set(channel.id, {

        owner: ownerId,

        locked: false,

        hidden: false

      });

      console.log(
        `🏠 Created private room: ${channel.name}`
      );

      return;
    }

    // ==================================================
    // 2️⃣ สมาชิกออกจากห้องชั่วคราว
    // ==================================================

    if (
      oldState.channelId &&
      tempChannels.has(oldState.channelId)
    ) {

      const channelId = oldState.channelId;

      const channel = await oldState.guild.channels
        .fetch(channelId)
        .catch(() => null);

      // -----------------------------------------------
      // ถ้าห้องไม่มีคนอยู่ → ลบทิ้ง
      // -----------------------------------------------

      if (!channel || channel.members.size === 0) {

        if (channel) {

          await channel.delete().catch(() => {});

        }

        tempChannels.delete(channelId);

        console.log(
          `🗑️ Deleted private room: ${channelId}`
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
    // /ROOM
    // ==================================================

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "room"
    ) {

      const embed = new EmbedBuilder()

        .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")

        .setDescription(
          "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
          "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n" +
          "🔹 สมาชิกที่มียศพิเศษสามารถเข้าห้องได้ทันที"
        )

        .setImage(
          "https://i.ibb.co/Kjbw5BGb/image.png"
        )

        .setFooter({
          text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        })

        .setColor(0x2b2d31);

      // ==================================================
      // ROW 1
      // ==================================================

      const row1 = new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId("name")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("lock")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("unlock")
            .setEmoji("🔓")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("limit")
            .setEmoji("🎯")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("owner")
            .setEmoji("👑")
            .setStyle(ButtonStyle.Secondary)

        );

      // ==================================================
      // ROW 2
      // ==================================================

      const row2 = new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId("hide")
            .setEmoji("🙈")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("show")
            .setEmoji("👁️")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("transfer")
            .setEmoji("🔁")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("allow")
            .setEmoji("🧑‍🤝‍🧑")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("deny")
            .setEmoji("🚫")
            .setStyle(ButtonStyle.Secondary)

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

      // ตอบแบบ Ephemeral
      await interaction.reply({

        content: "✅ สร้างแผงควบคุมเรียบร้อยแล้ว",

        ephemeral: true

      });

      return;
    }

    // ==================================================
    // 🔘 BUTTON
    // ==================================================

    if (interaction.isButton()) {

      const member = interaction.member;

      // -----------------------------------------------
      // ต้องอยู่ในห้องเสียง
      // -----------------------------------------------

      const channel = member.voice.channel;

      if (!channel) {

        return interaction.reply({

          content: "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

          ephemeral: true

        });

      }

      // -----------------------------------------------
      // ตรวจสอบว่าห้องเป็นห้องชั่วคราว
      // -----------------------------------------------

      const data = tempChannels.get(channel.id);

      if (!data) {

        return interaction.reply({

          content:
            "❌ ห้องนี้ไม่ได้อยู่ในระบบห้องส่วนตัว",

          ephemeral: true

        });

      }

      // ==================================================
      // 👑 OWNER INFO
      // ==================================================

      if (interaction.customId === "owner") {

        const ownerMember =
          interaction.guild.members.cache.get(
            data.owner
          );

        return interaction.reply({

          embeds: [

            new EmbedBuilder()

              .setTitle("👑 เจ้าของห้อง")

              .setDescription(
                `เจ้าของห้องปัจจุบันคือ <@${data.owner}>`
              )

              .setColor(0xFFD700)

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

      if (data.owner !== member.id) {

        return interaction.reply({

          content:
            "❌ คุณไม่ใช่เจ้าของห้องนี้ ไม่สามารถสั่งการได้",

          ephemeral: true

        });

      }

      // ==================================================
      // ✏️ RENAME
      // ==================================================

      if (interaction.customId === "name") {

        const modal = new ModalBuilder()

          .setCustomId("rename_room")

          .setTitle("เปลี่ยนชื่อห้อง");

        const input = new TextInputBuilder()

          .setCustomId("room_name")

          .setLabel("ชื่อห้องใหม่")

          .setStyle(TextInputStyle.Short)

          .setRequired(true)

          .setMaxLength(100);

        modal.addComponents(

          new ActionRowBuilder()
            .addComponents(input)

        );

        return interaction.showModal(modal);

      }

      // ==================================================
      // 🎯 LIMIT
      // ==================================================

      if (interaction.customId === "limit") {

        const modal = new ModalBuilder()

          .setCustomId("limit_room")

          .setTitle("ตั้งจำนวนคน");

        const input = new TextInputBuilder()

          .setCustomId("limit_input")

          .setLabel("ใส่จำนวนคน (0 = ไม่จำกัด)")

          .setStyle(TextInputStyle.Short)

          .setRequired(true)

          .setMaxLength(2);

        modal.addComponents(

          new ActionRowBuilder()
            .addComponents(input)

        );

        return interaction.showModal(modal);

      }

      // ==================================================
      // 👥 USER SELECT
      // ==================================================

      if (
        [
          "allow",
          "deny",
          "transfer"
        ].includes(interaction.customId)
      ) {

        const menu = new UserSelectMenuBuilder()

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
              .addComponents(menu)

          ],

          ephemeral: true

        });

      }

      // ==================================================
      // DEFER
      // ==================================================

      await interaction.deferReply({
        ephemeral: true
      });

      // ==================================================
      // 🔒 LOCK
      // ==================================================

      if (interaction.customId === "lock") {

        /*
          LOCK จะไม่ใช้ permissionOverwrites.set()

          เพราะถ้าใช้ .set()
          Permission ของ Allow / Deny
          ที่เจ้าของตั้งไว้จะถูกล้าง
        */

        // -----------------------------------------------
        // @everyone
        // -----------------------------------------------

        await channel.permissionOverwrites.edit(

          interaction.guild.id,

          {
            ViewChannel: true,
            Connect: false
          }

        );

        // -----------------------------------------------
        // 👑 OWNER
        // -----------------------------------------------

        await channel.permissionOverwrites.edit(

          data.owner,

          {
            ViewChannel: true,
            Connect: true
          }

        );

        // -----------------------------------------------
        // 🛡️ ROLE
        // -----------------------------------------------

        if (allowRoleId) {

          await channel.permissionOverwrites.edit(

            allowRoleId,

            {
              ViewChannel: true,
              Connect: false
            }

          );

        }

        // -----------------------------------------------
        // บันทึกสถานะ
        // -----------------------------------------------

        data.locked = true;

        return interaction.editReply({

          content:
            "🔒 **ล็อกห้องเรียบร้อยแล้ว**\n\n" +
            "👑 เจ้าของห้อง → เข้าได้\n" +
            "🧑‍🤝‍🧑 สมาชิกที่ Allow → เข้าได้\n" +
            "🛡️ ยศพิเศษ → เข้าไม่ได้\n" +
            "👤 สมาชิกทั่วไป → เข้าไม่ได้"

        });

      }

      // ==================================================
      // 🔓 UNLOCK
      // ==================================================

      if (interaction.customId === "unlock") {

        // -----------------------------------------------
        // @everyone
        // -----------------------------------------------

        await channel.permissionOverwrites.edit(

          interaction.guild.id,

          {
            ViewChannel: true,
            Connect: false
          }

        );

        // -----------------------------------------------
        // 👑 OWNER
        // -----------------------------------------------

        await channel.permissionOverwrites.edit(

          data.owner,

          {
            ViewChannel: true,
            Connect: true
          }

        );

        // -----------------------------------------------
        // 🛡️ ROLE
        // -----------------------------------------------

        if (allowRoleId) {

          await channel.permissionOverwrites.edit(

            allowRoleId,

            {
              ViewChannel: true,
              Connect: true
            }

          );

        }

        // -----------------------------------------------
        // สถานะ
        // -----------------------------------------------

        data.locked = false;

        return interaction.editReply({

          content:
            "🔓 **ปลดล็อกห้องเรียบร้อยแล้ว**\n\n" +
            "👑 เจ้าของห้อง → เข้าได้\n" +
            "🛡️ ยศพิเศษ → เข้าได้\n" +
            "🧑‍🤝‍🧑 สมาชิกที่ Allow → เข้าได้\n" +
            "👤 สมาชิกทั่วไป → ยังเข้าไม่ได้"

        });

      }

      // ==================================================
      // 🙈 HIDE
      // ==================================================

      if (interaction.customId === "hide") {

        // @everyone ซ่อนห้อง
        await channel.permissionOverwrites.edit(

          interaction.guild.id,

          {
            ViewChannel: false,
            Connect: false
          }

        );

        // 👑 OWNER
        await channel.permissionOverwrites.edit(

          data.owner,

          {
            ViewChannel: true,
            Connect: true
          }

        );

        // 🤖 BOT
        await channel.permissionOverwrites.edit(

          client.user.id,

          {
            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MoveMembers: true
          }

        );

        // 🛡️ ยศใหญ่
        for (const roleId of bigRoleIds) {

          await channel.permissionOverwrites.edit(

            roleId,

            {
              ViewChannel: true
            }

          ).catch(() => {});

        }

        data.hidden = true;

        return interaction.editReply({

          content:
            "🙈 **ซ่อนห้องเรียบร้อยแล้ว**"

        });

      }

      // ==================================================
      // 👁️ SHOW
      // ==================================================

      if (interaction.customId === "show") {

        // แสดงห้อง
        await channel.permissionOverwrites.edit(

          interaction.guild.id,

          {
            ViewChannel: true,
            Connect: false
          }

        );

        // OWNER
        await channel.permissionOverwrites.edit(

          data.owner,

          {
            ViewChannel: true,
            Connect: true
          }

        );

        // ROLE
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(

            allowRoleId,

            {
              ViewChannel: true,

              // ถ้าห้อง Locked อยู่
              // ให้เข้าไม่ได้
              Connect: data.locked
                ? false
                : true

            }

          );

        }

        data.hidden = false;

        return interaction.editReply({

          content:
            "👁️ **แสดงห้องเรียบร้อยแล้ว**"

        });

      }

    }

    // ==================================================
    // 👥 USER SELECT MENU
    // ==================================================

    if (interaction.isUserSelectMenu()) {

      const channel =
        interaction.member.voice.channel;

      const data =
        tempChannels.get(channel?.id);

      // -----------------------------------------------
      // ตรวจสอบ
      // -----------------------------------------------

      if (
        !channel ||
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

        await channel.permissionOverwrites.edit(

          targetId,

          {
            Connect: true,
            ViewChannel: true
          }

        );

        return interaction.reply({

          content:
            `✅ อนุญาตให้ <@${targetId}> ` +
            `มองเห็นและเข้าห้องได้แล้ว`,

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

        await channel.permissionOverwrites.edit(

          targetId,

          {
            ViewChannel: false,
            Connect: false
          }

        );

        // ถ้าอยู่ในห้อง → เตะออก
        const targetMember =
          channel.members.get(targetId);

        if (targetMember) {

          await targetMember.voice
            .disconnect()
            .catch(() => {});

        }

        return interaction.reply({

          content:
            `🚫 บล็อก <@${targetId}> ` +
            `ไม่ให้เข้าห้องเรียบร้อยแล้ว`,

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

        // เปลี่ยน Owner
        data.owner = targetId;

        const targetUser =
          await client.users
            .fetch(targetId)
            .catch(() => null);

        if (targetUser) {

          await channel.setName(

            `📍・ห้องส่วนตัวของ ${targetUser.username}`

          ).catch(() => {});

        }

        // สิทธิ์ Owner ใหม่
        await channel.permissionOverwrites.edit(

          targetId,

          {
            ViewChannel: true,
            Connect: true
          }

        );

        return interaction.reply({

          content:
            `🔁 โอนความเป็นเจ้าของห้องให้ ` +
            `<@${targetId}> เรียบร้อยแล้ว`,

          ephemeral: true

        });

      }

    }

    // ==================================================
    // 📝 MODAL
    // ==================================================

    if (interaction.isModalSubmit()) {

      const channel =
        interaction.member.voice.channel;

      const data =
        tempChannels.get(channel?.id);

      // -----------------------------------------------
      // ตรวจสอบ
      // -----------------------------------------------

      if (
        !channel ||
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

      // ==================================================
      // 🎯 LIMIT
      // ==================================================

      if (
        interaction.customId ===
        "limit_room"
      ) {

        const input =
          interaction.fields
            .getTextInputValue(
              "limit_input"
            )
            .trim();

        const limit =
          parseInt(input);

        // -----------------------------------------------
        // ตรวจสอบ
        // -----------------------------------------------

        if (
          isNaN(limit) ||
          limit < 0 ||
          limit > 99
        ) {

          return interaction.reply({

            content:
              "❌ โปรดใส่ตัวเลขระหว่าง 0 - 99",

            ephemeral: true

          });

        }

        // -----------------------------------------------
        // ตั้งจำนวน
        // -----------------------------------------------

        await channel
          .setUserLimit(limit)
          .catch(() => {});

        return interaction.reply({

          content:
            `🎯 ตั้งจำนวนคนเป็น **${
              limit === 0
                ? "ไม่จำกัด"
                : limit + " คน"
            }** เรียบร้อยแล้ว`,

          ephemeral: true

        });

      }

    }

  } catch (error) {

    console.error(
      "❌ Interaction Error:",
      error
    );

    // -----------------------------------------------
    // ป้องกัน Interaction Failed
    // -----------------------------------------------

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

    } catch {}

  }

});

// ======================================================
// 🔑 LOGIN
// ======================================================

if (!token) {

  console.error(
    "❌ ไม่พบ TOKEN ใน Environment Variables"
  );

  process.exit(1);

}

client.login(token);
