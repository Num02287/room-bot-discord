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

// =====================================================
// EXPRESS SERVER
// =====================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web Server is ready.");
});

// =====================================================
// CONFIG
// =====================================================

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;

const allowRoleIds = process.env.ALLOW_ROLE_ID
  ? process.env.ALLOW_ROLE_ID
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  : [];

// =====================================================
// ROLE
// =====================================================

const bigRoleIds = [
  "1502362111345426432",
  "1546873993334890577",
  "1500549655107469535",
  "1492931714887192739",
  "1555616129513164972",
  "1492931717437063342",
  "1492931719832014978",
  "1492931721384038480",
  "1555519802486030346",
  "1501857544400932904",
  "1492931725129683124",
  "1493650662624592032",
  "1492931723330064425",
  "1556184437195280515"
];

// =====================================================
// CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// =====================================================
// TEMP CHANNEL
// =====================================================

const tempChannels = new Map();

// =====================================================
// READY
// =====================================================

client.once("ready", async () => {
  console.log(`Bot Online: ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(token);

    const commands = [
      new SlashCommandBuilder()
        .setName("room")
        .setDescription("เปิดแผงควบคุมห้องส่วนตัว")
        .toJSON()
    ];

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("Slash command registered.");
  } catch (error) {
    console.error("Command register error:", error);
  }
});

// =====================================================
// VOICE STATE
// =====================================================

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    // =================================================
    // CREATE ROOM
    // =================================================

    if (
      newState.channelId === createChannelId &&
      oldState.channelId !== createChannelId
    ) {
      const member = newState.member;

      if (!member) return;

      const guild = newState.guild;

      const channel = await guild.channels.create({
        name: `ห้องของ ${member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,

        permissionOverwrites: [
          {
            id: guild.id,
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
    }

    // =================================================
    // DELETE EMPTY ROOM
    // =================================================

    if (oldState.channelId) {
      const oldChannel = oldState.channel;

      if (
        oldChannel &&
        tempChannels.has(oldChannel.id) &&
        oldChannel.members.size === 0
      ) {
        tempChannels.delete(oldChannel.id);

        try {
          await oldChannel.delete();
        } catch (error) {
          console.log(
            "Delete channel error:",
            error.message
          );
        }
      }
    }
  } catch (error) {
    console.error("VoiceState error:", error);
  }
});

// =====================================================
// INTERACTION
// =====================================================

client.on("interactionCreate", async interaction => {
  try {

    // =================================================
    // /ROOM
    // =================================================

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== "room") return;

      const embed = new EmbedBuilder()
        .setTitle("🎛️ ระบบจัดการห้องส่วนตัว")
        .setDescription(
          "เลือกเมนูด้านล่างเพื่อจัดการห้องเสียงของคุณ"
        )
        .setColor(0x5865f2)
        .setImage(
          "https://cdn.discordapp.com/attachments/1502633054919632989/1502633274959796234/room.png"
        );

      const row1 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("name")
          .setLabel("เปลี่ยนชื่อ")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("lock")
          .setLabel("ล็อกห้อง")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId("unlock")
          .setLabel("ปลดล็อก")
          .setEmoji("🔓")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId("limit")
          .setLabel("จำกัดคน")
          .setEmoji("👥")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("owner")
          .setLabel("เจ้าของห้อง")
          .setEmoji("👑")
          .setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("hide")
          .setLabel("ซ่อนห้อง")
          .setEmoji("🙈")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("show")
          .setLabel("แสดงห้อง")
          .setEmoji("👀")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("transfer")
          .setLabel("โอนเจ้าของ")
          .setEmoji("🔄")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("allow")
          .setLabel("อนุญาต")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId("deny")
          .setLabel("ไม่อนุญาต")
          .setEmoji("❌")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row1, row2]
      });

      return;
    }

    // =================================================
    // BUTTON
    // =================================================

    if (interaction.isButton()) {

      const member = interaction.member;

      if (!member || !member.voice.channel) {
        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องเสียงก่อน",
          ephemeral: true
        });
      }

      const channel = member.voice.channel;
      const data = tempChannels.get(channel.id);

      if (!data) {
        return interaction.reply({
          content: "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",
          ephemeral: true
        });
      }

      // =================================================
      // OWNER INFO
      // =================================================

      if (interaction.customId === "owner") {

        const owner = await interaction.guild.members
          .fetch(data.owner)
          .catch(() => null);

        if (!owner) {
          return interaction.reply({
            content: "❌ ไม่พบข้อมูลเจ้าของห้อง",
            ephemeral: true
          });
        }

        return interaction.reply({
          content:
            `👑 เจ้าของห้องคือ **${owner.user.username}**`,
          ephemeral: true
        });
      }

      // =================================================
      // 🔒 LOCK
      // รอ 1 วินาทีแล้วตอบ
      // =================================================

      if (interaction.customId === "lock") {

        if (data.owner !== interaction.user.id) {
          return interaction.reply({
            content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
            ephemeral: true
          });
        }

        // แจ้ง Discord ว่ากำลังประมวลผล
        await interaction.deferReply({
          ephemeral: true
        });

        // รอ 1 วินาที
        await new Promise(resolve =>
          setTimeout(resolve, 1000)
        );

        // เปลี่ยน Permission
        const lockPromises = [
          channel.permissionOverwrites.edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: false
            }
          )
        ];

        for (const roleId of allowRoleIds) {
          lockPromises.push(
            channel.permissionOverwrites.edit(
              roleId,
              {
                ViewChannel: true,
                Connect: false
              }
            )
          );
        }

        await Promise.all(
          lockPromises.map(promise =>
            promise.catch(error =>
              console.log(
                "Lock permission error:",
                error.message
              )
            )
          )
        );

        // ตอบหลังครบ 1 วินาที
        await interaction.editReply({
          content: "🔒 ล็อกห้องเรียบร้อยแล้ว"
        });

        return;
      }

      // =================================================
      // 🔓 UNLOCK
      // รอ 1 วินาทีแล้วตอบ
      // =================================================

      if (interaction.customId === "unlock") {

        if (data.owner !== interaction.user.id) {
          return interaction.reply({
            content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
            ephemeral: true
          });
        }

        // แจ้ง Discord ว่ากำลังประมวลผล
        await interaction.deferReply({
          ephemeral: true
        });

        // รอ 1 วินาที
        await new Promise(resolve =>
          setTimeout(resolve, 1000)
        );

        // เปลี่ยน Permission
        const unlockPromises = [
          channel.permissionOverwrites.edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: false
            }
          )
        ];

        for (const roleId of allowRoleIds) {
          unlockPromises.push(
            channel.permissionOverwrites.edit(
              roleId,
              {
                ViewChannel: true,
                Connect: true
              }
            )
          );
        }

        await Promise.all(
          unlockPromises.map(promise =>
            promise.catch(error =>
              console.log(
                "Unlock permission error:",
                error.message
              )
            )
          )
        );

        // ตอบหลังครบ 1 วินาที
        await interaction.editReply({
          content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"
        });

        return;
      }

      // =================================================
      // CHECK OWNER
      // =================================================

      if (data.owner !== interaction.user.id) {
        return interaction.reply({
          content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
          ephemeral: true
        });
      }

      // =================================================
      // DEFER OTHER BUTTONS
      // =================================================

      await interaction.deferReply({
        ephemeral: true
      });

      // =================================================
      // RENAME
      // =================================================

      if (interaction.customId === "name") {

        const modal = new ModalBuilder()
          .setCustomId("rename_modal")
          .setTitle("เปลี่ยนชื่อห้อง");

        const input = new TextInputBuilder()
          .setCustomId("new_name")
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
      // LIMIT
      // =================================================

      if (interaction.customId === "limit") {

        const modal = new ModalBuilder()
          .setCustomId("limit_modal")
          .setTitle("จำกัดจำนวนคน");

        const input = new TextInputBuilder()
          .setCustomId("user_limit")
          .setLabel("จำนวนคน 0-99")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // =================================================
      // HIDE
      // =================================================

      if (interaction.customId === "hide") {

        const permissions =
          channel.permissionOverwrites.cache.map(
            overwrite => ({
              id: overwrite.id,
              allow: overwrite.allow.bitfield.toString(),
              deny: overwrite.deny.bitfield.toString()
            })
          );

        data.savedPermissions = permissions;

        await channel.permissionOverwrites.set([
          {
            id: interaction.guild.id,
            allow: ["ViewChannel"],
            deny: ["Connect"]
          },
          {
            id: interaction.user.id,
            allow: [
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
          }
        ]);

        return interaction.editReply({
          content: "🙈 ซ่อนห้องเรียบร้อยแล้ว"
        });
      }

      // =================================================
      // SHOW
      // =================================================

      if (interaction.customId === "show") {

        if (!data.savedPermissions) {
          return interaction.editReply({
            content: "❌ ไม่มีข้อมูล Permission เดิม"
          });
        }

        await channel.permissionOverwrites.set(
          data.savedPermissions
        );

        delete data.savedPermissions;

        return interaction.editReply({
          content: "👀 แสดงห้องเรียบร้อยแล้ว"
        });
      }

      // =================================================
      // USER SELECT
      // =================================================

      if (
        interaction.customId === "allow" ||
        interaction.customId === "deny" ||
        interaction.customId === "transfer"
      ) {

        const menu = new UserSelectMenuBuilder()
          .setCustomId(
            `select_${interaction.customId}`
          )
          .setPlaceholder("เลือกสมาชิก")
          .setMinValues(1)
          .setMaxValues(1);

        const row = new ActionRowBuilder()
          .addComponents(menu);

        return interaction.editReply({
          content: "👤 เลือกสมาชิกที่ต้องการ",
          components: [row]
        });
      }
    }

    // =================================================
    // USER SELECT MENU
    // =================================================

    if (interaction.isUserSelectMenu()) {

      const member = interaction.member;

      if (!member || !member.voice.channel) {
        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องเสียงก่อน",
          ephemeral: true
        });
      }

      const channel = member.voice.channel;
      const data = tempChannels.get(channel.id);

      if (!data) {
        return interaction.reply({
          content: "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",
          ephemeral: true
        });
      }

      if (data.owner !== interaction.user.id) {
        return interaction.reply({
          content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
          ephemeral: true
        });
      }

      const targetId = interaction.values[0];

      // =================================================
      // ALLOW
      // =================================================

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

      // =================================================
      // DENY
      // =================================================

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
            `❌ ไม่อนุญาต <@${targetId}> เข้าห้องแล้ว`,
          components: []
        });
      }

      // =================================================
      // TRANSFER
      // =================================================

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

        await channel.permissionOverwrites.edit(
          targetId,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        await channel.setName(
          `ห้องของ ${targetMember.user.username}`
        );

        return interaction.update({
          content:
            `🔄 โอนเจ้าของห้องให้ <@${targetId}> แล้ว`,
          components: []
        });
      }
    }

    // =================================================
    // MODAL
    // =================================================

    if (interaction.isModalSubmit()) {

      const member = interaction.member;

      if (!member || !member.voice.channel) {
        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องเสียงก่อน",
          ephemeral: true
        });
      }

      const channel = member.voice.channel;
      const data = tempChannels.get(channel.id);

      if (!data) {
        return interaction.reply({
          content: "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",
          ephemeral: true
        });
      }

      if (data.owner !== interaction.user.id) {
        return interaction.reply({
          content: "❌ เฉพาะเจ้าของห้องเท่านั้น",
          ephemeral: true
        });
      }

      // =================================================
      // RENAME
      // =================================================

      if (interaction.customId === "rename_modal") {

        const newName = interaction.fields
          .getTextInputValue("new_name")
          .trim();

        if (!newName) {
          return interaction.reply({
            content: "❌ กรุณาใส่ชื่อห้อง",
            ephemeral: true
          });
        }

        await channel.setName(newName);

        return interaction.reply({
          content:
            `✏️ เปลี่ยนชื่อห้องเป็น **${newName}** แล้ว`,
          ephemeral: true
        });
      }

      // =================================================
      // LIMIT
      // =================================================

      if (interaction.customId === "limit_modal") {

        const value = interaction.fields
          .getTextInputValue("user_limit")
          .trim();

        const limit = Number(value);

        if (
          Number.isNaN(limit) ||
          limit < 0 ||
          limit > 99
        ) {
          return interaction.reply({
            content: "❌ กรุณาใส่ตัวเลข 0-99",
            ephemeral: true
          });
        }

        await channel.setUserLimit(limit);

        return interaction.reply({
          content:
            limit === 0
              ? "👥 ยกเลิกการจำกัดจำนวนคนแล้ว"
              : `👥 จำกัดห้องไว้ที่ **${limit} คน** แล้ว`,
          ephemeral: true
        });
      }
    }

  } catch (error) {

    console.error("Interaction error:", error);

    try {

      if (interaction.replied || interaction.deferred) {

        await interaction.editReply({
          content: "❌ เกิดข้อผิดพลาดในการทำรายการ"
        });

      } else {

        await interaction.reply({
          content: "❌ เกิดข้อผิดพลาดในการทำรายการ",
          ephemeral: true
        });

      }

    } catch {}
  }
});

// =====================================================
// LOGIN
// =====================================================

client.login(token);
