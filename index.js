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
// WEB SERVER
// =====================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(
  process.env.PORT || 3000,
  () => {
    console.log("🌐 Web Server is ready.");
  }
);

// =====================================================
// ENV
// =====================================================

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

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
// TEMP CHANNELS
//
// locked:
// false = 🔓 ไม่ล็อก
// true  = 🔒 ล็อก
// =====================================================

const tempChannels = new Map();

// =====================================================
// SLASH COMMAND
// =====================================================

const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("ระบบสร้างห้อง")
    .setDMPermission(false)
].map(command => command.toJSON());

const rest = new REST({
  version: "10"
}).setToken(token);

// =====================================================
// READY
// =====================================================

client.once("ready", async () => {

  console.log(
    `✅ Login as: ${client.user.tag}`
  );

  try {

    await rest.put(
      Routes.applicationCommands(
        client.user.id
      ),
      {
        body: commands
      }
    );

    console.log(
      "🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!"
    );

  } catch (error) {

    console.error(
      "Slash Command Error:",
      error
    );

  }

});

// =====================================================
// VOICE STATE UPDATE
// =====================================================

client.on(
  "voiceStateUpdate",
  async (oldState, newState) => {

    try {

      // =================================================
      // สร้างห้องใหม่
      // =================================================

      if (
        newState.channelId ===
        createChannelId
      ) {

        const guildId =
          newState.guild.id;

        const ownerId =
          newState.member.id;

        const permissionOverwrites = [

          // @everyone
          {
            id: guildId,

            allow: [
              "ViewChannel"
            ],

            deny: [
              "Connect"
            ]
          },

          // OWNER
          {
            id: ownerId,

            allow: [
              "ViewChannel",
              "Connect"
            ]
          },

          // BOT
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

        // =================================================
        // ALLOW ROLE
        // =================================================

        if (allowRoleId) {

          permissionOverwrites.push({

            id: allowRoleId,

            allow: [
              "ViewChannel",
              "Connect"
            ]

          });

        }

        // =================================================
        // CREATE CHANNEL
        // =================================================

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

        // =================================================
        // ย้ายเจ้าของเข้าไป
        // =================================================

        await newState
          .setChannel(channel)
          .catch(() => {});

        // =================================================
        // เก็บข้อมูลห้อง
        //
        // ตอนสร้างใหม่ = 🔓 ไม่ล็อก
        // =================================================

        tempChannels.set(
          channel.id,
          {
            owner: ownerId,
            locked: false
          }
        );

        return;
      }

      // =================================================
      // ลบห้องเมื่อไม่มีสมาชิก
      // =================================================

      if (
        oldState.channelId &&
        tempChannels.has(
          oldState.channelId
        )
      ) {

        const channel =
          await oldState.guild.channels
            .fetch(
              oldState.channelId
            )
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
        "voiceStateUpdate Error:",
        error
      );

    }

  }
);

// =====================================================
// INTERACTION CREATE
// =====================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      // =================================================
      // /room
      // =================================================

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
              "🔹 สมาชิกที่มียศพิเศษสามารถเข้าห้องได้ตาม Permission"
            )

            .setImage(
              "https://i.ibb.co/Kjbw5BGb/image.png"
            )

            .setFooter({
              text:
                "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
            })

            .setColor(
              0x2b2d31
            );

        // =================================================
        // ROW 1
        // =================================================

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

        // =================================================
        // ROW 2
        // =================================================

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

        // =================================================
        // ส่งแผงควบคุม
        // =================================================

        await interaction.channel.send({

          embeds: [
            embed
          ],

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

        return interaction.deleteReply();
      }

      // =================================================
      // BUTTON
      // =================================================

      if (
        interaction.isButton()
      ) {

        const member =
          interaction.member;

        const channel =
          member.voice.channel;

        // =================================================
        // ต้องอยู่ในห้องเสียง
        // =================================================

        if (!channel) {

          return interaction.reply({

            content:
              "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

            ephemeral: true

          });

        }

        // =================================================
        // ดึงข้อมูลห้อง
        // =================================================

        const data =
          tempChannels.get(
            channel.id
          );

        // =================================================
        // 👑 OWNER
        // =================================================

        if (
          interaction.customId ===
          "owner"
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

                .setColor(
                  0xFFD700
                )

                .setThumbnail(
                  ownerMember
                    ? ownerMember.user.displayAvatarURL()
                    : null
                )

            ],

            ephemeral: true

          });

        }

        // =================================================
        // CHECK OWNER
        // =================================================

        if (
          !data ||
          data.owner !==
          member.id
        ) {

          return interaction.reply({

            content:
              "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ ไม่สามารถสั่งการได้",

            ephemeral: true

          });

        }

        // =================================================
        // ✏️ เปลี่ยนชื่อห้อง
        // =================================================

        if (
          interaction.customId ===
          "name"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId(
                "rename_room"
              )
              .setTitle(
                "เปลี่ยนชื่อห้อง"
              );

          const input =
            new TextInputBuilder()
              .setCustomId(
                "room_name"
              )
              .setLabel(
                "ชื่อห้องใหม่"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true);

          modal.addComponents(

            new ActionRowBuilder()
              .addComponents(
                input
              )

          );

          return interaction.showModal(
            modal
          );

        }

        // =================================================
        // 🎯 จำกัดจำนวนคน
        // =================================================

        if (
          interaction.customId ===
          "limit"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId(
                "limit_room"
              )
              .setTitle(
                "ตั้งจำนวนคน"
              );

          const input =
            new TextInputBuilder()
              .setCustomId(
                "limit_input"
              )
              .setLabel(
                "ใส่จำนวนคน (0 = ไม่จำกัด)"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true);

          modal.addComponents(

            new ActionRowBuilder()
              .addComponents(
                input
              )

          );

          return interaction.showModal(
            modal
          );

        }

        // =================================================
        // 🧑‍🤝‍🧑 ALLOW
        // 🚫 DENY
        // 🔁 TRANSFER
        // =================================================

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
                .addComponents(
                  menu
                )

            ],

            ephemeral: true

          });

        }

        // =================================================
        // หลังจากนี้เป็นปุ่ม Permission
        // =================================================

        await interaction.deferReply({
          ephemeral: true
        });

        // =================================================
        // 🔒 LOCK
        //
        // บันทึกว่า "ห้องล็อก"
        // =================================================

        if (
          interaction.customId ===
          "lock"
        ) {

          // ---------------------------------------------
          // บันทึกสถานะ
          // ---------------------------------------------

          data.locked = true;

          // ---------------------------------------------
          // ล็อก @everyone
          // ---------------------------------------------

          await channel
            .permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                Connect: false
              }
            )
            .catch(() => {});

          // ---------------------------------------------
          // ล็อก allowRole
          // ---------------------------------------------

          if (allowRoleId) {

            await channel
              .permissionOverwrites
              .edit(
                allowRoleId,
                {
                  Connect: false
                }
              )
              .catch(() => {});

          }

          return interaction.editReply({

            content:
              "🔒 ล็อกห้องเรียบร้อยแล้ว"

          });

        }

        // =================================================
        // 🔓 UNLOCK
        //
        // บันทึกว่า "ห้องไม่ล็อก"
        // =================================================

        if (
          interaction.customId ===
          "unlock"
        ) {

          // ---------------------------------------------
          // บันทึกสถานะ
          // ---------------------------------------------

          data.locked = false;

          // ---------------------------------------------
          // ปลดล็อก @everyone
          // ---------------------------------------------

          await channel
            .permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                Connect: true
              }
            )
            .catch(() => {});

          // ---------------------------------------------
          // ปลดล็อก allowRole
          // ---------------------------------------------

          if (allowRoleId) {

            await channel
              .permissionOverwrites
              .edit(
                allowRoleId,
                {
                  Connect: true
                }
              )
              .catch(() => {});

          }

          return interaction.editReply({

            content:
              "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"

          });

        }

        // =================================================
        // 🙈 HIDE
        //
        // ซ่อนอย่างเดียว
        //
        // ❗ ไม่เปลี่ยน locked
        // ❗ ไม่เปลี่ยน Connect
        // ❗ ไม่ล้าง Allow
        // ❗ ไม่ล้าง Deny
        // =================================================

        if (
          interaction.customId ===
          "hide"
        ) {

          await channel
            .permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                ViewChannel: false
              }
            )
            .catch(() => {});

          return interaction.editReply({

            content:
              "🙈 ซ่อนห้องเรียบร้อยแล้ว"

          });

        }

        // =================================================
        // 👁️ SHOW
        //
        // แสดงห้อง
        //
        // ⭐ ยึดสถานะจาก 🔒 / 🔓
        // =================================================

        if (
          interaction.customId ===
          "show"
        ) {

          // ---------------------------------------------
          // 1. แสดงห้อง
          // ---------------------------------------------

          await channel
            .permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                ViewChannel: true
              }
            )
            .catch(() => {});

          // =================================================
          // 2. ถ้าเป็น 🔒
          // =================================================

          if (
            data.locked === true
          ) {

            // ---------------------------------------------
            // ยังคงล็อก
            // ---------------------------------------------

            await channel
              .permissionOverwrites
              .edit(
                interaction.guild.id,
                {
                  Connect: false
                }
              )
              .catch(() => {});

            if (allowRoleId) {

              await channel
                .permissionOverwrites
                .edit(
                  allowRoleId,
                  {
                    Connect: false
                  }
                )
                .catch(() => {});

            }

            return interaction.editReply({

              content:
                "👁️ แสดงห้องแล้ว"

            });

          }

          // =================================================
          // 3. ถ้าเป็น 🔓
          // =================================================

          if (
            data.locked === false
          ) {

            // ---------------------------------------------
            // ยังคงไม่ล็อก
            // ---------------------------------------------

            await channel
              .permissionOverwrites
              .edit(
                interaction.guild.id,
                {
                  Connect: true
                }
              )
              .catch(() => {});

            if (allowRoleId) {

              await channel
                .permissionOverwrites
                .edit(
                  allowRoleId,
                  {
                    Connect: true
                  }
                )
                .catch(() => {});

            }

            return interaction.editReply({

              content:
                "👁️ แสดงห้องแล้ว"

            });

          }

          // =================================================
          // fallback
          // =================================================

          return interaction.editReply({

            content:
              "👁️ แสดงห้องเรียบร้อยแล้ว"

          });

        }

      }

      // =====================================================
      // USER SELECT MENU
      // =====================================================

      if (
        interaction.isUserSelectMenu()
      ) {

        const channel =
          interaction.member.voice.channel;

        const data =
          tempChannels.get(
            channel?.id
          );

        if (
          !channel ||
          !data ||
          data.owner !==
          interaction.member.id
        ) {

          return interaction.reply({

            content:
              "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของเท่านั้น",

            ephemeral: true

          });

        }

        const targetId =
          interaction.values[0];

        // =================================================
        // 🧑‍🤝‍🧑 ALLOW
        // =================================================

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

        // =================================================
        // 🚫 DENY
        // =================================================

        if (
          interaction.customId ===
          "select_deny"
        ) {

          await channel
            .permissionOverwrites
            .edit(
              targetId,
              {
                Connect: false
              }
            )
            .catch(() => {});

          const targetMember =
            channel.members.get(
              targetId
            );

          if (targetMember) {

            await targetMember.voice
              .disconnect()
              .catch(() => {});

          }

          return interaction.reply({

            content:
              `🚫 บล็อก <@${targetId}> ไม่ให้เข้าห้องเรียบร้อยแล้วครับ`,

            ephemeral: true

          });

        }

        // =================================================
        // 🔁 TRANSFER OWNER
        // =================================================

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

          if (targetUser) {

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

      // =====================================================
      // MODAL SUBMIT
      // =====================================================

      if (
        interaction.isModalSubmit()
      ) {

        const channel =
          interaction.member.voice.channel;

        const data =
          tempChannels.get(
            channel?.id
          );

        if (
          !channel ||
          !data ||
          data.owner !==
          interaction.member.id
        ) {

          return interaction.reply({

            content:
              "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของเท่านั้น",

            ephemeral: true

          });

        }

        // =================================================
        // ✏️ RENAME
        // =================================================

        if (
          interaction.customId ===
          "rename_room"
        ) {

          const name =
            interaction.fields
              .getTextInputValue(
                "room_name"
              );

          await channel
            .setName(name)
            .catch(() => {});

          return interaction.reply({

            content:
              `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`,

            ephemeral: true

          });

        }

        // =================================================
        // 🎯 LIMIT
        // =================================================

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
            parseInt(limitInput);

          if (
            isNaN(limit) ||
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
        "Interaction Error:",
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

// =====================================================
// LOGIN
// =====================================================

client.login(token);
