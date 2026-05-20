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

// ===== Web Server =====
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web Server Ready");
});

// ===== ENV =====
const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

// ===== Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

const tempChannels = new Map();

// ===== Slash Commands =====
const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("ระบบห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

// ===== Ready =====
client.once("ready", async () => {
  console.log(`✅ Login as ${client.user.tag}`);

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

// ===== ระบบสร้างห้อง =====
client.on("voiceStateUpdate", async (oldState, newState) => {

  // สร้างห้อง
  if (newState.channelId === createChannelId) {

    const channel = await newState.guild.channels.create({
      name: `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: categoryId
    });

    await newState.setChannel(channel);

    tempChannels.set(channel.id, {
      owner: newState.member.id
    });
  }

  // ลบห้อง
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {

    const channel = oldState.guild.channels.cache.get(oldState.channelId);

    if (!channel) return;

    const data = tempChannels.get(channel.id);

    // ไม่มีคน
    if (channel.members.size === 0) {
      tempChannels.delete(channel.id);
      return channel.delete().catch(() => {});
    }

    // โอนเจ้าของ
    if (oldState.member.id === data.owner) {

      const newOwner = channel.members.first();

      if (!newOwner) return;

      data.owner = newOwner.id;

      channel.setName(
        `📍・ห้องส่วนตัวของ ${newOwner.user.username}`
      ).catch(() => {});
    }
  }
});

// ===== Interaction =====
client.on("interactionCreate", async (interaction) => {

  try {

    // ===== Slash Command =====
    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === "room") {

        const embed = new EmbedBuilder()
          .setTitle("🏠 ระบบสร้างห้องส่วนตัว")
          .setDescription(
            "🔹 จัดการห้องเสียงส่วนตัวของคุณ\n🔹 สามารถล็อก / ซ่อน / เปลี่ยนชื่อ / โอนห้องได้"
          )
          .setImage("https://i.ibb.co/Kjbw5BGb/image.png")
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

        await interaction.reply({
          embeds: [embed],
          components: [row1, row2]
        });
      }
    }

    // ===== Buttons =====
    if (interaction.isButton()) {

      const member = interaction.member;
      const channel = member.voice.channel;

      if (!channel) {
        return interaction.reply({
          content: "❌ ต้องอยู่ในห้องก่อน",
          ephemeral: true
        });
      }

      const data = tempChannels.get(channel.id);

      if (!data) {
        return interaction.reply({
          content: "❌ ห้องนี้ไม่ได้อยู่ในระบบ",
          ephemeral: true
        });
      }

      // ดูเจ้าของ
      if (interaction.customId === "owner") {

        return interaction.reply({
          content: `👑 เจ้าของห้องคือ <@${data.owner}>`,
          ephemeral: true
        });
      }

      // เช็คเจ้าของ
      if (data.owner !== member.id) {
        return interaction.reply({
          content: "❌ คุณไม่ใช่เจ้าของห้อง",
          ephemeral: true
        });
      }

      // เปลี่ยนชื่อ
      if (interaction.customId === "name") {

        const modal = new ModalBuilder()
          .setCustomId("rename_room")
          .setTitle("เปลี่ยนชื่อห้อง");

        const input = new TextInputBuilder()
          .setCustomId("room_name")
          .setLabel("ชื่อห้องใหม่")
          .setStyle(TextInputStyle.Short);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // ตั้งจำนวน
      if (interaction.customId === "limit") {

        const modal = new ModalBuilder()
          .setCustomId("limit_room")
          .setTitle("ตั้งจำนวนคน");

        const input = new TextInputBuilder()
          .setCustomId("limit_input")
          .setLabel("ใส่จำนวน")
          .setStyle(TextInputStyle.Short);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // เมนูเลือกสมาชิก
      if (["allow", "deny", "transfer"].includes(interaction.customId)) {

        const menu = new UserSelectMenuBuilder()
          .setCustomId(`select_${interaction.customId}`);

        return interaction.reply({
          content: "เลือกสมาชิก",
          components: [
            new ActionRowBuilder().addComponents(menu)
          ],
          ephemeral: true
        });
      }

      // ล็อก
      if (interaction.customId === "lock") {

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          { Connect: false }
        );

        if (allowRoleId) {
          await channel.permissionOverwrites.edit(
            allowRoleId,
            { Connect: false }
          );
        }

        await channel.permissionOverwrites.edit(
          data.owner,
          {
            Connect: true,
            ViewChannel: true
          }
        );

        return interaction.reply({
          content: "🔒 ล็อกห้องแล้ว",
          ephemeral: true
        });
      }

      // ปลดล็อก
      if (interaction.customId === "unlock") {

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          { Connect: true }
        );

        if (allowRoleId) {
          await channel.permissionOverwrites.edit(
            allowRoleId,
            { Connect: true }
          );
        }

        return interaction.reply({
          content: "🔓 ปลดล็อกแล้ว",
          ephemeral: true
        });
      }

      // ซ่อน
      if (interaction.customId === "hide") {

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          { ViewChannel: false }
        );

        return interaction.reply({
          content: "🙈 ซ่อนห้องแล้ว",
          ephemeral: true
        });
      }

      // แสดง
      if (interaction.customId === "show") {

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          { ViewChannel: true }
        );

        return interaction.reply({
          content: "👁 แสดงห้องแล้ว",
          ephemeral: true
        });
      }
    }

    // ===== Select Menu =====
    if (interaction.isUserSelectMenu()) {

      const channel = interaction.member.voice.channel;

      if (!channel) return;

      const data = tempChannels.get(channel.id);

      if (!data || data.owner !== interaction.member.id) {
        return interaction.reply({
          content: "❌ ไม่ใช่เจ้าของ",
          ephemeral: true
        });
      }

      const targetId = interaction.values[0];

      // allow
      if (interaction.customId === "select_allow") {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            Connect: true,
            ViewChannel: true
          }
        );

        return interaction.reply({
          content: `✅ อนุญาต <@${targetId}>`,
          ephemeral: true
        });
      }

      // deny
      if (interaction.customId === "select_deny") {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            Connect: false
          }
        );

        return interaction.reply({
          content: `🚫 บล็อก <@${targetId}>`,
          ephemeral: true
        });
      }

      // transfer
      if (interaction.customId === "select_transfer") {

        data.owner = targetId;

        const user = interaction.guild.members.cache.get(targetId);

        await channel.setName(
          `📍・ห้องส่วนตัวของ ${user.user.username}`
        );

        return interaction.reply({
          content: `🔁 โอนเจ้าของแล้ว`,
          ephemeral: true
        });
      }
    }

    // ===== Modal =====
    if (interaction.isModalSubmit()) {

      const channel = interaction.member.voice.channel;

      if (!channel) return;

      const data = tempChannels.get(channel.id);

      if (!data || data.owner !== interaction.member.id) {
        return interaction.reply({
          content: "❌ ไม่ใช่เจ้าของ",
          ephemeral: true
        });
      }

      // เปลี่ยนชื่อ
      if (interaction.customId === "rename_room") {

        const name = interaction.fields.getTextInputValue("room_name");

        await channel.setName(`📍・${name}`);

        return interaction.reply({
          content: "✏️ เปลี่ยนชื่อแล้ว",
          ephemeral: true
        });
      }

      // จำนวนคน
      if (interaction.customId === "limit_room") {

        const limit = parseInt(
          interaction.fields.getTextInputValue("limit_input")
        );

        await channel.setUserLimit(limit || 0);

        return interaction.reply({
          content: "🎯 ตั้งจำนวนแล้ว",
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
