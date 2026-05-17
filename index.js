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

// ================= WEB SERVER =================
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web Server Ready");
});

// ================= ENV =================
const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// ================= TEMP ROOM =================
const tempChannels = new Map();

// ================= SLASH COMMAND =================
const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("ระบบห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

// ================= READY =================
client.once("ready", async () => {

  console.log(`✅ Login as: ${client.user.tag}`);

  try {

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("✅ Slash Commands Loaded");

  } catch (err) {
    console.error(err);
  }
});

// ================= CREATE ROOM SYSTEM =================
client.on("voiceStateUpdate", async (oldState, newState) => {

  // ===== CREATE ROOM =====
  if (newState.channelId === createChannelId) {

    // เช็คว่ามีห้องอยู่แล้วไหม
    const existingRoom = [...tempChannels.entries()].find(
      ([id, data]) => data.owner === newState.member.id
    );

    // ถ้ามีอยู่แล้ว → ย้ายกลับ
    if (existingRoom) {

      const oldRoom =
        newState.guild.channels.cache.get(existingRoom[0]);

      if (oldRoom) {
        return await newState.setChannel(oldRoom);
      }
    }

    // สร้างห้อง
    const channel = await newState.guild.channels.create({
      name: `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: categoryId
    });

    // ย้ายเข้าห้อง
    await newState.setChannel(channel);

    // ตั้งเจ้าของห้อง
    tempChannels.set(channel.id, {
      owner: newState.member.id
    });

    return;
  }

  // ===== DELETE ROOM / TRANSFER OWNER =====
  if (
    oldState.channelId &&
    tempChannels.has(oldState.channelId)
  ) {

    const channel =
      oldState.guild.channels.cache.get(oldState.channelId);

    const data =
      tempChannels.get(oldState.channelId);

    if (!channel) return;

    // ลบห้องเมื่อไม่มีคน
    if (channel.members.size === 0) {

      tempChannels.delete(channel.id);

      await channel.delete().catch(() => {});

      return;
    }

    // โอนเจ้าของอัตโนมัติ
    if (oldState.member.id === data.owner) {

      const newOwner = channel.members.first();

      if (!newOwner) return;

      data.owner = newOwner.id;

      await channel.setName(
        `📍・ห้องส่วนตัวของ ${newOwner.user.username}`
      ).catch(() => {});
    }
  }
});

// ================= INTERACTION =================
client.on("interactionCreate", async (interaction) => {

  try {

    // ================= /ROOM =================
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "room"
    ) {

      if (
        !interaction.member.permissions.has("Administrator")
      ) {

        return interaction.reply({
          content: "❌ คำสั่งนี้สำหรับแอดมินเท่านั้น",
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
        .setDescription(
          "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
          "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ"
        )
        .setImage("https://i.ibb.co/Kjbw5BGb/image.png")
        .setFooter({
          text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        })
        .setColor(0x2b2d31);

      const row1 = new ActionRowBuilder().addComponents(

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

      const row2 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("hide")
          .setEmoji("🙈")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("show")
          .setEmoji("👁")
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

      return interaction.reply({
        embeds: [embed],
        components: [row1, row2]
      });
    }

    // ================= BUTTON =================
    if (interaction.isButton()) {

      const member = interaction.member;
      const channel = member.voice.channel;

      if (!channel) {

        return interaction.reply({
          content: "❌ ต้องอยู่ในห้อง",
          ephemeral: true
        });
      }

      const data = tempChannels.get(channel.id);

      // ===== OWNER =====
      if (interaction.customId === "owner") {

        if (!data) {

          return interaction.reply({
            content: "❌ ห้องนี้ไม่ได้อยู่ในระบบ",
            ephemeral: true
          });
        }

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("👑 เจ้าของห้อง")
              .setDescription(
                `เจ้าของห้องคือ: <@${data.owner}>`
              )
              .setColor(0xFFD700)
          ],
          ephemeral: true
        });
      }

      // ===== OWNER ONLY =====
      if (!data || data.owner !== member.id) {

        return interaction.reply({
          content: "❌ ไม่ใช่เจ้าของห้อง",
          ephemeral: true
        });
      }

      // ===== CHANGE NAME =====
      if (interaction.customId === "name") {

        const modal = new ModalBuilder()
          .setCustomId("rename_room")
          .setTitle("เปลี่ยนชื่อห้อง");

        const input = new TextInputBuilder()
          .setCustomId("room_name")
          .setLabel("ชื่อใหม่")
          .setStyle(TextInputStyle.Short);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // ===== LIMIT =====
      if (interaction.customId === "limit") {

        const modal = new ModalBuilder()
          .setCustomId("limit_room")
          .setTitle("ตั้งจำนวนคน");

        const input = new TextInputBuilder()
          .setCustomId("limit_input")
          .setLabel("ใส่จำนวน (0 = ไม่จำกัด)")
          .setStyle(TextInputStyle.Short);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // ===== SELECT MENU =====
      if (
        ["allow", "deny", "transfer"]
          .includes(interaction.customId)
      ) {

        const menu = new UserSelectMenuBuilder()
          .setCustomId(`select_${interaction.customId}`);

        return interaction.reply({
          content: "โปรดเลือกสมาชิก",
          components: [
            new ActionRowBuilder().addComponents(menu)
          ],
          ephemeral: true
        });
      }

      // ================= LOCK =================
      if (interaction.customId === "lock") {

        // ล็อก everyone
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          {
            CONNECT: false
          }
        );

        // ล็อก role พิเศษ
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              CONNECT: false
            }
          ).catch(() => {});
        }

        // เจ้าของยังเข้าได้
        await channel.permissionOverwrites.edit(
          data.owner,
          {
            CONNECT: true,
            VIEW_CHANNEL: true
          }
        );

        return interaction.reply({
          content: "🔒 ล็อกห้องแล้ว",
          ephemeral: true
        });
      }

      // ================= UNLOCK =================
      if (interaction.customId === "unlock") {

        // ปลดล็อก everyone
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          {
            CONNECT: null
          }
        );

        // ปลดล็อก role พิเศษ
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              CONNECT: null
            }
          ).catch(() => {});
        }

        return interaction.reply({
          content: "🔓 ปลดล็อกห้องแล้ว",
          ephemeral: true
        });
      }

      // ================= HIDE =================
      if (interaction.customId === "hide") {

        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          {
            VIEW_CHANNEL: false
          }
        );

        await channel.permissionOverwrites.edit(
          data.owner,
          {
            VIEW_CHANNEL: true,
            CONNECT: true
          }
        );

        return interaction.reply({
          content: "🙈 ซ่อนห้องแล้ว",
          ephemeral: true
        });
      }

      // ================= SHOW =================
      if (interaction.customId === "show") {

        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          {
            VIEW_CHANNEL: null
          }
        );

        return interaction.reply({
          content: "👁 แสดงห้องแล้ว",
          ephemeral: true
        });
      }
    }

    // ================= USER SELECT =================
    if (interaction.isUserSelectMenu()) {

      const channel =
        interaction.member.voice.channel;

      const data =
        tempChannels.get(channel?.id);

      if (
        !channel ||
        !data ||
        data.owner !== interaction.member.id
      ) {

        return interaction.reply({
          content: "❌ ผิดพลาด",
          ephemeral: true
        });
      }

      const targetId = interaction.values[0];

      // ===== ALLOW =====
      if (interaction.customId === "select_allow") {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            CONNECT: true,
            VIEW_CHANNEL: true
          }
        );

        return interaction.reply({
          content: `✅ อนุญาต <@${targetId}>`,
          ephemeral: true
        });
      }

      // ===== DENY =====
      if (interaction.customId === "select_deny") {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            CONNECT: false,
            VIEW_CHANNEL: false
          }
        );

        return interaction.reply({
          content: `🚫 ห้าม <@${targetId}>`,
          ephemeral: true
        });
      }

      // ===== TRANSFER =====
      if (interaction.customId === "select_transfer") {

        data.owner = targetId;

        const user = channel.members.get(targetId);

        await channel.setName(
          `📍・ห้องส่วนตัวของ ${user.user.username}`
        );

        return interaction.reply({
          content: `🔁 โอนเจ้าของห้องแล้ว`,
          ephemeral: true
        });
      }
    }

    // ================= MODAL =================
    if (interaction.isModalSubmit()) {

      const channel =
        interaction.member.voice.channel;

      const data =
        tempChannels.get(channel?.id);

      if (
        !channel ||
        !data ||
        data.owner !== interaction.member.id
      ) {

        return interaction.reply({
          content: "❌ ผิดพลาด",
          ephemeral: true
        });
      }

      // ===== RENAME =====
      if (interaction.customId === "rename_room") {

        const name =
          interaction.fields.getTextInputValue("room_name");

        await channel.setName(`📍・${name}`);

        return interaction.reply({
          content: "✏️ เปลี่ยนชื่อห้องแล้ว",
          ephemeral: true
        });
      }

      // ===== LIMIT =====
      if (interaction.customId === "limit_room") {

        const limit = parseInt(
          interaction.fields.getTextInputValue("limit_input")
        );

        await channel.setUserLimit(limit || 0);

        return interaction.reply({
          content: "🎯 ตั้งจำนวนคนแล้ว",
          ephemeral: true
        });
      }
    }

  } catch (err) {

    console.error(err);

    if (!interaction.replied) {

      interaction.reply({
        content: "❌ เกิดข้อผิดพลาด",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

client.login(token);
