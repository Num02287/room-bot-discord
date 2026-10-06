const express = require("express");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} = require("discord.js");

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// ==============================
// CONFIG
// ==============================

const TOKEN = process.env.TOKEN;

const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;

const allowRoleIds = process.env.ALLOW_ROLE_ID
  ? process.env.ALLOW_ROLE_ID
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  : [];

// ==============================
// ROLE พิเศษ
// ==============================

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

// ==============================
// CLIENT
// ==============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// ==============================
// TEMP CHANNEL
// ==============================

// channelId => { owner: userId, savedPermissions?: ... }
const tempChannels = new Map();

// ==============================
// จำชื่อห้องของผู้ใช้
// ==============================

// userId => roomName
//
// เก็บไว้ใน RAM
// ถ้า Bot รีสตาร์ต ข้อมูลจะถูกล้าง
const savedRoomNames = new Map();

// ==============================
// READY
// ==============================

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await client.application.commands.set([
      {
        name: "room",
        description: "เปิดระบบจัดการห้องส่วนตัว"
      }
    ]);

    console.log("Slash command /room registered");
  } catch (error) {
    console.error("Command Register Error:", error);
  }
});

// ==============================
// SLASH COMMAND
// ==============================

client.on("interactionCreate", async interaction => {
  try {
    // ==========================================
    // /room
    // ==========================================

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== "room") return;

      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
        .setDescription(
          "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
          "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n" +
          "🔹 **หมายเหตุ :** สมาชิกที่มียศพิเศษจะสามารถเข้าห้องนี้ได้ทันที"
        )
        .setColor(0x2b2d31)
        .setFooter({
          text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        })
        .setImage(
          "[https://i.ibb.co/Kjbw5BGb/image.png](https://i.ibb.co/Kjbw5BGb/image.png)"
        );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("name")
          .setLabel("ตั้งชื่อห้อง")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("lock")
          .setLabel("ล็อกห้อง")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("unlock")
          .setLabel("ปลดล็อก")
          .setEmoji("🔓")
          .setStyle(ButtonStyle.Secondary),

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
          .setEmoji("🔁")
          .setStyle(ButtonStyle.Secondary),

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

    // ==========================================
    // BUTTON
    // ==========================================

    if (interaction.isButton()) {
      const member = interaction.member;

      if (!member.voice.channel) {
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

      // ==========================================
      // OWNER
      // ==========================================

      if (interaction.customId === "owner") {
        return interaction.reply({
          content: `👑 เจ้าของห้องคือ <@${data.owner}>`,
          ephemeral: true
        });
      }

      // ==========================================
      // ตรวจสอบเจ้าของ
      // ==========================================

      if (data.owner !== member.id) {
        return interaction.reply({
          content: "❌ เฉพาะเจ้าของห้องเท่านั้นที่สามารถจัดการห้องได้",
          ephemeral: true
        });
      }

      // ==========================================
      // NAME
      // ==========================================

      if (interaction.customId === "name") {
        const modal = new ModalBuilder()
          .setCustomId("rename_modal")
          .setTitle("ตั้งชื่อห้อง");

        const input = new TextInputBuilder()
          .setCustomId("room_name")
          .setLabel("ชื่อห้อง")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100)
          .setPlaceholder(
            "เว้นว่างแล้วกดส่ง = รีเซ็ตชื่อเริ่มต้น"
          );

        const row = new ActionRowBuilder().addComponents(input);

        modal.addComponents(row);

        return interaction.showModal(modal);
      }

      // ==========================================
      // LIMIT
      // ==========================================

      if (interaction.customId === "limit") {
        const modal = new ModalBuilder()
          .setCustomId("limit_modal")
          .setTitle("จำกัดจำนวนสมาชิก");

        const input = new TextInputBuilder()
          .setCustomId("user_limit")
          .setLabel("จำนวนสมาชิก 0 - 99")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("ใส่ 0 หากต้องการไม่จำกัด");

        const row = new ActionRowBuilder().addComponents(input);

        modal.addComponents(row);

        return interaction.showModal(modal);
      }

      // ==========================================
      // LOCK
      // ==========================================

      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          {
            ViewChannel: true,
            Connect: false
          }
        );

        for (const roleId of allowRoleIds) {
          await channel.permissionOverwrites.edit(roleId, {
            Connect: false
          }).catch(() => {});
        }

        return interaction.reply({
          content: "🔒 ล็อกห้องเรียบร้อยแล้ว",
          ephemeral: true
        });
      }

      // ==========================================
      // UNLOCK
      // ==========================================

      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          {
            ViewChannel: true,
            Connect: false
          }
        );

        for (const roleId of allowRoleIds) {
          await channel.permissionOverwrites.edit(roleId, {
            Connect: true,
            ViewChannel: true
          }).catch(() => {});
        }

        return interaction.reply({
          content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว",
          ephemeral: true
        });
      }

      // ==========================================
      // HIDE
      // ==========================================

      if (interaction.customId === "hide") {
        data.savedPermissions = channel.permissionOverwrites.cache.map(
          overwrite => ({
            id: overwrite.id,
            allow: overwrite.allow.bitfield.toString(),
            deny: overwrite.deny.bitfield.toString(),
            type: overwrite.type
          })
        );

        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          {
            ViewChannel: false,
            Connect: false
          }
        );

        await channel.permissionOverwrites.edit(
          client.user.id,
          {
            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MoveMembers: true
          }
        );

        await channel.permissionOverwrites.edit(
          data.owner,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        return interaction.reply({
          content: "🙈 ซ่อนห้องเรียบร้อยแล้ว",
          ephemeral: true
        });
      }

      // ==========================================
      // SHOW
      // ==========================================

      if (interaction.customId === "show") {
        if (data.savedPermissions) {
          for (const permission of data.savedPermissions) {
            await channel.permissionOverwrites.edit(
              permission.id,
              {
                ViewChannel:
                  (BigInt(permission.allow) &
                    PermissionsBitField.Flags.ViewChannel) !== 0n
                    ? true
                    : (BigInt(permission.deny) &
                        PermissionsBitField.Flags.ViewChannel) !== 0n
                    ? false
                    : null,

                Connect:
                  (BigInt(permission.allow) &
                    PermissionsBitField.Flags.Connect) !== 0n
                    ? true
                    : (BigInt(permission.deny) &
                        PermissionsBitField.Flags.Connect) !== 0n
                    ? false
                    : null
              }
            ).catch(() => {});
          }

          delete data.savedPermissions;
        } else {
          await channel.permissionOverwrites.edit(
            interaction.guild.roles.everyone,
            {
              ViewChannel: true
            }
          );
        }

        return interaction.reply({
          content: "👀 แสดงห้องเรียบร้อยแล้ว",
          ephemeral: true
        });
      }

      // ==========================================
      // ALLOW
      // ==========================================

      if (interaction.customId === "allow") {
        const menu = new UserSelectMenuBuilder()
          .setCustomId("select_allow")
          .setPlaceholder("เลือกสมาชิกที่ต้องการอนุญาต")
          .setMinValues(1)
          .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(menu);

        return interaction.reply({
          content: "👤 เลือกสมาชิกที่ต้องการอนุญาตให้เข้าห้อง",
          components: [row],
          ephemeral: true
        });
      }

      // ==========================================
      // DENY
      // ==========================================

      if (interaction.customId === "deny") {
        const menu = new UserSelectMenuBuilder()
          .setCustomId("select_deny")
          .setPlaceholder("เลือกสมาชิกที่ไม่ต้องการให้เข้าห้อง")
          .setMinValues(1)
          .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(menu);

        return interaction.reply({
          content: "👤 เลือกสมาชิกที่ต้องการไม่อนุญาต",
          components: [row],
          ephemeral: true
        });
      }

      // ==========================================
      // TRANSFER
      // ==========================================

      if (interaction.customId === "transfer") {
        const menu = new UserSelectMenuBuilder()
          .setCustomId("select_transfer")
          .setPlaceholder("เลือกสมาชิกที่จะโอนเจ้าของห้อง")
          .setMinValues(1)
          .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(menu);

        return interaction.reply({
          content: "👑 เลือกสมาชิกที่จะรับสิทธิ์เจ้าของห้อง",
          components: [row],
          ephemeral: true
        });
      }
    }

    // ==========================================
    // USER SELECT MENU
    // ==========================================

    if (interaction.isUserSelectMenu()) {
      const member = interaction.member;

      if (!member.voice.channel) {
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

      if (data.owner !== member.id) {
        return interaction.reply({
          content: "❌ เฉพาะเจ้าของห้องเท่านั้นที่สามารถจัดการห้องได้",
          ephemeral: true
        });
      }

      const targetId = interaction.values[0];

      // ==========================================
      // ALLOW
      // ==========================================

      if (interaction.customId === "select_allow") {
        await channel.permissionOverwrites.edit(targetId, {
          ViewChannel: true,
          Connect: true
        });

        return interaction.update({
          content: `✅ อนุญาต <@${targetId}> ให้เข้าห้องเรียบร้อยแล้ว`,
          components: []
        });
      }

      // ==========================================
      // DENY
      // ==========================================

      if (interaction.customId === "select_deny") {
        await channel.permissionOverwrites.edit(targetId, {
          Connect: false
        });

        const targetMember =
          await interaction.guild.members
            .fetch(targetId)
            .catch(() => null);

        if (
          targetMember &&
          targetMember.voice.channelId === channel.id
        ) {
          await targetMember.voice.disconnect().catch(() => {});
        }

        return interaction.update({
          content: `❌ ไม่อนุญาต <@${targetId}> ให้เข้าห้องเรียบร้อยแล้ว`,
          components: []
        });
      }

      // ==========================================
      // TRANSFER
      // ==========================================

      if (interaction.customId === "select_transfer") {
        const oldOwnerId = data.owner;

        if (targetId === oldOwnerId) {
          return interaction.update({
            content: "❌ คุณเป็นเจ้าของห้องอยู่แล้ว",
            components: []
          });
        }

        const targetMember =
          await interaction.guild.members
            .fetch(targetId)
            .catch(() => null);

        if (!targetMember) {
          return interaction.update({
            content: "❌ ไม่พบสมาชิกที่เลือก",
            components: []
          });
        }

        // เปลี่ยนเจ้าของ
        data.owner = targetId;

        // เปลี่ยนชื่อห้องตามเจ้าของใหม่
        const newRoomName =
          `ห้องส่วนตัวของ ${targetMember.user.username}`;

        await channel.setName(newRoomName).catch(error => {
          console.error(
            "Rename Transfer Error:",
            error
          );
        });

        // จำชื่อห้องของเจ้าของใหม่
        savedRoomNames.set(targetId, newRoomName);

        // ลบชื่อห้องของเจ้าของเก่า
        savedRoomNames.delete(oldOwnerId);

        // ให้สิทธิ์เจ้าของใหม่
        await channel.permissionOverwrites.edit(
          targetId,
          {
            Connect: true,
            ViewChannel: true
          }
        ).catch(() => {});

        // ถ้าเจ้าของใหม่อยู่ในห้องอื่น
        // ให้ย้ายเข้าห้องนี้
        if (
          targetMember.voice.channelId &&
          targetMember.voice.channelId !== channel.id
        ) {
          await targetMember.voice
            .setChannel(channel)
            .catch(() => {});
        }

        return interaction.update({
          content:
            `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้ว`,
          components: []
        });
      }
    }

    // ==========================================
    // MODAL
    // ==========================================

    if (interaction.isModalSubmit()) {
      const member = interaction.member;

      if (!member.voice.channel) {
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

      if (data.owner !== member.id) {
        return interaction.reply({
          content: "❌ เฉพาะเจ้าของห้องเท่านั้นที่สามารถจัดการห้องได้",
          ephemeral: true
        });
      }

      // ==========================================
      // RENAME MODAL
      // ==========================================

      if (interaction.customId === "rename_modal") {
        const roomName =
          interaction.fields.getTextInputValue("room_name").trim();

        // ถ้าเว้นว่าง = รีเซ็ตชื่อ
        if (!roomName) {
          savedRoomNames.delete(member.id);

          const defaultName =
            `ห้องส่วนตัวของ ${interaction.member.user.username}`;

          await channel.setName(defaultName);

          return interaction.reply({
            content: `🔄 รีเซ็ตชื่อห้องเป็น "${defaultName}" เรียบร้อยแล้ว`,
            ephemeral: true
          });
        }

        // บันทึกชื่อใหม่
        savedRoomNames.set(member.id, roomName);

        await channel.setName(roomName);

        return interaction.reply({
          content: `✏️ เปลี่ยนชื่อห้องเป็น "${roomName}" เรียบร้อยแล้ว`,
          ephemeral: true
        });
      }

      // ==========================================
      // LIMIT MODAL
      // ==========================================

      if (interaction.customId === "limit_modal") {
        const value =
          interaction.fields
            .getTextInputValue("user_limit")
            .trim();

        const limit = Number(value);

        if (
          !Number.isInteger(limit) ||
          limit < 0 ||
          limit > 99
        ) {
          return interaction.reply({
            content: "❌ กรุณาใส่ตัวเลขตั้งแต่ 0 ถึง 99",
            ephemeral: true
          });
        }

        await channel.setUserLimit(limit);

        if (limit === 0) {
          return interaction.reply({
            content: "👥 ตั้งห้องเป็นแบบไม่จำกัดจำนวนสมาชิกแล้ว",
            ephemeral: true
          });
        }

        return interaction.reply({
          content: `👥 จำกัดสมาชิกในห้องไว้ที่ ${limit} คน`,
          ephemeral: true
        });
      }
    }
  } catch (error) {
    console.error("Interaction Error:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ เกิดข้อผิดพลาดในการทำงาน",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ==============================
// VOICE STATE UPDATE
// ==============================

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    // ==========================================
    // สร้างห้องเมื่อเข้า CREATE CHANNEL
    // ==========================================

    if (
      newState.channelId === createChannelId &&
      oldState.channelId !== createChannelId
    ) {
      const guild = newState.guild;
      const member = newState.member;

      if (!member) return;

      // ตรวจสอบว่ามีห้องส่วนตัวของคนนี้อยู่แล้วหรือไม่
      const existingRoom = [...tempChannels.entries()]
        .find(([, data]) => data.owner === member.id);

      if (existingRoom) {
        const existingChannel =
          guild.channels.cache.get(existingRoom[0]);

        if (existingChannel) {
          await member.voice.setChannel(existingChannel).catch(() => {});
          return;
        }
      }

      // ==========================================
      // ชื่อห้อง
      // ==========================================

      const savedName = savedRoomNames.get(member.id);

      const roomName =
        savedName ||
        `ห้องส่วนตัวของ ${member.user.username}`;

      // ==========================================
      // Permission
      // ==========================================

      const permissionOverwrites = [
        {
          id: guild.roles.everyone.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel
          ],
          deny: [
            PermissionsBitField.Flags.Connect
          ]
        },

        {
          id: member.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect
          ]
        },

        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.MoveMembers
          ]
        }
      ];

      // ยศพิเศษ
      for (const roleId of bigRoleIds) {
        permissionOverwrites.push({
          id: roleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect
          ]
        });
      }

      // ยศที่กำหนดใน ENV
      for (const roleId of allowRoleIds) {
        permissionOverwrites.push({
          id: roleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect
          ]
        });
      }

      // ==========================================
      // สร้างห้อง
      // ==========================================

      const channel = await guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites
      });

      // ==========================================
      // บันทึกข้อมูล
      // ==========================================

      tempChannels.set(channel.id, {
        owner: member.id
      });

      // ==========================================
      // ย้ายเจ้าของเข้าห้อง
      // ==========================================

      await member.voice.setChannel(channel).catch(() => {});

      console.log(
        `Created private room: ${channel.name} | Owner: ${member.user.tag}`
      );
    }

    // ==========================================
    // ลบห้องเมื่อไม่มีคน
    // ==========================================

    if (
      oldState.channelId &&
      oldState.channelId !== createChannelId
    ) {
      const oldChannel = oldState.channel;

      if (!oldChannel) return;

      const data = tempChannels.get(oldChannel.id);

      if (!data) return;

      if (oldChannel.members.size === 0) {
        await oldChannel.delete().catch(() => {});

        tempChannels.delete(oldChannel.id);

        console.log(
          `Deleted private room: ${oldChannel.name}`
        );

        // สำคัญ:
        // ไม่ลบ savedRoomNames
        // เพื่อให้เจ้าของกลับมาแล้วได้ชื่อเดิม
      }
    }
  } catch (error) {
    console.error("Voice State Error:", error);
  }
});

// ==============================
// LOGIN
// ==============================

client.login(TOKEN);
