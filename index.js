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

  // ================= CREATE ROOM =================
  if (newState.channelId === createChannelId) {

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
            PermissionFlagsBits.ManageChannels
          ]
        }
      ]
    });

    await newState.setChannel(channel);

    tempChannels.set(channel.id, {
      owner: newState.member.id
    });
  }

  // ================= OWNER SYSTEM =================
  if (
    oldState.channelId &&
    tempChannels.has(oldState.channelId) &&
    oldState.channelId !== createChannelId
  ) {

    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    const data = tempChannels.get(oldState.channelId);

    if (!channel) return;

    // ไม่มีคนในห้อง
    if (channel.members.size === 0) {
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

      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: "❌ สำหรับแอดมินเท่านั้น",
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบห้องส่วนตัวประจำโซน")
        .setDescription(
          "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
          "🔹 สามารถสร้างและปรับแต่งห้องได้"
        )
        .setImage("https://i.ibb.co/Kjbw5BGb/image.png")
        .setFooter({
          text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้อง"
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

      await interaction.reply({
        embeds: [embed],
        components: [row1, row2]
      });
    }

    // ================= BUTTONS =================
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
              .setDescription(`<@${data.owner}>`)
              .setColor(0xFFD700)
          ],
          ephemeral: true
        });
      }

      // ===== OWNER ONLY =====
      if (!data || data.owner !== member.id) {
        return interaction.reply({
          content: "❌ คุณไม่ใช่เจ้าของห้อง",
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

      // ===== LIMIT =====
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

      // ===== USER MENU =====
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

      await interaction.deferReply({ ephemeral: true });

      // ===== LOCK =====
      if (interaction.customId === "lock") {

        await channel.permissionOverwrites.edit(interaction.guild.id, {
          Connect: false
        });

        if (allowRoleId) {
          await channel.permissionOverwrites.edit(allowRoleId, {
            Connect: false
          }).catch(() => {});
        }

        await channel.permissionOverwrites.edit(member.id, {
          Connect: true,
          ViewChannel: true
        });

        return interaction.editReply({
          content: "🔒 ล็อกห้องแล้ว"
        });
      }

      // ===== UNLOCK =====
      if (interaction.customId === "unlock") {

        await channel.permissionOverwrites.edit(interaction.guild.id, {
          Connect: true
        });

        if (allowRoleId) {
          await channel.permissionOverwrites.edit(allowRoleId, {
            Connect: true
          }).catch(() => {});
        }

        return interaction.editReply({
          content: "🔓 ปลดล็อกห้องแล้ว"
        });
      }

      // ===== HIDE =====
      if (interaction.customId === "hide") {

        await channel.permissionOverwrites.edit(interaction.guild.id, {
          ViewChannel: false
        });

        await channel.permissionOverwrites.edit(member.id, {
          ViewChannel: true,
          Connect: true
        });

        return interaction.editReply({
          content: "🙈 ซ่อนห้องแล้ว"
        });
      }

      // ===== SHOW =====
      if (interaction.customId === "show") {

        await channel.permissionOverwrites.edit(interaction.guild.id, {
          ViewChannel: true,
          Connect: true
        });

        return interaction.editReply({
          content: "👁 แสดงห้องแล้ว"
        });
      }
    }

    // ================= SELECT MENU =================
    if (interaction.isUserSelectMenu()) {

      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);

      if (!channel || !data) {
        return interaction.reply({
          content: "❌ ผิดพลาด",
          ephemeral: true
        });
      }

      const targetId = interaction.values[0];

      // ===== ALLOW =====
      if (interaction.customId === "select_allow") {

        await channel.permissionOverwrites.edit(targetId, {
          Connect: true,
          ViewChannel: true
        });

        return interaction.reply({
          content: `✅ อนุญาต <@${targetId}>`,
          ephemeral: true
        });
      }

      // ===== DENY =====
      if (interaction.customId === "select_deny") {

        await channel.permissionOverwrites.edit(targetId, {
          Connect: false,
          ViewChannel: false
        });

        return interaction.reply({
          content: `🚫 บล็อก <@${targetId}>`,
          ephemeral: true
        });
      }

      // ===== TRANSFER =====
      if (interaction.customId === "select_transfer") {

        const user = channel.members.get(targetId);

        if (!user) {
          return interaction.reply({
            content: "❌ ผู้ใช้นี้ไม่ได้อยู่ในห้อง",
            ephemeral: true
          });
        }

        data.owner = targetId;

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

// ================= LOGIN =================
client.login(token);
