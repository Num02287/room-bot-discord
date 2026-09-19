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
// 🌐 Web Server สำหรับ Render / Cloud
// ======================================================
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web Server is ready.");
});

// ======================================================
// 🔐 Environment Variables
// ======================================================
const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;

// ======================================================
// 🧑‍🤝‍🧑 ยศที่อนุญาต
// รองรับหลาย Role ID
//
// ตัวอย่างใน Render:
// 123456789,987654321,555555555
// ======================================================
const allowRoleIds = process.env.ALLOW_ROLE_ID
  ? process.env.ALLOW_ROLE_ID
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  : [];

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
// 👑 ยศใหญ่
// ใช้ชุดเดียวกันทั้งระบบ
// ======================================================
const bigRoleIds = [
  "1502362111345426432",
  "1546873993334890577",
  "1500549655107469535",
  "1492931714887192739",
  "1492931717437063342",
  "1492931719832014978",
  "1492931721384038480",
  "1501857544400932904",
  "1492931725129683124",
  "1493650662624592032",
  "1492931723330064425",
  "1493652498635034844",
  "1497961308530802691"
];

// ======================================================
// 📌 Slash Command
// ======================================================
const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("ระบบสร้างห้อง")
    .setDMPermission(false)
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

// ======================================================
// ✅ Bot Ready
// ======================================================
client.once("ready", async () => {

  console.log(`✅ Login as: ${client.user.tag}`);

  console.log(
    `🧑‍🤝‍🧑 Allow Roles: ${
      allowRoleIds.length > 0
        ? allowRoleIds.join(", ")
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

    console.log(
      "🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!"
    );

  } catch (err) {

    console.error(err);

  }

});

// ======================================================
// 🎤 ระบบสร้างห้องเสียงอัตโนมัติ
// ======================================================
client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // ====================================================
    // 1. สมาชิกเข้าห้องสร้างห้อง
    // ====================================================
    if (newState.channelId === createChannelId) {

      const guildId = newState.guild.id;
      const ownerId = newState.member.id;

      // ==================================================
      // 🔐 Permission เริ่มต้น
      // ==================================================
      const permissionOverwrites = [

        // @everyone
        // ❌ เข้าไม่ได้
        {
          id: guildId,

          allow: [
            "ViewChannel"
          ],

          deny: [
            "Connect"
          ]
        },

        // 👤 เจ้าของห้อง
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
      // 👑 เพิ่มสิทธิ์ยศใหญ่
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
      // 🧑‍🤝‍🧑 เพิ่มสิทธิ์ยศที่ตั้งค่าใน Render
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
      tempChannels.set(channel.id, {

        owner:
          ownerId

      });

      return;
    }

    // ====================================================
    // 2. ลบห้องเมื่อไม่มีคน
    // ====================================================
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
// 🎛️ ระบบ Interaction
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
      // ปุ่มชุดที่ 1
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
      // ปุ่มชุดที่ 2
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

      // ==================================================
      // ส่งแผงควบคุม
      // ==================================================
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

    // ==================================================
    // 2. ปุ่ม
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
      // 👑 ตรวจสอบเจ้าของ
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
            .addComponents(input)

        );

        return interaction.showModal(
          modal
        );

      }

      // ==================================================
      // 🎯 จำกัดจำนวนคน
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
            .addComponents(input)

        );

        return interaction.showModal(
          modal
        );

      }

      // ==================================================
      // 👥 Allow / Deny / Transfer
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

        await channel.permissionOverwrites.edit(

          interaction.guild.id,

          {
            ViewChannel: true,
            Connect: false
          }

        ).catch(() => {});

        // ==================================================
        // ล็อกยศที่ตั้งไว้ทั้งหมด
        // ==================================================
        for (
          const roleId of allowRoleIds
        ) {

          await channel.permissionOverwrites.edit(

            roleId,

            {
              ViewChannel: true,
              Connect: false
            }

          ).catch(() => {});

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

        await channel.permissionOverwrites.edit(

          interaction.guild.id,

          {
            ViewChannel: true,
            Connect: false
          }

        ).catch(() => {});

        // ==================================================
        // ปลดล็อกยศที่ตั้งไว้ทั้งหมด
        // ==================================================
        for (
          const roleId of allowRoleIds
        ) {

          await channel.permissionOverwrites.edit(

            roleId,

            {
              ViewChannel: true,
              Connect: true
            }

          ).catch(() => {});

        }

        return interaction.editReply({

          content:
            "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"

        });

      }

      // ==================================================
      // 🙈 HIDE ROOM
      //
      // เหลือเฉพาะ:
      // 👤 เจ้าของห้อง
      // 🤖 Bot
      //
      // ทุกยศอื่น ๆ มองไม่เห็น
      // ==================================================
      if (
        interaction.customId === "hide"
      ) {

        // ==================================================
        // บันทึก Permission เดิม
        // ==================================================
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

        // ==================================================
        // Permission ใหม่
        // ==================================================
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

          // 👤 เจ้าของห้อง
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
        // ❗ ไม่มี bigRoleIds
        // ❗ ไม่มี allowRoleIds
        //
        // ดังนั้นยศทั้งหมดจะถูกซ่อน
        // ==================================================

        try {

          await channel.permissionOverwrites.set(
            permissions
          );

          return interaction.editReply({

            content:
              "🙈 ซ่อนห้องเรียบร้อยแล้ว"

          });

        } catch (error) {

          console.error(
            "Hide Room Error:",
            error
          );

          return interaction.editReply({

            content:
              "❌ ไม่สามารถซ่อนห้องได้ กรุณาตรวจสอบสิทธิ์ Manage Channels ของบอท"

          });

        }

      }

      // ==================================================
      // 👁️ SHOW ROOM
      // ==================================================
      if (
        interaction.customId === "show"
      ) {

        if (
          data.savedPermissions
        ) {

          try {

            await channel.permissionOverwrites.set(

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

          } catch (error) {

            console.error(
              "Show Room Error:",
              error
            );

          }

        } else {

          await channel.permissionOverwrites.edit(

            interaction.guild.id,

            {
              ViewChannel: true
            }

          ).catch(() => {});

        }

        return interaction.editReply({

          content:
            "👁️ แสดงห้องเรียบร้อยแล้ว"

        });

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
        interaction.customId === "select_allow"
      ) {

        await channel.permissionOverwrites.edit(

          targetId,

          {
            Connect: true,
            ViewChannel: true
          }

        ).catch(() => {});

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
        interaction.customId === "select_deny"
      ) {

        await channel.permissionOverwrites.edit(

          targetId,

          {
            Connect: false
          }

        ).catch(() => {});

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
      // 🔁 TRANSFER OWNER
      // ==================================================
      if (
        interaction.customId === "select_transfer"
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

        await channel.permissionOverwrites.edit(

          targetId,

          {
            Connect: true,
            ViewChannel: true
          }

        ).catch(() => {});

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
        interaction.customId === "rename_room"
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

      // ==================================================
      // 🎯 LIMIT
      // ==================================================
      if (
        interaction.customId === "limit_room"
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

      interaction.reply({

        content:
          "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง",

        ephemeral: true

      }).catch(() => {});

    } else if (
      interaction.deferred
    ) {

      interaction.editReply({

        content:
          "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง"

      }).catch(() => {});

    }

  }

});

// ======================================================
// 🚀 Login
// ======================================================
client.login(token);
