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

/* =========================
   ENV
========================= */

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;

const allowRoleIds = process.env.ALLOW_ROLE_ID
  ? process.env.ALLOW_ROLE_ID.split(",").map(id => id.trim())
  : [];

/* =========================
   CLIENT
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

/* =========================
   TEMP CHANNEL
========================= */

const tempChannels = new Map();

/* =========================
   BIG ROLE IDS
========================= */

const bigRoleIds = [
  "1418171543379855411",
  "1418171543379855412",
  "1418171543379855413",
  "1418171543379855414",
  "1418171543379855415",
  "1418171543379855416",
  "1418171543379855417",
  "1418171543379855418",
  "1418171543379855419",
  "1418171543379855420",
  "1418171543379855421",
  "1418171543379855422",
  "1418171543379855423",
  "1418171543379855424"
];

/* =========================
   READY
========================= */

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({
    version: "10"
  }).setToken(token);

  const commands = [
    {
      name: "room",
      description: "เปิดเมนูจัดการห้องส่วนตัว"
    }
  ];

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("Slash command registered");
  } catch (error) {
    console.error(error);
  }
});

/* =========================
   VOICE STATE
========================= */

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    const member = newState.member;

    if (!member) return;

    /* =========================
       CREATE ROOM
    ========================= */

    if (newState.channelId === createChannelId) {
      const channel = await newState.guild.channels.create({
        name: `ห้องของ ${member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,

        permissionOverwrites: [
          {
            id: newState.guild.id,
            allow: ["ViewChannel"],
            deny: ["Connect"]
          },

          {
            id: member.id,
            allow: ["ViewChannel", "Connect"]
          },

          {
            id: client.user.id,
            allow: [
              "ViewChannel",
              "Connect",
              "ManageChannels",
              "MoveMembers"
            ]
          },

          ...bigRoleIds.map(roleId => ({
            id: roleId,
            allow: ["ViewChannel", "Connect"]
          })),

          ...allowRoleIds.map(roleId => ({
            id: roleId,
            allow: ["ViewChannel", "Connect"]
          }))
        ]
      });

      tempChannels.set(channel.id, {
        owner: member.id
      });

      await member.voice.setChannel(channel);

      console.log(
        `Created room ${channel.id} for ${member.user.tag}`
      );
    }

    /* =========================
       DELETE EMPTY ROOM
    ========================= */

    if (
      oldState.channel &&
      tempChannels.has(oldState.channel.id) &&
      oldState.channel.members.size === 0
    ) {
      const channel = oldState.channel;

      tempChannels.delete(channel.id);

      try {
        await channel.delete();

        console.log(
          `Deleted room ${channel.id}`
        );
      } catch (error) {
        console.error(error);
      }
    }
  } catch (error) {
    console.error(
      "voiceStateUpdate error:",
      error
    );
  }
});

/* =========================
   INTERACTION
========================= */

client.on("interactionCreate", async interaction => {
  try {

    /* =========================
       /ROOM
    ========================= */

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== "room") return;

      const embed = new EmbedBuilder()
        .setTitle("🎛️ ระบบจัดการห้องส่วนตัว")
        .setDescription(
          "เลือกปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("name")
          .setLabel("เปลี่ยนชื่อ")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("lock")
          .setLabel("ล็อกห้อง")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId("unlock")
          .setLabel("ปลดล็อก")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId("limit")
          .setLabel("จำกัดจำนวน")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("owner")
          .setLabel("เจ้าของห้อง")
          .setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("hide")
          .setLabel("ซ่อนห้อง")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("show")
          .setLabel("แสดงห้อง")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("transfer")
          .setLabel("โอนเจ้าของ")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("allow")
          .setLabel("อนุญาต")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId("deny")
          .setLabel("ไม่อนุญาต")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        embeds: [embed],
        components: [
          row1,
          row2
        ]
      });

      return;
    }

    /* =========================
       BUTTON
    ========================= */

    if (interaction.isButton()) {
      const member = interaction.member;

      if (!member.voice.channel) {
        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องเสียงก่อน",
          ephemeral: true
        });
      }

      const channel = member.voice.channel;

      if (!tempChannels.has(channel.id)) {
        return interaction.reply({
          content: "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",
          ephemeral: true
        });
      }

      const data = tempChannels.get(channel.id);

      /* =========================
         OWNER
      ========================= */

      if (interaction.customId === "owner") {
        return interaction.reply({
          content: `👑 เจ้าของห้องคือ <@${data.owner}>`,
          ephemeral: true
        });
      }

      /* =========================
         CHECK OWNER
      ========================= */

      if (data.owner !== member.id) {
        return interaction.reply({
          content:
            "❌ เฉพาะเจ้าของห้องเท่านั้นที่ใช้คำสั่งนี้ได้",
          ephemeral: true
        });
      }

      /* =========================
         RENAME MODAL
      ========================= */

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
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      /* =========================
         LIMIT MODAL
      ========================= */

      if (interaction.customId === "limit") {
        const modal = new ModalBuilder()
          .setCustomId("limit_room")
          .setTitle("จำกัดจำนวนสมาชิก");

        const input = new TextInputBuilder()
          .setCustomId("room_limit")
          .setLabel("จำนวนสมาชิก 0 - 99")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      /* =========================
         USER SELECT
      ========================= */

      if (
        interaction.customId === "allow" ||
        interaction.customId === "deny" ||
        interaction.customId === "transfer"
      ) {
        const menu = new UserSelectMenuBuilder()
          .setCustomId(
            `select_${interaction.customId}`
          )
          .setPlaceholder("เลือกสมาชิก");

        return interaction.reply({
          components: [
            new ActionRowBuilder().addComponents(menu)
          ],
          ephemeral: true
        });
      }

      /* =========================
         DEFER
      ========================= */

      await interaction.deferReply({
        ephemeral: true
      });

      /* =========================
         LOCK
      ========================= */

      if (interaction.customId === "lock") {

        await interaction.editReply({
          content: "🔒 ล็อกห้องเรียบร้อยแล้ว"
        });

        const tasks = [];

        tasks.push(
          channel.permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                ViewChannel: true,
                Connect: false
              }
            )
            .catch(() => {})
        );

        for (const roleId of allowRoleIds) {
          tasks.push(
            channel.permissionOverwrites
              .edit(
                roleId,
                {
                  ViewChannel: true,
                  Connect: false
                }
              )
              .catch(() => {})
          );
        }

        Promise.allSettled(tasks).catch(() => {});

        return;
      }

      /* =========================
         UNLOCK
         เร่งความเร็วเพิ่มเติม
      ========================= */

      if (interaction.customId === "unlock") {

        await interaction.editReply({
          content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"
        });

        /*
         * ตอน LOCK ค่า @everyone
         * ถูกตั้ง Connect:false อยู่แล้ว
         *
         * ดังนั้นตอน UNLOCK
         * ไม่ต้องส่งคำสั่ง @everyone ซ้ำ
         *
         * เปิดเฉพาะ Role ที่อนุญาต
         * และส่งพร้อมกัน
         */

        const tasks = allowRoleIds.map(roleId =>
          channel.permissionOverwrites
            .edit(
              roleId,
              {
                Connect: true
              }
            )
            .catch(() => {})
        );

        Promise.allSettled(tasks).catch(() => {});

        return;
      }

      /* =========================
         HIDE
      ========================= */

      if (interaction.customId === "hide") {

        channel._savedOverwrites =
          channel.permissionOverwrites.cache.map(
            overwrite => ({
              id: overwrite.id,
              allow: overwrite.allow.bitfield,
              deny: overwrite.deny.bitfield
            })
          );

        await channel.permissionOverwrites.set([
          {
            id: interaction.guild.id,
            deny: [
              "ViewChannel",
              "Connect"
            ]
          },

          {
            id: client.user.id,
            allow: [
              "ViewChannel",
              "Connect",
              "ManageChannels",
              "MoveMembers"
            ]
          },

          {
            id: data.owner,
            allow: [
              "ViewChannel",
              "Connect"
            ]
          }
        ]);

        return interaction.editReply({
          content: "👁️ ซ่อนห้องเรียบร้อยแล้ว"
        });
      }

      /* =========================
         SHOW
      ========================= */

      if (interaction.customId === "show") {

        if (!channel._savedOverwrites) {
          return interaction.editReply({
            content:
              "❌ ยังไม่มีข้อมูลสิทธิ์เดิมของห้อง"
          });
        }

        await channel.permissionOverwrites.set(
          channel._savedOverwrites
        );

        delete channel._savedOverwrites;

        return interaction.editReply({
          content: "👁️ แสดงห้องเรียบร้อยแล้ว"
        });
      }
    }

    /* =========================
       USER SELECT RESULT
    ========================= */

    if (interaction.isUserSelectMenu()) {

      const member = interaction.member;

      if (!member.voice.channel) {
        return interaction.update({
          content: "❌ คุณต้องอยู่ในห้องเสียงก่อน",
          components: []
        });
      }

      const channel = member.voice.channel;

      if (!tempChannels.has(channel.id)) {
        return interaction.update({
          content: "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",
          components: []
        });
      }

      const data = tempChannels.get(channel.id);

      if (data.owner !== member.id) {
        return interaction.update({
          content:
            "❌ เฉพาะเจ้าของห้องเท่านั้น",
          components: []
        });
      }

      const targetId = interaction.values[0];

      /* =========================
         ALLOW
      ========================= */

      if (interaction.customId === "select_allow") {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        return interaction.update({
          content:
            `✅ อนุญาต <@${targetId}> เข้าห้องแล้ว`,
          components: []
        });
      }

      /* =========================
         DENY
      ========================= */

      if (interaction.customId === "select_deny") {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            ViewChannel: true,
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
          await targetMember.voice
            .disconnect()
            .catch(() => {});
        }

        return interaction.update({
          content:
            `🚫 ไม่อนุญาต <@${targetId}> แล้ว`,
          components: []
        });
      }

      /* =========================
         TRANSFER
      ========================= */

      if (interaction.customId === "select_transfer") {

        const targetMember =
          await interaction.guild.members
            .fetch(targetId)
            .catch(() => null);

        if (!targetMember) {
          return interaction.update({
            content: "❌ ไม่พบสมาชิก",
            components: []
          });
        }

        data.owner = targetId;

        await channel.setName(
          `ห้องของ ${targetMember.user.username}`
        );

        await channel.permissionOverwrites.edit(
          targetId,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        return interaction.update({
          content:
            `👑 โอนเจ้าของห้องให้ <@${targetId}> แล้ว`,
          components: []
        });
      }
    }

    /* =========================
       MODAL SUBMIT
    ========================= */

    if (interaction.isModalSubmit()) {

      const member = interaction.member;

      if (!member.voice.channel) {
        return interaction.reply({
          content:
            "❌ คุณต้องอยู่ในห้องเสียงก่อน",
          ephemeral: true
        });
      }

      const channel = member.voice.channel;

      if (!tempChannels.has(channel.id)) {
        return interaction.reply({
          content:
            "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",
          ephemeral: true
        });
      }

      const data = tempChannels.get(channel.id);

      if (data.owner !== member.id) {
        return interaction.reply({
          content:
            "❌ เฉพาะเจ้าของห้องเท่านั้น",
          ephemeral: true
        });
      }

      /* =========================
         RENAME
      ========================= */

      if (interaction.customId === "rename_room") {

        const name =
          interaction.fields.getTextInputValue(
            "room_name"
          );

        await channel.setName(name);

        return interaction.reply({
          content:
            "✅ เปลี่ยนชื่อห้องเรียบร้อยแล้ว",
          ephemeral: true
        });
      }

      /* =========================
         LIMIT
      ========================= */

      if (interaction.customId === "limit_room") {

        const value =
          interaction.fields.getTextInputValue(
            "room_limit"
          );

        const limit = Number(value);

        if (
          isNaN(limit) ||
          limit < 0 ||
          limit > 99
        ) {
          return interaction.reply({
            content:
              "❌ กรุณาใส่ตัวเลขระหว่าง 0 - 99",
            ephemeral: true
          });
        }

        await channel.setUserLimit(limit);

        return interaction.reply({
          content:
            `👥 ตั้งจำนวนสมาชิกสูงสุด ${limit} คนแล้ว`,
          ephemeral: true
        });
      }
    }

  } catch (error) {

    console.error(
      "interactionCreate error:",
      error
    );

    if (
      interaction.replied ||
      interaction.deferred
    ) {
      await interaction.editReply({
        content:
          "❌ เกิดข้อผิดพลาดในการทำรายการ"
      }).catch(() => {});
    } else {
      await interaction.reply({
        content:
          "❌ เกิดข้อผิดพลาดในการทำรายการ",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* =========================
   LOGIN
========================= */

client.login(token);
