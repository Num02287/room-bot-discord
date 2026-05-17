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

  // ================= CREATE ROOM =================
  if (newState.channelId === createChannelId) {

    // ตรวจว่ามีห้องอยู่แล้วไหม
    const existingRoom = [...tempChannels.entries()].find(
      ([id, data]) => data.owner === newState.member.id
    );

    // ถ้ามีห้องอยู่แล้ว -> ย้ายกลับเข้าห้องเดิม
    if (existingRoom) {

      const oldRoom = newState.guild.channels.cache.get(existingRoom[0]);

      if (oldRoom) {
        return await newState.setChannel(oldRoom);
      }
    }

    // สร้างห้องใหม่
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

    // ย้ายเข้าห้อง
    await newState.setChannel(channel);

    // บันทึกห้อง
    tempChannels.set(channel.id, {
      owner: newState.member.id
    });

    return;
  }

  // ================= OWNER SYSTEM =================
  if (
    oldState.channelId &&
    oldState.channelId !== createChannelId &&
    tempChannels.has(oldState.channelId)
  ) {

    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    const data = tempChannels.get(oldState.channelId);

    if (!channel) return;

    // ไม่ลบห้อง
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

    // ================= BUTTON =================
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

      // ===== SELECT MENU =====
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
