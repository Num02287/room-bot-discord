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
// 🌐 Web Server
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
// 🏠 เก็บข้อมูลห้อง
// ======================================================

const tempChannels = new Map();

// ======================================================
// 👑 ยศใหญ่
// ======================================================

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

// ======================================================
// 📌 Slash Command
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
// ✅ READY
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

  } catch (error) {

    console.error(
      "Slash Command Error:",
      error
    );

  }

});

// ======================================================
// 🎤 Voice State
// ======================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // ==================================================
    // 🏠 สร้างห้องใหม่
    // ==================================================

    if (
      newState.channelId === createChannelId
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

        // 👑 เจ้าของห้อง
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
      // 🏠 Create Channel
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
      // 💾 บันทึกข้อมูล
      // ==================================================

      tempChannels.set(
        channel.id,
        {
          owner: ownerId
        }
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
      "VoiceState Error:",
      error
    );

  }

});

// ======================================================
// 🎛️ Interaction Create
// ======================================================

client.on("interactionCreate", async interaction => {

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
      // ปุ่มแถวที่ 1
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
      // ปุ่มแถวที่ 2
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
    // 🔘 BUTTON
    // ==================================================

    if (
      interaction.isButton()
    ) {

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
            "❌ คุณต้องอยู่ในห้องเสียงก่อน",

          ephemeral: true

        });

      }

      // ==================================================
      // ข้อมูลห้อง
      // ==================================================

      const data =
        tempChannels.get(channel.id);

      // ==================================================
      // 👑 ดูเจ้าของ
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
            "❌ คุณไม่ใช่เจ้าของห้องนี้ ไม่สามารถสั่งการได้",

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
            .setTitle("เปลี่ยนชื่อห้อง");

        const input =
          new TextInputBuilder()
            .setCustomId("room_name")
            .setLabel("ชื่อห้องใหม่")
            .setStyle(TextInputStyle.Short)
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
            .setLabel("ใส่จำนวนคน (0 = ไม่จำกัด)")
            .setStyle(TextInputStyle.Short)
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
            "🎯 โปรดเลือกสมาชิกจากเมนูด้านล่าง",

          components: [

            new ActionRowBuilder()
              .addComponents(menu)

          ],

          ephemeral: true

        });

      }

      // ==================================================
      // ⚡ Permission Commands
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
      // 🙈 HIDE
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

          {
            id:
              interaction.guild.id,

            deny: [
              "ViewChannel",
              "Connect"
            ]

          },

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

          {
            id:
              data.owner,

            allow: [
              "ViewChannel",
              "Connect"
            ]

          }

        ];

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
      // 👁️ SHOW
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
    // 👤 USER SELECT
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
            `✅ อนุญาตให้ <@${targetId}> มองเห็นและเข้าห้องได้แล้ว`,

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
            `🚫 บล็อก <@${targetId}> ไม่ให้เข้าห้องเรียบร้อยแล้ว`,

          ephemeral: true

        });

      }

      // ==================================================
      // 🔁 TRANSFER OWNER
      // ==================================================

      if (
        interaction.customId === "select_transfer"
      ) {

        // ==================================================
        // 👤 จำเจ้าของเดิม
        // ==================================================

        const oldOwnerId =
          data.owner;

        // ==================================================
        // 👑 เจ้าของใหม่
        // ==================================================

        const newOwnerId =
          targetId;

        // ==================================================
        // 🧹 ลบ Permission ของเจ้าของเดิม
        // ให้กลับไปเหมือนสมาชิกทั่วไป
        // ==================================================

        await channel.permissionOverwrites
          .delete(oldOwnerId)
          .catch(() => {});

        // ==================================================
        // 👑 เปลี่ยนเจ้าของ
        // ==================================================

        data.owner =
          newOwnerId;

        // ==================================================
        // 👑 ให้สิทธิ์เจ้าของใหม่
        // เหมือนตอนสร้างห้อง
        // ==================================================

        await channel.permissionOverwrites.edit(

          newOwnerId,

          {
            ViewChannel: true,
            Connect: true
          }

        ).catch(() => {});

        // ==================================================
        // 🏠 เปลี่ยนชื่อห้อง
        // ==================================================

        const targetUser =
          await client.users
            .fetch(newOwnerId)
            .catch(() => null);

        if (targetUser) {

          await channel
            .setName(
              `ห้องส่วนตัวของ ${targetUser.username}`
            )
            .catch(() => {});

        }

        // ==================================================
        // ✅ แจ้งผล
        // ==================================================

        return interaction.reply({

          content:
            `🔁 โอนความเป็นเจ้าของห้องให้ <@${newOwnerId}> เรียบร้อยแล้ว`,

          ephemeral: true

        });

      }

    }

    // ==================================================
    // 📝 MODAL
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

      await interaction.reply({

        content:
          "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง",

        ephemeral: true

      }).catch(() => {});

    } else if (
      interaction.deferred
    ) {

      await interaction.editReply({

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
