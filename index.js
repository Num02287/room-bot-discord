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
// 🌐 Web Server สำหรับ Render
// ======================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot: client ? client.isReady() : false,
    uptime: process.uptime()
  });
});

app.listen(
  process.env.PORT || 3000,
  "0.0.0.0",
  () => {
    console.log("🌐 Web Server is ready.");
  }
);

// ======================================================
// 🔐 Environment Variables
// ======================================================

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;

// ======================================================
// 🧑‍🤝‍🧑 ยศที่อนุญาต
//
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
// 👑 ยศใหญ่
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
// 🤖 Discord Client
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// ======================================================
// 🏠 เก็บข้อมูลห้องชั่วคราว
// ======================================================

const tempChannels = new Map();

// ======================================================
// 📋 Slash Command
// ======================================================

const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("ระบบสร้างห้อง")
    .setDMPermission(false)
].map(command => command.toJSON());

const rest = new REST({
  version: "10"
}).setToken(token);

// ======================================================
// ✅ Bot Ready
// ======================================================

client.once("ready", async () => {
  console.log(`✅ Login as: ${client.user.tag}`);

  console.log(
    `🧑‍🤝‍🧑 Allow Roles: ${
      allowRoleIds.length
        ? allowRoleIds.join(", ")
        : "ไม่มี"
    }`
  );

  console.log(
    `👑 Big Roles: ${
      bigRoleIds.length
        ? bigRoleIds.join(", ")
        : "ไม่มี"
    }`
  );

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("🚀 Slash Command พร้อมใช้งาน");
  } catch (error) {
    console.error(
      "❌ Slash Command Error:",
      error
    );
  }
});

// ======================================================
// 🎤 สร้างห้องเสียงอัตโนมัติ
// ======================================================

