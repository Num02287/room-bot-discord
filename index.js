require("dotenv").config();

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
} = require("discord.js");

const express = require("express");

// =====================================================
// 🌐 Web Server
// =====================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Web Server running on port ${PORT}`);
});

// =====================================================
// 🔐 Environment Variables
// =====================================================

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;

// =====================================================
// 👑 Role IDs
// =====================================================

// 👑 แอดมิน
const adminRoleId = "1492931726962331739";

// 💎 VIP ห้องส่วนตัว
const allowRoleId = "1492931728682254546";

// =====================================================
// 🤖 Discord Client
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// =====================================================
// 💎 ยศใหญ่
// =====================================================

const bigRoleIds = [
  "1502362111345426432",
  "1546873993334890577",
  "1500549655107469535",
  "1492931714887192739",
  "1492931717437063342",
  "1492931719832014978",
  "1492931721384038480",
  "1501857544400932904",
  "1492931725129683124",
  "1493650662624592032",
  "1492931723330064425",
  "1493652498635034844",
  "1497961308530802691",
];

// =====================================================
// 🏠 เก็บข้อมูลห้อง
// =====================================================

const tempChannels = new Map();
const savedPermissions = new Map();

// =====================================================
// 🟢 Bot Ready
// =====================================================

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("room")
      .setDescription("เปิดระบบจัดการห้องส่วนตัว"),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("✅ ลงทะเบียน /room สำเร็จ");
  } catch (error) {
    console.error("❌ ลงทะเบียน /room ไม่สำเร็จ:", error);
  }
});

