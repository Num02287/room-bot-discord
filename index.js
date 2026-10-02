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

// ======================================================
// CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;
const CREATE_CHANNEL_ID = process.env.CREATE_CHANNEL_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;

// ======================================================
// 🌐 WEB SERVER - Render
// ======================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Discord Room Bot is ONLINE!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot: client.isReady(),
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web Server ONLINE : ${PORT}`);
});

// ======================================================
// 🧑‍🤝‍🧑 ALLOW ROLE
// Render:
// ALLOW_ROLE_ID=123456789,987654321
// ======================================================

const allowRoleIds = process.env.ALLOW_ROLE_ID
  ? process.env.ALLOW_ROLE_ID
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  : [];

// ======================================================
// 👑 BIG ROLES
// ======================================================

const bigRoleIds = [
  "1502362111345426432",
  "1546873993334890577",
  "1500549655107469535",
  "1492931714887192739",
  "1492931717437063342",
  "1492931719832014978",
  "1492931721384038480",
  "1555519802486030346",
  "1501857544400932904",
  "1492931725129683124",
  "1493650662624592032",
  "1492931723330064425"
];

// ======================================================
// 🤖 DISCORD CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// ======================================================
// 🏠 TEMP CHANNELS
// ======================================================

const tempChannels = new Map();

// ======================================================
// 🔧 FUNCTIONS
// ======================================================

function hasBigRole(member) {
  if (!member) return false;

  return member.roles.cache.some(role =>
    bigRoleIds.includes(role.id)
  );
}

function isRoomOwner(member, channel) {
  const data = tempChannels.get(channel.id);

  return data && data.owner === member.id;
}

// ======================================================
// 📋 SLASH COMMAND
// ======================================================

const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("เปิดแผงควบคุมห้องส่วนตัว")
    .setDMPermission(false)
].map(command => command.toJSON());

// ======================================================
// REST
// ======================================================

const rest = new REST({
  version: "10"
}).setToken(TOKEN);

// ======================================================
// 🟢 READY
// ======================================================

client.once("ready", async () => {

  console.log("====================================");
  console.log(`🟢 BOT ONLINE : ${client.user.tag}`);
  console.log(`👑 BIG ROLES : ${bigRoleIds.length}`);
  console.log(`🧑‍🤝‍🧑 ALLOW ROLES : ${allowRoleIds.length}`);
  console.log("====================================");

  try {

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("✅ /room พร้อมใช้งาน");

  } catch (error) {

    console.error(
      "❌ Slash Command Error:",
      error
    );

  }
});

// ======================================================
// 🎤 VOICE STATE
// ======================================================

client.on(
  "voiceStateUpdate",
  async (oldState, newState) => {

    try {

      // ==================================================
      // 🏠 สร้างห้องเมื่อเข้า Create Channel
      // ==================================================

      if (
        newState.channelId === CREATE_CHANNEL_ID
      ) {

        const guild = newState.guild;
        const member = newState.member;

        // ----------------------------------------------
        // Permission
        // ----------------------------------------------

        const permissionOverwrites = [

          // @everyone
          {
            id: guild.id,

            allow: [
              "ViewChannel"
            ],

            deny: [
              "Connect"
            ]
          },

          // 👤 เจ้าของ
          {
            id: member.id,

            allow: [
              "ViewChannel",
              "Connect"
            ]
          },

          // 🤖 Bot
          {
            id: client.user.id,

            allow: [
              "ViewChannel",
              "Connect",
              "ManageChannels",
              "MoveMembers"
            ]
          }

        ];

        // ----------------------------------------------
        // 👑 Big Roles
        // ----------------------------------------------

        for (const roleId of bigRoleIds) {

          permissionOverwrites.push({
            id: roleId,

            allow: [
              "ViewChannel",
              "Connect"
            ]
          });

        }

        // ----------------------------------------------
        // 🧑‍🤝‍🧑 Allow Roles
        // ----------------------------------------------

        for (const roleId of allowRoleIds) {

          permissionOverwrites.push({
            id: roleId,

            allow: [
              "ViewChannel",
              "Connect"
            ]
          });

        }

        // ----------------------------------------------
        // 🏠 สร้างห้อง
        // ----------------------------------------------

        const channel =
          await guild.channels.create({

            name:
              `ห้องส่วนตัวของ ${member.user.username}`,

            type:
              ChannelType.GuildVoice,

            parent:
              CATEGORY_ID,

            permissionOverwrites

          });

        // ----------------------------------------------
        // 💾 เก็บข้อมูล
        // ----------------------------------------------

        tempChannels.set(
          channel.id,
          {
            owner: member.id
          }
        );

        // ----------------------------------------------
        // 🚶 ย้ายเจ้าของเข้าห้อง
        // ----------------------------------------------

        await member.voice
          .setChannel(channel)
          .catch(() => {});

        console.log(
          `🏠 Created: ${channel.name}`
        );

        return;
      }

      // ==================================================
      // 🗑️ ลบห้องเมื่อไม่มีสมาชิก
      // ==================================================

      if (
        oldState.channelId &&
        tempChannels.has(oldState.channelId)
      ) {

        const channel =
          oldState.guild.channels.cache.get(
            oldState.channelId
          );

        if (
          channel &&
          channel.members.size === 0
        ) {

          tempChannels.delete(
            oldState.channelId
          );

          await channel
            .delete()
            .catch(() => {});

        }

      }

    } catch (error) {

      console.error(
        "❌ Voice Error:",
        error
      );

    }

  }
);

// ======================================================
// 🎛️ INTERACTION
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      // ==================================================
      // /room
      // ==================================================

      if (
        interaction.isChatInputCommand() &&
        interaction.commandName === "room"
      ) {

        const embed =
          new EmbedBuilder()

            .setTitle(
              "🏠 ระบบจัดการห้องส่วนตัว"
            )

            .setDescription(
              "จัดการห้องเสียงของคุณได้จากปุ่มด้านล่าง\n\n" +
              "✏️ เปลี่ยนชื่อ\n" +
              "🔒 ล็อกห้อง\n" +
              "🔓 ปลดล็อกห้อง\n" +
              "🎯 จำกัดจำนวนคน\n" +
              "👑 ดูเจ้าของห้อง\n" +
              "🙈 ซ่อนห้อง\n" +
              "👁️ แสดงห้อง\n" +
              "🔁 โอนเจ้าของ\n" +
              "🧑‍🤝‍🧑 อนุญาตสมาชิก\n" +
              "🚫 บล็อกสมาชิก"
            )

            .setColor(0x5865F2)

            .setFooter({
              text:
                "Room System"
            });

        // ==================================================
        // ปุ่มแถว 1
        // ==================================================

        const row1 =
          new ActionRowBuilder()
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

        // ==================================================
        // ปุ่มแถว 2
        // ==================================================

        const row2 =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId("hide")
                .setEmoji("🙈")
                .setStyle(ButtonStyle.Secondary),

              new ButtonBuilder()
                .setCustomId("show")
                .setEmoji("👁️")
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

        await interaction.channel.send({
          embeds: [embed],
          components: [
            row1,
            row2
          ]
        });

        return interaction.reply({
          content:
            "✅ เปิดระบบจัดการห้องแล้ว",
          ephemeral: true
        });

      }

      // ==================================================
      // BUTTON
      // ==================================================

      if (interaction.isButton()) {

        const member = interaction.member;
        const channel = member.voice.channel;

        // ----------------------------------------------
        // ตรวจห้องเสียง
        // ----------------------------------------------

        if (!channel) {

          return interaction.reply({
            content:
              "❌ กรุณาเข้าห้องเสียงก่อน",
            ephemeral: true
          });

        }

        // ----------------------------------------------
        // ตรวจห้องระบบ
        // ----------------------------------------------

        const data =
          tempChannels.get(channel.id);

        if (!data) {

          return interaction.reply({
            content:
              "❌ ห้องนี้ไม่ใช่ห้องส่วนตัวของระบบ",
            ephemeral: true
          });

        }

        // ==================================================
        // 👑 OWNER
        // ==================================================

        if (
          interaction.customId === "owner"
        ) {

          return interaction.reply({
            content:
              `👑 เจ้าของห้องคือ <@${data.owner}>`,
            ephemeral: true
          });

        }

        // ==================================================
        // ตรวจเจ้าของ
        // ==================================================

        if (
          !isRoomOwner(member, channel)
        ) {

          return interaction.reply({
            content:
              "❌ เฉพาะเจ้าของห้องเท่านั้นที่ใช้คำสั่งนี้ได้",
            ephemeral: true
          });

        }

        // ==================================================
        // ✏️ NAME
        // ==================================================

        if (
          interaction.customId === "name"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId("rename_room")
              .setTitle("✏️ เปลี่ยนชื่อห้อง");

          const input =
            new TextInputBuilder()
              .setCustomId("room_name")
              .setLabel("ชื่อห้องใหม่")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(100);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(input)
          );

          return interaction.showModal(modal);
        }

        // ==================================================
        // 🎯 LIMIT
        // ==================================================

        if (
          interaction.customId === "limit"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId("limit_room")
              .setTitle("🎯 จำกัดจำนวนคน");

          const input =
            new TextInputBuilder()
              .setCustomId("limit_input")
              .setLabel("จำนวนคน 0 = ไม่จำกัด")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(2);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(input)
          );

          return interaction.showModal(modal);
        }

        // ==================================================
        // 🔒 LOCK
        // ==================================================

        if (
          interaction.customId === "lock"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          const tasks = [];

          // @everyone
          tasks.push(
            channel.permissionOverwrites.edit(
              interaction.guild.id,
              {
                ViewChannel: true,
                Connect: false
              }
            ).catch(() => {})
          );

          // Allow Roles
          for (const roleId of allowRoleIds) {

            tasks.push(
              channel.permissionOverwrites.edit(
                roleId,
                {
                  ViewChannel: true,
                  Connect: false
                }
              ).catch(() => {})
            );

          }

          // Big Roles
          for (const roleId of bigRoleIds) {

            tasks.push(
              channel.permissionOverwrites.edit(
                roleId,
                {
                  ViewChannel: true,
                  Connect: true
                }
              ).catch(() => {})
            );

          }

          await Promise.allSettled(tasks);

          return interaction.editReply({
            content:
              "🔒 ล็อกห้องเรียบร้อยแล้ว"
          });
        }

        // ==================================================
        // 🔓 UNLOCK
        // ==================================================

        if (
          interaction.customId === "unlock"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          const tasks = [];

          // @everyone
          tasks.push(
            channel.permissionOverwrites.edit(
              interaction.guild.id,
              {
                ViewChannel: true,
                Connect: false
              }
            ).catch(() => {})
          );

          // Allow Roles
          for (const roleId of allowRoleIds) {

            tasks.push(
              channel.permissionOverwrites.edit(
                roleId,
                {
                  ViewChannel: true,
                  Connect: true
                }
              ).catch(() => {})
            );

          }

          // Big Roles
          for (const roleId of bigRoleIds) {

            tasks.push(
              channel.permissionOverwrites.edit(
                roleId,
                {
                  ViewChannel: true,
                  Connect: true
                }
              ).catch(() => {})
            );

          }

          await Promise.allSettled(tasks);

          return interaction.editReply({
            content:
              "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"
          });
        }

        // ==================================================
        // 🙈 HIDE
        // ==================================================

        if (
          interaction.customId === "hide"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          // ----------------------------------------------
          // บันทึก Permission เดิม
          // ----------------------------------------------

          if (!data.savedPermissions) {

            data.savedPermissions =
              channel.permissionOverwrites.cache.map(
                overwrite => ({
                  id: overwrite.id,
                  type: overwrite.type,
                  allow:
                    overwrite.allow.bitfield.toString(),
                  deny:
                    overwrite.deny.bitfield.toString()
                })
              );
          }

          const permissions = [

            // @everyone
            {
              id: interaction.guild.id,
              deny: [
                "ViewChannel",
                "Connect"
              ]
            },

            // Bot
            {
              id: client.user.id,
              allow: [
                "ViewChannel",
                "Connect",
                "ManageChannels",
                "MoveMembers"
              ]
            },

            // Owner
            {
              id: data.owner,
              allow: [
                "ViewChannel",
                "Connect"
              ]
            }

          ];

          // Big Roles
          for (const roleId of bigRoleIds) {

            permissions.push({
              id: roleId,
              allow: [
                "ViewChannel",
                "Connect"
              ]
            });

          }

          await channel.permissionOverwrites
            .set(permissions);

          return interaction.editReply({
            content:
              "🙈 ซ่อนห้องเรียบร้อยแล้ว"
          });
        }

        // ==================================================
        // 👁️ SHOW
        // ==================================================

        if (
          interaction.customId === "show"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          if (data.savedPermissions) {

            const permissions =
              data.savedPermissions.map(
                p => ({
                  id: p.id,
                  type: p.type,
                  allow: BigInt(p.allow),
                  deny: BigInt(p.deny)
                })
              );

            await channel.permissionOverwrites
              .set(permissions);

            delete data.savedPermissions;

          } else {

            await channel.permissionOverwrites
              .edit(
                interaction.guild.id,
                {
                  ViewChannel: true
                }
              );

          }

          return interaction.editReply({
            content:
              "👁️ แสดงห้องเรียบร้อยแล้ว"
          });
        }

        // ==================================================
        // 👤 USER SELECT
        // ==================================================

        if (
          [
            "allow",
            "deny",
            "transfer"
          ].includes(interaction.customId)
        ) {

          const menu =
            new UserSelectMenuBuilder()
              .setCustomId(
                `select_${interaction.customId}`
              )
              .setPlaceholder(
                "เลือกสมาชิก..."
              );

          return interaction.reply({

            content:
              "👤 เลือกสมาชิกที่ต้องการ",

            components: [
              new ActionRowBuilder()
                .addComponents(menu)
            ],

            ephemeral: true

          });
        }
      }

      // ==================================================
      // USER SELECT MENU
      // ==================================================

      if (
        interaction.isUserSelectMenu()
      ) {

        const channel =
          interaction.member.voice.channel;

        if (!channel) {

          return interaction.reply({
            content:
              "❌ กรุณาเข้าห้องเสียงก่อน",
            ephemeral: true
          });

        }

        const data =
          tempChannels.get(channel.id);

        if (
          !data ||
          data.owner !== interaction.member.id
        ) {

          return interaction.reply({
            content:
              "❌ คุณไม่ใช่เจ้าของห้อง",
            ephemeral: true
          });

        }

        const targetId =
          interaction.values[0];

        // ==================================================
        // 🧑‍🤝‍🧑 ALLOW
        // ==================================================

        if (
          interaction.customId === "select_allow"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          await channel.permissionOverwrites
            .edit(
              targetId,
              {
                ViewChannel: true,
                Connect: true
              }
            );

          return interaction.editReply({
            content:
              `✅ อนุญาต <@${targetId}> เข้าห้องเรียบร้อยแล้ว`
          });
        }

        // ==================================================
        // 🚫 DENY
        // ==================================================

        if (
          interaction.customId === "select_deny"
        ) {

          const targetMember =
            interaction.guild.members.cache.get(
              targetId
            );

          // Big Role ห้าม DENY
          if (
            targetMember &&
            hasBigRole(targetMember)
          ) {

            return interaction.reply({
              content:
                "👑 สมาชิกที่มียศใหญ่ไม่สามารถถูกบล็อกได้",
              ephemeral: true
            });

          }

          await interaction.deferReply({
            ephemeral: true
          });

          // บล็อก
          await channel.permissionOverwrites
            .edit(
              targetId,
              {
                Connect: false
              }
            );

          // ถ้าอยู่ในห้อง เตะออก
          const targetVoice =
            channel.members.get(targetId);

          if (targetVoice) {

            await targetVoice.voice
              .disconnect()
              .catch(() => {});

          }

          return interaction.editReply({
            content:
              `🚫 บล็อก <@${targetId}> ไม่ให้เข้าห้องเรียบร้อยแล้ว`
          });
        }

        // ==================================================
        // 🔁 TRANSFER
        // ==================================================

        if (
          interaction.customId === "select_transfer"
        ) {

          const targetUser =
            client.users.cache.get(targetId);

          await interaction.deferReply({
            ephemeral: true
          });

          // เปลี่ยนเจ้าของ
          data.owner = targetId;

          // Permission
          await channel.permissionOverwrites
            .edit(
              targetId,
              {
                ViewChannel: true,
                Connect: true
              }
            );

          // เปลี่ยนชื่อ
          if (targetUser) {

            await channel
              .setName(
                `📍・ห้องส่วนตัวของ ${targetUser.username}`
              )
              .catch(() => {});

          }

          return interaction.editReply({
            content:
              `🔁 โอนเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้ว`
          });
        }
      }

      // ==================================================
      // MODAL
      // ==================================================

      if (
        interaction.isModalSubmit()
      ) {

        const channel =
          interaction.member.voice.channel;

        if (!channel) {

          return interaction.reply({
            content:
              "❌ กรุณาเข้าห้องเสียงก่อน",
            ephemeral: true
          });

        }

        const data =
          tempChannels.get(channel.id);

        if (
          !data ||
          data.owner !== interaction.member.id
        ) {

          return interaction.reply({
            content:
              "❌ คุณไม่ใช่เจ้าของห้อง",
            ephemeral: true
          });

        }

        // ==================================================
        // ✏️ RENAME
        // ==================================================

        if (
          interaction.customId === "rename_room"
        ) {

          const name =
            interaction.fields
              .getTextInputValue(
                "room_name"
              )
              .trim();

          if (!name) {

            return interaction.reply({
              content:
                "❌ กรุณาระบุชื่อห้อง",
              ephemeral: true
            });

          }

          await channel.setName(name);

          return interaction.reply({
            content:
              `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`,
            ephemeral: true
          });
        }

        // ==================================================
        // 🎯 LIMIT
        // ==================================================

        if (
          interaction.customId === "limit_room"
        ) {

          const value =
            parseInt(
              interaction.fields
                .getTextInputValue(
                  "limit_input"
                ),
              10
            );

          if (
            Number.isNaN(value) ||
            value < 0 ||
            value > 99
          ) {

            return interaction.reply({
              content:
                "❌ กรุณาใส่ตัวเลข 0 - 99",
              ephemeral: true
            });

          }

          await channel.setUserLimit(value);

          return interaction.reply({
            content:
              `🎯 ตั้งจำนวนคนเป็น **${
                value === 0
                  ? "ไม่จำกัด"
                  : `${value} คน`
              }** เรียบร้อยแล้ว`,
            ephemeral: true
          });
        }
      }

    } catch (error) {

      console.error(
        "❌ Interaction Error:",
        error
      );

      try {

        if (
          interaction.deferred
        ) {

          await interaction.editReply({
            content:
              "❌ เกิดข้อผิดพลาดในการทำงาน"
          });

        } else if (
          !interaction.replied
        ) {

          await interaction.reply({
            content:
              "❌ เกิดข้อผิดพลาดในการทำงาน",
            ephemeral: true
          });

        }

      } catch {}

    }

  }
);

// ======================================================
// 🚀 LOGIN
// ======================================================

if (!TOKEN) {

  console.error(
    "❌ ไม่พบ TOKEN ใน Environment Variables"
  );

} else {

  client.login(TOKEN)
    .then(() => {
      console.log(
        "🚀 กำลังเชื่อมต่อ Discord..."
      );
    })
    .catch(error => {

      console.error(
        "❌ Discord Login Error:",
        error
      );

    });

}