client.on(
  "voiceStateUpdate",
  async (oldState, newState) => {
    try {

      // ==================================================
      // สมาชิกเข้าห้องสร้างห้อง
      // ==================================================

      if (newState.channelId === createChannelId) {

        const guildId =
          newState.guild.id;

        const ownerId =
          newState.member.id;

        const permissionOverwrites = [

          // @everyone
          {
            id: guildId,
            allow: ["ViewChannel"],
            deny: ["Connect"]
          },

          // 👤 เจ้าของ
          {
            id: ownerId,
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

        // ==================================================
        // 👑 Big Roles
        // ==================================================

        for (const roleId of bigRoleIds) {

          permissionOverwrites.push({
            id: roleId,
            allow: [
              "ViewChannel",
              "Connect"
            ]
          });

        }

        // ==================================================
        // 🧑‍🤝‍🧑 Allow Roles
        // ==================================================

        for (const roleId of allowRoleIds) {

          permissionOverwrites.push({
            id: roleId,
            allow: [
              "ViewChannel",
              "Connect"
            ]
          });

        }

        // ==================================================
        // 🏠 สร้างห้อง
        // ==================================================

        const channel =
          await newState.guild.channels.create({

            name:
              `ห้องส่วนตัวของ ${newState.member.user.username}`,

            type:
              ChannelType.GuildVoice,

            parent:
              categoryId,

            permissionOverwrites

          });

        // ==================================================
        // 🚶 ย้ายเจ้าของเข้าห้อง
        // ==================================================

        await newState
          .setChannel(channel)
          .catch(() => {});

        // ==================================================
        // 💾 บันทึกข้อมูลห้อง
        // ==================================================

        tempChannels.set(
          channel.id,
          {
            owner: ownerId
          }
        );

        console.log(
          `🏠 สร้างห้อง: ${channel.name}`
        );

        return;
      }

      // ==================================================
      // 🗑️ ลบห้องเมื่อไม่มีคน
      // ==================================================

      if (
        oldState.channelId &&
        tempChannels.has(oldState.channelId)
      ) {

        const channel =
          await oldState.guild.channels
            .fetch(oldState.channelId)
            .catch(() => null);

        if (
          !channel ||
          channel.members.size === 0
        ) {

          if (channel) {
            await channel
              .delete()
              .catch(() => {});
          }

          tempChannels.delete(
            oldState.channelId
          );
        }
      }

    } catch (error) {

      console.error(
        "❌ voiceStateUpdate Error:",
        error
      );

    }
  }
);

// ======================================================
// 🎛️ Interaction
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      // ==================================================
      // 1. /room
      // ==================================================

      if (
        interaction.isChatInputCommand() &&
        interaction.commandName === "room"
      ) {

        const embed =
          new EmbedBuilder()

            .setTitle(
              "🏠 ระบบสร้างห้องส่วนตัวประจำโซน"
            )

            .setDescription(
              "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
              "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n" +
              "🔹 **หมายเหตุ :** สมาชิกที่มียศพิเศษจะสามารถเข้าห้องนี้ได้ทันที"
            )

            .setImage(
              "https://i.ibb.co/Kjbw5BGb/image.png"
            )

            .setFooter({
              text:
                "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
            })

            .setColor(0x2b2d31);

        // ==================================================
        // ปุ่มแถว 1
        // ==================================================

        const row1 =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId("name")
                .setEmoji("✏️")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("lock")
                .setEmoji("🔒")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("unlock")
                .setEmoji("🔓")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("limit")
                .setEmoji("🎯")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("owner")
                .setEmoji("👑")
                .setStyle(
                  ButtonStyle.Secondary
                )

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
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("show")
                .setEmoji("👁️")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("transfer")
                .setEmoji("🔁")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("allow")
                .setEmoji("🧑‍🤝‍🧑")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("deny")
                .setEmoji("🚫")
                .setStyle(
                  ButtonStyle.Secondary
                )

            );

        // ==================================================
        // ส่ง Panel
        // ==================================================

        await interaction.channel.send({
          embeds: [embed],
          components: [
            row1,
            row2
          ]
        });

        await interaction.reply({
          content:
            "กำลังสร้างแผงควบคุม...",
          ephemeral: true
        });

        await interaction.deleteReply();

        return;
      }

      // ==================================================
      // 2. Buttons
      // ==================================================

      if (interaction.isButton()) {

        const member =
          interaction.member;

        const channel =
          member.voice.channel;

        // ==================================================
        // ต้องอยู่ในห้องเสียง
        // ==================================================

        if (!channel) {

          return interaction.reply({
            content:
              "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",
            ephemeral: true
          });

        }

        // ==================================================
        // ข้อมูลห้อง
        // ==================================================

        const data =
          tempChannels.get(channel.id);

        // ==================================================
        // 👑 OWNER
        // ==================================================

        if (
          interaction.customId === "owner"
        ) {

          if (!data) {

            return interaction.reply({
              content:
                "❌ ห้องนี้ไม่ได้อยู่ในระบบห้องชั่วคราว",
              ephemeral: true
            });

          }

          const ownerMember =
            interaction.guild.members.cache.get(
              data.owner
            );

          return interaction.reply({

            embeds: [

              new EmbedBuilder()

                .setTitle(
                  "👑 เจ้าของห้อง"
                )

                .setDescription(
                  `เจ้าของห้องปัจจุบันคือ: <@${data.owner}>`
                )

                .setColor(0xFFD700)

                .setThumbnail(
                  ownerMember
                    ? ownerMember.user.displayAvatarURL()
                    : null
                )

            ],

            ephemeral: true

          });

        }

        // ==================================================
        // 🛡️ ตรวจสอบเจ้าของ
        // ==================================================

        if (
          !data ||
          data.owner !== member.id
        ) {

          return interaction.reply({
            content:
              "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ ไม่สามารถสั่งการได้",
            ephemeral: true
          });

        }

        // ==================================================
        // ✏️ เปลี่ยนชื่อ
        // ==================================================

        if (
          interaction.customId === "name"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId("rename_room")
              .setTitle("เปลี่ยนชื่อห้อง");

          const input =
            new TextInputBuilder()
              .setCustomId("room_name")
              .setLabel("ชื่อห้องใหม่")
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setMaxLength(100);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(input)
          );

          return interaction.showModal(
            modal
          );

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
              .setTitle("ตั้งจำนวนคน");

          const input =
            new TextInputBuilder()
              .setCustomId("limit_input")
              .setLabel(
                "ใส่จำนวนคน (0 = ไม่จำกัด)"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(input)
          );

          return interaction.showModal(
            modal
          );

        }

        // ==================================================
        // 👥 ALLOW / DENY / TRANSFER
        // ==================================================

        if (
          [
            "allow",
            "deny",
            "transfer"
          ].includes(
            interaction.customId
          )
        ) {

          const menu =
            new UserSelectMenuBuilder()
              .setCustomId(
                `select_${interaction.customId}`
              )
              .setPlaceholder(
                "เลือกสมาชิกที่ต้องการ..."
              );

          return interaction.reply({

            content:
              "🎯 โปรดเลือกสมาชิกจากเมนูด้านล่างนี้ครับ",

            components: [
              new ActionRowBuilder()
                .addComponents(menu)
            ],

            ephemeral: true

          });

        }

        // ==================================================
        // Permission Commands
        // ==================================================

        await interaction.deferReply({
          ephemeral: true
        });

        // ==================================================
        // 🔒 LOCK
        // ==================================================

        if (
          interaction.customId === "lock"
        ) {

          const tasks = [];

          // @everyone
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

          // Allow Roles
          for (
            const roleId of allowRoleIds
          ) {

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

          // Big Roles
          for (
            const roleId of bigRoleIds
          ) {

            tasks.push(
              channel.permissionOverwrites
                .edit(
                  roleId,
                  {
                    ViewChannel: true,
                    Connect: true
                  }
                )
                .catch(() => {})
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

          const tasks = [];

          // @everyone
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

          // Allow Roles
          for (
            const roleId of allowRoleIds
          ) {

            tasks.push(
              channel.permissionOverwrites
                .edit(
                  roleId,
                  {
                    ViewChannel: true,
                    Connect: true
                  }
                )
                .catch(() => {})
            );

          }

          // Big Roles
          for (
            const roleId of bigRoleIds
          ) {

            tasks.push(
              channel.permissionOverwrites
                .edit(
                  roleId,
                  {
                    ViewChannel: true,
                    Connect: true
                  }
                )
                .catch(() => {})
            );

          }

          await Promise.allSettled(tasks);

          return interaction.editReply({
            content:
              "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"
          });

        }

        // ==================================================
        // 🙈 HIDE ROOM
        // ==================================================

        if (
          interaction.customId === "hide"
        ) {

          if (
            !data.savedPermissions
          ) {

            data.savedPermissions =
              channel.permissionOverwrites.cache.map(
                overwrite => ({
                  id:
                    overwrite.id,

                  type:
                    overwrite.type,

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
              id:
                interaction.guild.id,

              deny: [
                "ViewChannel",
                "Connect"
              ]
            },

            // 🤖 Bot
            {
              id:
                client.user.id,

              allow: [
                "ViewChannel",
                "Connect",
                "ManageChannels",
                "MoveMembers"
              ]
            },

            // 👤 Owner
            {
              id:
                data.owner,

              allow: [
                "ViewChannel",
                "Connect"
              ]
            }

          ];

          // ==================================================
          // 👑 Big Roles
          // ==================================================

          for (
            const roleId of bigRoleIds
          ) {

            permissions.push({
              id:
                roleId,

              allow: [
                "ViewChannel",
                "Connect"
              ]
            });

          }

          try {

            await channel
              .permissionOverwrites
              .set(permissions);

            return interaction.editReply({
              content:
                "🙈 ซ่อนห้องเรียบร้อยแล้ว"
            });

          } catch (error) {

            console.error(
              "❌ Hide Room Error:",
              error
            );

            return interaction.editReply({
              content:
                "❌ ไม่สามารถซ่อนห้องได้"
            });

          }

        }

        // ==================================================
        // 👁️ SHOW ROOM
        // ==================================================

        if (
          interaction.customId === "show"
        ) {

          try {

            if (
              data.savedPermissions
            ) {

              await channel
                .permissionOverwrites
                .set(
                  data.savedPermissions.map(
                    p => ({
                      id:
                        p.id,

                      type:
                        p.type,

                      allow:
                        BigInt(p.allow),

                      deny:
                        BigInt(p.deny)
                    })
                  )
                );

              delete data.savedPermissions;

            } else {

              await channel
                .permissionOverwrites
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

          } catch (error) {

            console.error(
              "❌ Show Room Error:",
              error
            );

            return interaction.editReply({
              content:
                "❌ ไม่สามารถแสดงห้องได้"
            });

          }

        }

      }

      // ==================================================
      // 3. User Select Menu
      // ==================================================

      if (
        interaction.isUserSelectMenu()
      ) {

        const channel =
          interaction.member.voice.channel;

        const data =
          tempChannels.get(
            channel?.id
          );

        // ==================================================
        // ตรวจสอบเจ้าของ
        // ==================================================

        if (
          !channel ||
          !data ||
          data.owner !== interaction.member.id
        ) {

          return interaction.reply({

            content:
              "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของเท่านั้น",

            ephemeral: true

          });

        }

        const targetId =
          interaction.values[0];

        // ==================================================
        // 🧑‍🤝‍🧑 ALLOW
        // ==================================================

        if (
          interaction.customId ===
          "select_allow"
        ) {

          await channel
            .permissionOverwrites
            .edit(
              targetId,
              {
                Connect: true,
                ViewChannel: true
              }
            )
            .catch(() => {});

          return interaction.reply({

            content:
              `✅ อนุญาตให้ <@${targetId}> มองเห็นและเข้าห้องได้แล้วครับ`,

            ephemeral: true

          });

        }

        // ==================================================
        // 🚫 DENY
        // ==================================================

        if (
          interaction.customId ===
          "select_deny"
        ) {

          const targetMember =
            await interaction.guild.members
              .fetch(targetId)
              .catch(() => null);

          // 👑 Big Role ห้าม DENY
          if (
            targetMember &&
            targetMember.roles.cache.some(
              role =>
                bigRoleIds.includes(role.id)
            )
          ) {

            return interaction.reply({

              content:
                "👑 สมาชิกที่มียศใหญ่ไม่สามารถถูกบล็อกได้",

              ephemeral: true

            });

          }

          await channel
            .permissionOverwrites
            .edit(
              targetId,
              {
                Connect: false
              }
            )
            .catch(() => {});

          if (
            targetMember
          ) {

            const targetVoice =
              channel.members.get(
                targetId
              );

            if (
              targetVoice
            ) {

              await targetVoice.voice
                .disconnect()
                .catch(() => {});

            }

          }

          return interaction.reply({

            content:
              `🚫 บล็อก <@${targetId}> ไม่ให้เข้าห้องเรียบร้อยแล้วครับ`,

            ephemeral: true

          });

        }

        // ==================================================
        // 🔁 TRANSFER OWNER
        // ==================================================

        if (
          interaction.customId ===
          "select_transfer"
        ) {

          data.owner =
            targetId;

          const targetUser =
            await client.users
              .fetch(targetId)
              .catch(() => null);

          if (
            targetUser
          ) {

            await channel
              .setName(
                `📍・ห้องส่วนตัวของ ${targetUser.username}`
              )
              .catch(() => {});

          }

          await channel
            .permissionOverwrites
            .edit(
              targetId,
              {
                Connect: true,
                ViewChannel: true
              }
            )
            .catch(() => {});

          return interaction.reply({

            content:
              `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้วครับ`,

            ephemeral: true

          });

        }

      }

      // ==================================================
      // 4. Modal
      // ==================================================

      if (
        interaction.isModalSubmit()
      ) {

        const channel =
          interaction.member.voice.channel;

        const data =
          tempChannels.get(
            channel?.id
          );

        // ==================================================
        // ตรวจสอบเจ้าของ
        // ==================================================

        if (
          !channel ||
          !data ||
          data.owner !== interaction.member.id
        ) {

          return interaction.reply({

            content:
              "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของเท่านั้น",

            ephemeral: true

          });

        }

        // ==================================================
        // ✏️ RENAME
        // ==================================================

        if (
          interaction.customId ===
          "rename_room"
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

          await channel
            .setName(name)
            .catch(() => {});

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
          interaction.customId ===
          "limit_room"
        ) {

          const limitInput =
            interaction.fields
              .getTextInputValue(
                "limit_input"
              );

          const limit =
            parseInt(
              limitInput,
              10
            );

          if (
            Number.isNaN(limit) ||
            limit < 0 ||
            limit > 99
          ) {

            return interaction.reply({

              content:
                "❌ โปรดใส่หมายเลขที่ถูกต้องระหว่าง 0 - 99",

              ephemeral: true

            });

          }

          await channel
            .setUserLimit(limit)
            .catch(() => {});

          return interaction.reply({

            content:
              `🎯 ตั้งจำนวนคนเป็น **${
                limit === 0
                  ? "ไม่จำกัด"
                  : `${limit} คน`
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

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        await interaction
          .reply({

            content:
              "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง",

            ephemeral: true

          })
          .catch(() => {});

      } else if (
        interaction.deferred
      ) {

        await interaction
          .editReply({

            content:
              "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง"

          })
          .catch(() => {});

      }

    }

  }
);

// ======================================================
// 🚀 Login
// ======================================================

if (!token) {

  console.error(
    "❌ ไม่พบ TOKEN ใน Environment Variables"
  );

} else {

  client
    .login(token)
    .catch(error => {

      console.error(
        "❌ Discord Login Error:",
        error
      );

    });

}
