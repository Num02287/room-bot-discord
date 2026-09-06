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

// ===== Web Server สำหรับรันบน Cloud (เช่น Render) =====
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(
  process.env.PORT || 3000,
  () => console.log("Web Server is ready.")
);

// ===== ดึงข้อมูลจาก Environment Variables =====
const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== เก็บข้อมูลห้องชั่วคราว =====
const tempChannels = new Map();

// ===== Slash Commands =====
const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("ระบบสร้างห้อง")
    .setDMPermission(false)
].map(c => c.toJSON());

const rest = new REST({
  version: "10"
}).setToken(token);

// ===== BOT READY =====
client.once("ready", async () => {

  console.log(`✅ Login as: ${client.user.tag}`);

  try {

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log(
      "🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!"
    );

  } catch (err) {

    console.error(err);

  }

});

// ======================================================
// ===== ระบบสร้างห้องและลบห้องอัตโนมัติ =====
// ======================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // ==================================================
    // 1. ขาเข้า: สมาชิกเข้าช่องสร้างห้อง
    // ==================================================

    if (
      newState.channelId === createChannelId &&
      oldState.channelId !== createChannelId
    ) {

      const guildId = newState.guild.id;
      const ownerId = newState.member.id;

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

        // เจ้าของ
        {
          id: ownerId,

          allow: [
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
        }

      ];

      // ยศพิเศษ
      if (allowRoleId) {

        permissionOverwrites.push({

          id: allowRoleId,

          allow: [
            "ViewChannel",
            "Connect"
          ]

        });

      }

      // สร้างห้อง
      const channel =
        await newState.guild.channels.create({

          name:
            `ห้องส่วนตัวของ ${newState.member.user.username}`,

          type:
            ChannelType.GuildVoice,

          parent:
            categoryId,

          permissionOverwrites:
            permissionOverwrites

        });

      // ย้ายเจ้าของเข้าไป
      await newState
        .setChannel(channel)
        .catch(() => {});

      // ==================================================
      // ⭐ เพิ่มระบบจำสถานะ Lock / Unlock
      // ==================================================

      tempChannels.set(channel.id, {

        owner: ownerId,

        // 🔓 เริ่มต้นเป็น Unlock
        locked: false

      });

      return;

    }

    // ==================================================
    // 2. ขาออก
    // ==================================================

    if (
      oldState.channelId &&
      tempChannels.has(oldState.channelId)
    ) {

      const channel =
        await oldState.guild.channels
          .fetch(oldState.channelId)
          .catch(() => null);

      // ถ้าไม่มีห้อง
      if (!channel) {

        tempChannels.delete(
          oldState.channelId
        );

        return;

      }

      // ถ้าไม่มีคนในห้องแล้ว
      if (channel.members.size === 0) {

        await channel
          .delete()
          .catch(() => {});

        tempChannels.delete(
          oldState.channelId
        );

        return;

      }

    }

  } catch (error) {

    console.error(
      "Error in voiceStateUpdate:",
      error
    );

  }

});

// ======================================================
// ===== ระบบจัดการ Interaction =====
// ======================================================