// =====================================================
// 🎙️ Voice State
// =====================================================

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    // ===================================================
    // 🏠 สร้างห้องส่วนตัว
    // ===================================================

    if (
      newState.channelId === createChannelId &&
      oldState.channelId !== createChannelId
    ) {
      const guild = newState.guild;
      const member = newState.member;

      const permissionOverwrites = [
        // @everyone
        {
          id: guild.id,
          allow: ["ViewChannel"],
          deny: ["Connect"],
        },

        // 👤 เจ้าของห้อง
        {
          id: member.id,
          allow: ["ViewChannel", "Connect"],
        },

        // 🤖 Bot
        {
          id: client.user.id,
          allow: [
            "ViewChannel",
            "Connect",
            "ManageChannels",
            "MoveMembers",
          ],
        },

        // 👑 แอดมิน
        {
          id: adminRoleId,
          allow: ["ViewChannel", "Connect"],
        },

        // 💎 VIP ห้องส่วนตัว
        {
          id: allowRoleId,
          allow: ["ViewChannel", "Connect"],
        },
      ];

      // 💎 ยศใหญ่
      for (const roleId of bigRoleIds) {
        permissionOverwrites.push({
          id: roleId,
          allow: ["ViewChannel", "Connect"],
        });
      }

      // =================================================
      // 🏠 สร้างห้อง
      // =================================================

      const channel = await guild.channels.create({
        name: `ห้องส่วนตัวของ ${member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites,
      });

      tempChannels.set(channel.id, {
        owner: member.id,
      });

      await member.voice.setChannel(channel);

      console.log(
        `🏠 สร้างห้อง ${channel.name} สำหรับ ${member.user.tag}`
      );
    }

    // ===================================================
    // 🗑️ ลบห้องเมื่อไม่มีสมาชิก
    // ===================================================

    if (
      oldState.channelId &&
      tempChannels.has(oldState.channelId)
    ) {
      const channel = oldState.guild.channels.cache.get(
        oldState.channelId
      );

      if (channel && channel.members.size === 0) {
        tempChannels.delete(channel.id);
        savedPermissions.delete(channel.id);

        await channel.delete().catch(() => {});

        console.log(`🗑️ ลบห้อง ${channel.id}`);
      }
    }
  } catch (error) {
    console.error("❌ voiceStateUpdate Error:", error);
  }
});

// =====================================================
// 💬 Interaction
// =====================================================

client.on("interactionCreate", async (interaction) => {
  try {
    // ===================================================
    // /room
    // ===================================================

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "room") {
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
          .setDescription(
            [
              "เลือกเมนูด้านล่างเพื่อจัดการห้องส่วนตัวของคุณ",
              "",
              "🔧 **จัดการห้อง**",
              "✏️ เปลี่ยนชื่อห้อง",
              "🔒 ล็อกห้อง",
              "🔓 ปลดล็อกห้อง",
              "👥 จำกัดจำนวนคน",
              "",
              "👑 **จัดการสมาชิก**",
              "👤 โอนเจ้าของห้อง",
              "➕ อนุญาตสมาชิก",
              "➖ ไม่อนุญาตสมาชิก",
              "",
              "👁️ **การมองเห็น**",
              "🙈 ซ่อนห้อง",
              "👀 แสดงห้อง",
            ].join("\n")
          );

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("room_name")
            .setLabel("ชื่อห้อง")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("room_lock")
            .setLabel("ล็อก")
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId("room_unlock")
            .setLabel("ปลดล็อก")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("room_limit")
            .setLabel("จำกัดคน")
            .setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("room_owner")
            .setLabel("โอนเจ้าของ")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("room_hide")
            .setLabel("ซ่อนห้อง")
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId("room_show")
            .setLabel("แสดงห้อง")
            .setStyle(ButtonStyle.Success)
        );

        const row3 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("room_allow")
            .setLabel("อนุญาต")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("room_deny")
            .setLabel("ไม่อนุญาต")
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId("room_transfer")
            .setLabel("โอนห้อง")
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
          embeds: [embed],
          components: [row1, row2, row3],
          ephemeral: true,
        });
      }

      return;
    }

    // ===================================================
    // 🔘 Buttons
    // ===================================================

    if (interaction.isButton()) {
      const channel = interaction.member.voice.channel;

      if (!channel || !tempChannels.has(channel.id)) {
        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องส่วนตัวก่อน",
          ephemeral: true,
        });
      }

      const data = tempChannels.get(channel.id);

      if (data.owner !== interaction.user.id) {
        return interaction.reply({
          content: "❌ เฉพาะเจ้าของห้องเท่านั้นที่ใช้คำสั่งนี้ได้",
          ephemeral: true,
        });
      }

      // =================================================
      // ✏️ เปลี่ยนชื่อ
      // =================================================

      if (interaction.customId === "room_name") {
        const modal = new ModalBuilder()
          .setCustomId("room_name_modal")
          .setTitle("เปลี่ยนชื่อห้อง");

        const input = new TextInputBuilder()
          .setCustomId("room_name_input")
          .setLabel("ชื่อห้องใหม่")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // =================================================
      // 🔒 ล็อก
      // 👑 Admin + 💎 VIP ยังเข้าได้
      // =================================================

      if (interaction.customId === "room_lock") {
        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: true,
            Connect: false,
          }
        );

        await channel.permissionOverwrites.edit(
          adminRoleId,
          {
            ViewChannel: true,
            Connect: true,
          }
        );

        await channel.permissionOverwrites.edit(
          allowRoleId,
          {
            ViewChannel: true,
            Connect: true,
          }
        );

        return interaction.reply({
          content: "🔒 ล็อกห้องเรียบร้อยแล้ว",
          ephemeral: true,
        });
      }

      // =================================================
      // 🔓 ปลดล็อก
      // =================================================

      if (interaction.customId === "room_unlock") {
        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: true,
            Connect: false,
          }
        );

        await channel.permissionOverwrites.edit(
          adminRoleId,
          {
            ViewChannel: true,
            Connect: true,
          }
        );

        await channel.permissionOverwrites.edit(
          allowRoleId,
          {
            ViewChannel: true,
            Connect: true,
          }
        );

        return interaction.reply({
          content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว",
          ephemeral: true,
        });
      }

      // =================================================
      // 👥 จำกัดจำนวนคน
      // =================================================

      if (interaction.customId === "room_limit") {
        const modal = new ModalBuilder()
          .setCustomId("room_limit_modal")
          .setTitle("จำกัดจำนวนสมาชิก");

        const input = new TextInputBuilder()
          .setCustomId("room_limit_input")
          .setLabel("จำนวนคน 0-99")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2)
          .setPlaceholder("0 = ไม่จำกัด");

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // =================================================
      // 🙈 ซ่อนห้อง
      // 👑 Admin + 💎 VIP ยังเข้าได้
      // =================================================

      if (interaction.customId === "room_hide") {
        const currentPermissions = [];

        for (const overwrite of channel.permissionOverwrites.cache.values()) {
          currentPermissions.push({
            id: overwrite.id,
            allow: overwrite.allow.bitfield.toString(),
            deny: overwrite.deny.bitfield.toString(),
          });
        }

        savedPermissions.set(
          channel.id,
          currentPermissions
        );

        const permissions = [
          // @everyone
          {
            id: interaction.guild.id,
            deny: ["ViewChannel", "Connect"],
          },

          // 🤖 Bot
          {
            id: client.user.id,
            allow: [
              "ViewChannel",
              "Connect",
              "ManageChannels",
              "MoveMembers",
            ],
          },

          // 👤 เจ้าของ
          {
            id: data.owner,
            allow: ["ViewChannel", "Connect"],
          },

          // 👑 แอดมิน
          {
            id: adminRoleId,
            allow: ["ViewChannel", "Connect"],
          },

          // 💎 VIP
          {
            id: allowRoleId,
            allow: ["ViewChannel", "Connect"],
          },
        ];

        // 💎 ยศใหญ่
        for (const roleId of bigRoleIds) {
          permissions.push({
            id: roleId,
            allow: ["ViewChannel", "Connect"],
          });
        }

        await channel.permissionOverwrites.set(
          permissions
        );

        return interaction.reply({
          content: "🙈 ซ่อนห้องเรียบร้อยแล้ว",
          ephemeral: true,
        });
      }

      // =================================================
      // 👀 แสดงห้อง
      // =================================================

      if (interaction.customId === "room_show") {
        const permissions =
          savedPermissions.get(channel.id);

        if (!permissions) {
          return interaction.reply({
            content: "❌ ไม่พบข้อมูล Permission เดิมของห้อง",
            ephemeral: true,
          });
        }

        const restoredPermissions =
          permissions.map((permission) => ({
            id: permission.id,
            allow: BigInt(permission.allow),
            deny: BigInt(permission.deny),
          }));

        await channel.permissionOverwrites.set(
          restoredPermissions
        );

        savedPermissions.delete(channel.id);

        return interaction.reply({
          content: "👀 แสดงห้องเรียบร้อยแล้ว",
          ephemeral: true,
        });
      }

      // =================================================
      // 👤 โอนเจ้าของ
      // =================================================

      if (interaction.customId === "room_owner") {
        const menu = new UserSelectMenuBuilder()
          .setCustomId("room_owner_select")
          .setPlaceholder(
            "เลือกสมาชิกที่จะเป็นเจ้าของห้อง"
          );

        const row = new ActionRowBuilder()
          .addComponents(menu);

        return interaction.reply({
          content: "👤 เลือกสมาชิกที่จะเป็นเจ้าของห้อง",
          components: [row],
          ephemeral: true,
        });
      }

      // =================================================
      // ➕ อนุญาต
      // =================================================

      if (interaction.customId === "room_allow") {
        const menu = new UserSelectMenuBuilder()
          .setCustomId("room_allow_select")
          .setPlaceholder(
            "เลือกสมาชิกที่อนุญาต"
          );

        const row = new ActionRowBuilder()
          .addComponents(menu);

        return interaction.reply({
          content: "➕ เลือกสมาชิกที่ต้องการอนุญาต",
          components: [row],
          ephemeral: true,
        });
      }

      // =================================================
      // ➖ ไม่อนุญาต
      // =================================================

      if (interaction.customId === "room_deny") {
        const menu = new UserSelectMenuBuilder()
          .setCustomId("room_deny_select")
          .setPlaceholder(
            "เลือกสมาชิกที่ไม่อนุญาต"
          );

        const row = new ActionRowBuilder()
          .addComponents(menu);

        return interaction.reply({
          content: "➖ เลือกสมาชิกที่ไม่อนุญาต",
          components: [row],
          ephemeral: true,
        });
      }

      // =================================================
      // 🔄 โอนห้อง
      // =================================================

      if (interaction.customId === "room_transfer") {
        const menu = new UserSelectMenuBuilder()
          .setCustomId("room_transfer_select")
          .setPlaceholder(
            "เลือกสมาชิกที่จะโอนห้อง"
          );

        const row = new ActionRowBuilder()
          .addComponents(menu);

        return interaction.reply({
          content: "🔄 เลือกสมาชิกที่จะรับช่วงต่อ",
          components: [row],
          ephemeral: true,
        });
      }
    }

    // ===================================================
    // 👤 User Select Menu
    // ===================================================

    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;

      if (!channel || !tempChannels.has(channel.id)) {
        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องส่วนตัวก่อน",
          ephemeral: true,
        });
      }

      const data = tempChannels.get(channel.id);

      if (data.owner !== interaction.user.id) {
        return interaction.reply({
          content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
          ephemeral: true,
        });
      }

      const userId = interaction.values[0];

      // =================================================
      // 👑 โอนเจ้าของ
      // =================================================

      if (
        interaction.customId === "room_owner_select" ||
        interaction.customId === "room_transfer_select"
      ) {
        data.owner = userId;

        await channel.permissionOverwrites.edit(
          interaction.user.id,
          {
            ViewChannel: false,
            Connect: false,
          }
        );

        await channel.permissionOverwrites.edit(
          userId,
          {
            ViewChannel: true,
            Connect: true,
          }
        );

        const member =
          await interaction.guild.members
            .fetch(userId)
            .catch(() => null);

        if (member) {
          await channel.setName(
            `📍・ห้องส่วนตัวของ ${member.user.username}`
          );
        }

        return interaction.reply({
          content: "👑 โอนเจ้าของห้องเรียบร้อยแล้ว",
          ephemeral: true,
        });
      }

      // =================================================
      // ➕ อนุญาต
      // =================================================

      if (
        interaction.customId ===
        "room_allow_select"
      ) {
        await channel.permissionOverwrites.edit(
          userId,
          {
            ViewChannel: true,
            Connect: true,
          }
        );

        return interaction.reply({
          content: "➕ อนุญาตสมาชิกเรียบร้อยแล้ว",
          ephemeral: true,
        });
      }

      // =================================================
      // ➖ ไม่อนุญาต
      // =================================================

      if (
        interaction.customId ===
        "room_deny_select"
      ) {
        await channel.permissionOverwrites.edit(
          userId,
          {
            ViewChannel: false,
            Connect: false,
          }
        );

        return interaction.reply({
          content: "➖ ไม่อนุญาตสมาชิกเรียบร้อยแล้ว",
          ephemeral: true,
        });
      }
    }

    // ===================================================
    // 📝 Modal
    // ===================================================

    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;

      if (!channel || !tempChannels.has(channel.id)) {
        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องส่วนตัวก่อน",
          ephemeral: true,
        });
      }

      const data = tempChannels.get(channel.id);

      if (data.owner !== interaction.user.id) {
        return interaction.reply({
          content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
          ephemeral: true,
        });
      }

      // =================================================
      // ✏️ เปลี่ยนชื่อ
      // =================================================

      if (
        interaction.customId ===
        "room_name_modal"
      ) {
        const name =
          interaction.fields.getTextInputValue(
            "room_name_input"
          );

        await channel.setName(name);

        return interaction.reply({
          content: `✅ เปลี่ยนชื่อห้องเป็น **${name}** แล้ว`,
          ephemeral: true,
        });
      }

      // =================================================
      // 👥 จำกัดจำนวนคน
      // =================================================

      if (
        interaction.customId ===
        "room_limit_modal"
      ) {
        const limit = Number(
          interaction.fields.getTextInputValue(
            "room_limit_input"
          )
        );

        if (
          Number.isNaN(limit) ||
          limit < 0 ||
          limit > 99
        ) {
          return interaction.reply({
            content: "❌ กรุณาใส่ตัวเลข 0-99",
            ephemeral: true,
          });
        }

        await channel.setUserLimit(limit);

        return interaction.reply({
          content:
            limit === 0
              ? "👥 ตั้งค่าเป็นไม่จำกัดจำนวนคนแล้ว"
              : `👥 จำกัดห้องไว้ ${limit} คนแล้ว`,
          ephemeral: true,
        });
      }
    }
  } catch (error) {
    console.error("❌ Interaction Error:", error);

    if (
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction
        .reply({
          content: "❌ เกิดข้อผิดพลาดในการทำงาน",
          ephemeral: true,
        })
        .catch(() => {});
    }
  }
});

// =====================================================
// 🚀 Login
// =====================================================

client.login(token);
