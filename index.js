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
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

// ================= READY =================
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

// ================= VOICE SYSTEM =================
client.on("voiceStateUpdate", async (oldState, newState) => {

  // ===== CREATE ROOM =====
  if (newState.channelId === createChannelId) {

    // เช็คว่ามีห้องอยู่แล้วไหม
    const existingRoom = [...tempChannels.entries()].find(
      ([id, data]) => data.owner === newState.member.id
    );

    // ถ้ามีอยู่แล้ว → ย้ายกลับ
    if (existingRoom) {

      const oldRoom = newState.guild.channels.cache.get(existingRoom[0]);

      if (oldRoom) {
        return await newState.setChannel(oldRoom);
      }
    }

    // สร้างห้อง
    const channel = await newState.guild.channels.create({
      name: `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: categoryId,

      permissionOverwrites: [

        {
          id: newState.guild.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect
          ]
        },

        {
          id: newState.member.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
            PermissionFlagsBits.DeafenMembers
          ]
        }
      ]
    });

    // ย้ายเข้าห้อง
    await newState.setChannel(channel);

    // บันทึกข้อมูล
    tempChannels.set(channel.id, {
      owner: newState.member.id
    });

    return;
  }

  // ===== ROOM SYSTEM =====
  if (
    oldState.channelId &&
    oldState.channelId !== createChannelId &&
    tempChannels.has(oldState.channelId)
  ) {

    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    const data = tempChannels.get(oldState.channelId);

    if (!channel) return;

    // ===== ลบห้องเมื่อไม่มีคน =====
    if (channel.members.size === 0) {

      tempChannels.delete(channel.id);

      await channel.delete().catch(() => {});

      return;
    }

    // ===== โอนเจ้าของ =====
    if (oldState.member.id === data.owner) {

      const newOwner = channel.members.first();

      if (!newOwner) return;

      data.owner = newOwner.id;

      await channel.setName(
        `📍・ห้องส่วนตัวของ ${newOwner.user.username}`
      ).catch(() => {});

      await channel.permissionOverwrites.edit(newOwner.id, {
        ViewChannel: true,
        Connect: true,
        ManageChannels: true,
        MoveMembers: true,
        MuteMembers: true,
        DeafenMembers: true
      }).catch(() => {});
    }
  }
});

// ================= INTERACTION =================
client.on("interactionCreate", async (interaction) => {

  try {

    // ===== /ROOM =====
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "room"
    ) {

      if (
        !interaction.member.permissions.has(
          PermissionFlagsBits.Administrator
        )
      ) {
        return interaction.reply({
          content: "❌ สำหรับแอดมินเท่านั้น",
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบห้องส่วนตัว")
        .setDescription(
          "🔹 ระบบสร้างห้องอัตโนมัติ\n" +
          "🔹 กดปุ่มด้านล่างเพื่อจัดการห้อง"
        )
        .setColor(0x2b2d31);

      const row = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("lock")
          .setLabel("ล็อก")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("unlock")
          .setLabel("ปลดล็อก")
          .setEmoji("🔓")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("name")
          .setLabel("เปลี่ยนชื่อ")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("owner")
          .setLabel("เจ้าของ")
          .setEmoji("👑")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({
        embeds: [embed],
        components: [row]
      });
    }

    // ===== BUTTON =====
    if (interaction.isButton()) {

      const member = interaction.member;
      const channel = member.voice.channel;

      if (!channel) {
        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องก่อน",
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

      // ===== OWNER =====
      if (interaction.customId === "owner") {

        return interaction.reply({
          content: `👑 เจ้าของห้องคือ <@${data.owner}>`,
          ephemeral: true
        });
      }

      // ===== OWNER ONLY =====
      if (data.owner !== member.id) {
        return interaction.reply({
          content: "❌ คุณไม่ใช่เจ้าของห้อง",
          ephemeral: true
        });
      }

      // ===== LOCK =====
      if (interaction.customId === "lock") {

        await channel.permissionOverwrites.edit(interaction.guild.id, {
          Connect: false
        });

        await channel.permissionOverwrites.edit(member.id, {
          Connect: true
        });

        return interaction.reply({
          content: "🔒 ล็อกห้องแล้ว",
          ephemeral: true
        });
      }

      // ===== UNLOCK =====
      if (interaction.customId === "unlock") {

        await channel.permissionOverwrites.edit(interaction.guild.id, {
          Connect: true
        });

        return interaction.reply({
          content: "🔓 ปลดล็อกห้องแล้ว",
          ephemeral: true
        });
      }

      // ===== NAME =====
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
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit()) {

      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);

      if (!channel || !data) {
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

// ================= LOGIN =================
client.login(token);