client.on("interactionCreate", async (interaction) => {

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
      // ROW 1
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
      // ROW 2
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
              .setEmoji("👁")
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

      // ส่ง Embed และปุ่มเข้าแชท
      await interaction.channel.send({

        embeds: [
          embed
        ],

        components: [
          row1,
          row2
        ]

      });

      // ตอบแบบเงียบ
      await interaction.reply({

        content:
          "กำลังสร้างแผงควบคุม...",

        ephemeral: true

      });

      return interaction.deleteReply();

    }

    // ==================================================
    // 2. BUTTONS
    // ==================================================

    if (interaction.isButton()) {

      const member =
        interaction.member;

      const channel =
        member.voice.channel;

      if (!channel) {

        return interaction.reply({

          content:
            "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

          ephemeral: true

        });

      }

      const data =
        tempChannels.get(channel.id);

      // ==================================================
      // ตรวจสอบห้อง
      // ==================================================

      if (!data) {

        return interaction.reply({

          content:
            "❌ ห้องนี้ไม่ได้อยู่ในระบบห้องชั่วคราว",

          ephemeral: true

        });

      }

      // ==================================================
      // 👑 OWNER
      // ==================================================

      if (
        interaction.customId === "owner"
      ) {

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

      // ==================================================
      // ตรวจสอบเจ้าของ
      // ==================================================

      if (
        data.owner !== member.id
      ) {

        return interaction.reply({

          content:
            "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ ไม่สามารถสั่งการได้",

          ephemeral: true

        });

      }

      // ==================================================
      // ✏️ RENAME
      // ==================================================

      if (
        interaction.customId === "name"
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

      // ==================================================
      // 🎯 LIMIT
      // ==================================================

      if (
        interaction.customId === "limit"
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

      // ==================================================
      // 👥 SELECT MENU
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
              .addComponents(
                menu
              )

          ],

          ephemeral: true

        });

      }

      // ==================================================
      // กลุ่มคำสั่ง Permission
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

        // ⭐ จำสถานะ Lock
        data.locked = true;

        // @everyone เข้าไม่ได้
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              Connect: false
            }
          )
          .catch(() => {});

        // ยศพิเศษเข้าไม่ได้
        if (allowRoleId) {

          await channel.permissionOverwrites
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

      // ==================================================
      // 🔓 UNLOCK
      // ==================================================

      if (
        interaction.customId === "unlock"
      ) {

        // ⭐ จำสถานะ Unlock
        data.locked = false;

        // @everyone เข้าได้
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              Connect: true
            }
          )
          .catch(() => {});

        // ยศพิเศษเข้าได้
        if (allowRoleId) {

          await channel.permissionOverwrites
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

      // ==================================================
      // 🙈 HIDE
      // ==================================================

      if (
        interaction.customId === "hide"
      ) {

        /*
         * สำคัญ:
         *
         * Hide จะซ่อน ViewChannel
         *
         * แต่จะเอาค่า data.locked
         * มาใช้กับ Connect
         *
         * ดังนั้น:
         *
         * 🔒 Lock + Hide
         * = ซ่อน + ล็อก
         *
         * 🔓 Unlock + Hide
         * = ซ่อน + ปลดล็อก
         */

        const permissions = [

          // @everyone
          {
            id: interaction.guild.id,

            deny: [
              "ViewChannel"
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

        // ==================================================
        // 👑 ยศใหญ่
        // ==================================================

        const bigRoleIds = [

          "1500549655107469535",
          "1502362111345426432",
          "1492931714887192739",
          "1492931717437063342",
          "1492931719832014978",
          "1493194473994326019",
          "1497961308530802691",
          "1494244850919280724",
          "1492934494616027197",
          "1493279265582616721",
          "1492935140400435265",
          "1492934562211168349",
          "1493253810993238169",
          "1492934660605346050",
          "1492934842483085536",
          "1493204336874881147",
          "1492934922896146537",
          "1492934607534952559",
          "1500491781983178825",
          "1500521553446834290",
          "1492931721384038480",
          "1501857544400932904",
          "1493650662624592032",
          "1492931723330064425",
          "1492931725129683124"

        ];

        // ยศใหญ่สามารถมองเห็น
        bigRoleIds.forEach(roleId => {

          permissions.push({

            id: roleId,

            allow: [
              "ViewChannel"
            ]

          });

        });

        // ==================================================
        // ⭐ คงค่า Lock / Unlock เดิม
        // ==================================================

        for (
          const permission of permissions
        ) {

          if (
            permission.id ===
            interaction.guild.id
          ) {

            permission.deny = [
              "ViewChannel"
            ];

            if (data.locked) {

              permission.deny.push(
                "Connect"
              );

            }

          }

          // ยศใหญ่
          if (
            bigRoleIds.includes(
              permission.id
            )
          ) {

            if (data.locked) {

              permission.deny = [
                "Connect"
              ];

            }

          }

        }

        // ยศพิเศษ
        if (allowRoleId) {

          permissions.push({

            id: allowRoleId,

            allow: [
              "ViewChannel"
            ],

            ...(data.locked
              ? {
                  deny: [
                    "Connect"
                  ]
                }
              : {})

          });

        }

        await channel.permissionOverwrites
          .set(
            permissions
          )
          .catch(console.error);

        return interaction.editReply({

          content:
            data.locked
              ? "🙈 ซ่อนเรียบร้อยแล้ว 🔒 ห้องยังล็อกอยู่"
              : "🙈 ซ่อนเรียบร้อยแล้ว 🔓 ห้องยังปลดล็อกอยู่"

        });

      }

      // ==================================================
      // 👁️ SHOW
      // ==================================================

      if (
        interaction.customId === "show"
      ) {

        /*
         * ⭐ จุดสำคัญของระบบ
         *
         * Show จะอ่านค่าจาก:
         *
         * data.locked
         *
         * ถ้า:
         *
         * data.locked = true
         *
         * จะใช้:
         *
         * Connect: false
         *
         * ถ้า:
         *
         * data.locked = false
         *
         * จะใช้:
         *
         * Connect: true
         */

        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,

              Connect:
                data.locked
                  ? false
                  : true
            }
          )
          .catch(() => {});

        // ==================================================
        // 👑 ยศพิเศษ
        // ==================================================

        if (allowRoleId) {

          await channel.permissionOverwrites
            .edit(
              allowRoleId,
              {
                ViewChannel: true,

                Connect:
                  data.locked
                    ? false
                    : true
              }
            )
            .catch(() => {});

        }

        // ==================================================
        // 👑 เจ้าของห้อง
        // ==================================================

        await channel.permissionOverwrites
          .edit(
            data.owner,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(() => {});

        // ==================================================
        // 🤖 Bot
        // ==================================================

        await channel.permissionOverwrites
          .edit(
            client.user.id,
            {
              ViewChannel: true,
              Connect: true,
              ManageChannels: true,
              MoveMembers: true
            }
          )
          .catch(() => {});

        return interaction.editReply({

          content:
            data.locked
              ? "👁️ แสดงห้องเรียบร้อยแล้ว 🔒 ห้องยังล็อกอยู่"
              : "👁️ แสดงห้องเรียบร้อยแล้ว 🔓 ห้องปลดล็อกอยู่"

        });

      }

    }

    // ==================================================
    // 3. USER SELECT MENU
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

      // ==================================================
      // ALLOW
      // ==================================================

      if (
        interaction.customId ===
        "select_allow"
      ) {

        await channel.permissionOverwrites
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
      // DENY
      // ==================================================

      if (
        interaction.customId ===
        "select_deny"
      ) {

        await channel.permissionOverwrites
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

      // ==================================================
      // TRANSFER OWNER
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

        if (targetUser) {

          await channel
            .setName(
              `📍・ห้องส่วนตัวของ ${targetUser.username}`
            )
            .catch(() => {});

        }

        await channel.permissionOverwrites
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
    // 4. MODAL SUBMIT
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

      // ==================================================
      // RENAME
      // ==================================================

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
          .setName(
            `${name}`
          )
          .catch(() => {});

        return interaction.reply({

          content:
            `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`,

          ephemeral: true

        });

      }

      // ==================================================
      // LIMIT
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
            limitInput
          );

        if (
          isNaN(limit) ||
          limit < 0 ||
          limit > 99
        ) {

          return interaction.reply({

            content:
              "❌ โปรดใส่หมายเลขที่ถูกต้องระหว่าง (0 - 99)",

            ephemeral: true

          });

        }

        const finalLimit =
          limit === 0
            ? 0
            : limit;

        await channel
          .setUserLimit(
            finalLimit
          )
          .catch(() => {});

        return interaction.reply({

          content:

            `🎯 ตั้งจำกัดจำนวนคนรวมเจ้าของไว้ที่ **${
              limit === 0
                ? "ไม่จำกัด"
                : limit + " คน"
            }** เรียบร้อยแล้ว`,

          ephemeral: true

        });

      }

    }

  } catch (err) {

    console.error(
      "Interaction Error:",
      err
    );

    if (
      !interaction.replied &&
      !interaction.deferred
    ) {

      interaction
        .reply({

          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง",

          ephemeral: true

        })
        .catch(() => {});

    } else if (
      interaction.deferred
    ) {

      interaction
        .editReply({

          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง"

        })
        .catch(() => {});

    }

  }

});

// ======================================================
// 🚀 LOGIN
// ======================================================

client.login(token);
