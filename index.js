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
  console.log("Web Server is ready.");
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

// ================= TEMP CHANNELS =================
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

// ================= CREATE ROOM =================
client.on("voiceStateUpdate", async (oldState, newState) => {

  // ===== สร้างห้อง =====
  if (newState.channelId === createChannelId) {

    const channel = await newState.guild.channels.create({

      name: `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,

      type: ChannelType.GuildVoice,

      parent: categoryId,

      permissionOverwrites: [

        // ทุกคนเห็นห้อง แต่เข้าไม่ได้
        {
          id: newState.guild.id,

          allow: [
            "ViewChannel"
          ],

          deny: [
            "Connect"
          ]
        },

        // ยศที่กำหนด
        ...(allowRoleId ? [{
          id: allowRoleId,

          allow: [
            "ViewChannel"
          ],

          deny: [
            "Connect"
          ]
        }] : []),

        // เจ้าของห้อง
        {
          id: newState.member.id,

          allow: [
            "ViewChannel",
            "Connect",
            "ManageChannels",
            "MuteMembers",
            "DeafenMembers",
            "MoveMembers"
          ]
        }
      ]
    });

    // ย้ายเข้าห้อง
    await newState.setChannel(channel);

    // เก็บข้อมูลห้อง
    tempChannels.set(channel.id, {
      owner: newState.member.id
    });
  }

  // ===== คนออกจากห้อง =====
  if (
    oldState.channelId &&
    tempChannels.has(oldState.channelId)
  ) {

    const channel =
      oldState.guild.channels.cache.get(
        oldState.channelId
      );

    const data =
      tempChannels.get(oldState.channelId);

    if (!channel) return;

    // ===== ถ้าห้องว่าง =====
    if (channel.members.size === 0) {

      channel.delete().catch(() => {});

      tempChannels.delete(oldState.channelId);

      return;
    }

    // ===== โอนเจ้าของอัตโนมัติ =====
    if (oldState.member.id === data.owner) {

      const newOwner =
        channel.members.first();

      if (newOwner) {

        data.owner = newOwner.id;

        await channel.setName(
          `📍・ห้องส่วนตัวของ ${newOwner.user.username}`
        ).catch(() => {});

        // ให้สิทธิ์เจ้าของใหม่
        await channel.permissionOverwrites.edit(
          newOwner.id,
          {
            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MuteMembers: true,
            DeafenMembers: true,
            MoveMembers: true
          }
        );
      }
    }
  }
});

// ================= INTERACTION =================
client.on("interactionCreate", async (interaction) => {

  try {

    // =================================================
    // /room
    // =================================================
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
          "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ"
        )
        .setImage("https://i.ibb.co/Kjbw5BGb/image.png")
        .setFooter({
          text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        })
        .setColor(0x2b2d31);

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

      const row2 = new ActionRowBuilder()
        .addComponents(

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

    // =================================================
    // BUTTONS
    // =================================================
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

      // ===== owner =====
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

      // ===== เช็คเจ้าของ =====
      if (
        !data ||
        data.owner !== member.id
      ) {
        return interaction.reply({
          content: "❌ ไม่ใช่เจ้าของห้อง",
          ephemeral: true
        });
      }

      // ===== เปลี่ยนชื่อ =====
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

      // ===== ตั้งจำนวน =====
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

      // ===== เมนูเลือกสมาชิก =====
      if (
        ["allow", "deny", "transfer"]
          .includes(interaction.customId)
      ) {

        const menu =
          new UserSelectMenuBuilder()
            .setCustomId(
              `select_${interaction.customId}`
            );

        return interaction.reply({
          content: "โปรดเลือกสมาชิก",
          components: [
            new ActionRowBuilder()
              .addComponents(menu)
          ],
          ephemeral: true
        });
      }

      // ===== lock =====
      if (interaction.customId === "lock") {

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            Connect: false
          }
        );

        return interaction.reply({
          content: "🔒 ล็อกห้องแล้ว",
          ephemeral: true
        });
      }

      // ===== unlock =====
      if (interaction.customId === "unlock") {

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            Connect: true
          }
        );

        return interaction.reply({
          content: "🔓 ปลดล็อกห้องแล้ว",
          ephemeral: true
        });
      }

      // ===== hide =====
      if (interaction.customId === "hide") {

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: false
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
          content: "🙈 ซ่อนห้องแล้ว",
          ephemeral: true
        });
      }

      // ===== show =====
      if (interaction.customId === "show") {

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: true
          }
        );

        return interaction.reply({
          content: "👁 แสดงห้องแล้ว",
          ephemeral: true
        });
      }
    }

    // =================================================
    // SELECT MENU
    // =================================================
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

      const targetId =
        interaction.values[0];

      // ===== allow =====
      if (interaction.customId === "select_allow") {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            Connect: true,
            ViewChannel: true
          }
        );

        return interaction.reply({
          content: `✅ อนุญาต <@${targetId}> แล้ว`,
          ephemeral: true
        });
      }

      // ===== deny =====
      if (interaction.customId === "select_deny") {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            Connect: false,
            ViewChannel: true
          }
        );

        return interaction.reply({
          content: `🚫 ห้าม <@${targetId}> เข้าห้อง`,
          ephemeral: true
        });
      }

      // ===== transfer =====
      if (interaction.customId === "select_transfer") {

        data.owner = targetId;

        const user =
          interaction.guild.members.cache.get(
            targetId
          );

        await channel.setName(
          `📍・ห้องส่วนตัวของ ${user.user.username}`
        );

        return interaction.reply({
          content: `🔁 โอนห้องแล้ว`,
          ephemeral: true
        });
      }
    }

    // =================================================
    // MODAL
    // =================================================
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

      // ===== rename =====
      if (interaction.customId === "rename_room") {

        const name =
          interaction.fields.getTextInputValue(
            "room_name"
          );

        await channel.setName(
          `📍・${name}`
        );

        return interaction.reply({
          content: "✏️ เปลี่ยนชื่อแล้ว",
          ephemeral: true
        });
      }

      // ===== limit =====
      if (interaction.customId === "limit_room") {

        const limit = parseInt(
          interaction.fields.getTextInputValue(
            "limit_input"
          )
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

// ================= LOGIN =================
client.login(token);
