```js
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
  TextInputStyle,
  PermissionFlagsBits
} = require("discord.js");

const express = require("express");

// ======================================================
// WEB SERVER สำหรับ Render / Cloud
// ======================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web Server is ready.");
});

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

// ======================================================
// ตรวจสอบ ENV
// ======================================================

if (!token) {
  console.error("❌ ไม่พบ TOKEN");
}

if (!createChannelId) {
  console.error("❌ ไม่พบ CREATE_CHANNEL_ID");
}

if (!categoryId) {
  console.error("❌ ไม่พบ CATEGORY_ID");
}

if (!allowRoleId) {
  console.warn("⚠️ ไม่พบ ALLOW_ROLE_ID");
}

// ======================================================
// DISCORD CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// ======================================================
// เก็บข้อมูลห้องชั่วคราว
// channel.id => { owner: user.id }
// ======================================================

const tempChannels = new Map();

// ======================================================
// ยศใหญ่ที่สามารถมองเห็นห้องตอนกด HIDE
// ======================================================

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

// ======================================================
// SLASH COMMAND
// ======================================================

const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("เปิดแผงควบคุมระบบห้องส่วนตัว")
    .setDMPermission(false)
].map(command => command.toJSON());

const rest = new REST({
  version: "10"
}).setToken(token);

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {
  console.log("====================================");
  console.log(`✅ Login: ${client.user.tag}`);
  console.log(`🆔 Bot ID: ${client.user.id}`);
  console.log("====================================");

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("🚀 ติดตั้ง /room เรียบร้อยแล้ว");

  } catch (error) {

    console.error(
      "❌ ติดตั้ง Slash Command ไม่สำเร็จ:",
      error
    );
  }
});

// ======================================================
// ฟังก์ชันสร้าง Permission ตอนสร้างห้อง
//
// @everyone:
//    👁️ เห็นห้อง
//    ❌ เข้าไม่ได้
//
// ALLOW_ROLE:
//    👁️ เห็นห้อง
//    ✅ เข้าได้
//
// OWNER:
//    👁️ เห็น
//    ✅ เข้า
//    🛠️ จัดการ
//
// BOT:
//    👁️ เห็น
//    ✅ เข้า
//    🛠️ จัดการ
// ======================================================

function getCreatePermissions(guildId, ownerId) {

  const permissions = [

    // ================================================
    // @everyone
    // ================================================

    {
      id: guildId,

      allow: [
        PermissionFlagsBits.ViewChannel
      ],

      deny: [
        PermissionFlagsBits.Connect
      ]
    },

    // ================================================
    // OWNER
    // ================================================

    {
      id: ownerId,

      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers
      ]
    },

    // ================================================
    // BOT
    // ================================================

    {
      id: client.user.id,

      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers
      ]
    }
  ];

  // ================================================
  // ALLOW ROLE
  // ================================================

  if (allowRoleId) {

    permissions.push({

      id: allowRoleId,

      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect
      ]
    });
  }

  return permissions;
}

// ======================================================
// VOICE STATE UPDATE
// ======================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // ==================================================
    // 1. สมาชิกเข้าห้อง CREATE CHANNEL
    // ==================================================

    if (
      newState.channelId === createChannelId &&
      oldState.channelId !== createChannelId
    ) {

      const guild = newState.guild;
      const ownerId = newState.member.id;

      console.log(
        `🏠 ${newState.member.user.tag} กำลังสร้างห้อง`
      );

      // ================================================
      // สร้าง Permission
      // ================================================

      const permissionOverwrites =
        getCreatePermissions(
          guild.id,
          ownerId
        );

      // ================================================
      // สร้างห้อง
      // ================================================

      const channel =
        await guild.channels.create({

          name:
            `ห้องส่วนตัวของ ${newState.member.user.username}`,

          type:
            ChannelType.GuildVoice,

          parent:
            categoryId,

          permissionOverwrites:
            permissionOverwrites
        });

      // ================================================
      // เก็บข้อมูลเจ้าของ
      // ================================================

      tempChannels.set(
        channel.id,
        {
          owner: ownerId
        }
      );

      // ================================================
      // ย้ายสมาชิกเข้าห้อง
      // ================================================

      await newState
        .setChannel(channel)
        .catch(error => {

          console.error(
            "❌ ย้ายสมาชิกเข้าห้องไม่สำเร็จ:",
            error
          );

        });

      console.log(
        `✅ สร้างห้อง ${channel.name}`
      );

      return;
    }

    // ==================================================
    // 2. ตรวจสอบห้องชั่วคราวที่สมาชิกออก
    // ==================================================

    if (
      oldState.channelId &&
      tempChannels.has(oldState.channelId)
    ) {

      const channelId =
        oldState.channelId;

      const channel =
        await oldState.guild.channels
          .fetch(channelId)
          .catch(() => null);

      // ================================================
      // ห้องถูกลบไปแล้ว
      // ================================================

      if (!channel) {

        tempChannels.delete(
          channelId
        );

        return;
      }

      // ================================================
      // ไม่มีคนอยู่ในห้อง
      // ลบห้อง
      // ================================================

      if (
        channel.members.size === 0
      ) {

        console.log(
          `🗑️ ลบห้อง ${channel.name}`
        );

        await channel
          .delete()
          .catch(error => {

            console.error(
              "❌ ลบห้องไม่สำเร็จ:",
              error
            );

          });

        tempChannels.delete(
          channelId
        );
      }
    }

  } catch (error) {

    console.error(
      "❌ Error in voiceStateUpdate:",
      error
    );
  }
});

// ======================================================
// INTERACTION CREATE
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
            [
              "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว",
              "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ",
              "",
              "📌 **วิธีใช้งาน**",
              "• เข้าไปที่ห้องสร้างห้อง",
              "• ระบบจะสร้างห้องส่วนตัวให้อัตโนมัติ",
              "• ใช้ปุ่มด้านล่างเพื่อจัดการห้อง",
              "",
              "🔐 **ระบบสิทธิ์**",
              "• @everyone เห็นห้องได้ แต่เข้าไม่ได้",
              "• ยศที่กำหนดสามารถเข้าห้องได้",
              "• เจ้าของห้องสามารถควบคุมห้องได้"
            ].join("\n")
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
              .setLabel("ชื่อห้อง")
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId("lock")
              .setEmoji("🔒")
              .setLabel("ล็อก")
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId("unlock")
              .setEmoji("🔓")
              .setLabel("ปลดล็อก")
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId("limit")
              .setEmoji("🎯")
              .setLabel("จำกัดคน")
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId("owner")
              .setEmoji("👑")
              .setLabel("เจ้าของ")
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
              .setLabel("ซ่อน")
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId("show")
              .setEmoji("👁️")
              .setLabel("แสดง")
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId("transfer")
              .setEmoji("🔁")
              .setLabel("โอนเจ้าของ")
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId("allow")
              .setEmoji("🧑‍🤝‍🧑")
              .setLabel("อนุญาต")
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId("deny")
              .setEmoji("🚫")
              .setLabel("บล็อก")
              .setStyle(
                ButtonStyle.Secondary
              )
          );

      // =================================================
      // ส่ง Embed
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

      // =================================================
      // ตอบแบบ Ephemeral
      // =================================================

      await interaction.reply({

        content:
          "✅ สร้างแผงควบคุมเรียบร้อยแล้ว",

        ephemeral: true
      });

      // =================================================
      // ลบข้อความตอบกลับ
      // =================================================

      await interaction
        .deleteReply()
        .catch(() => {});

      return;
    }

    // ==================================================
    // BUTTON
    // ==================================================

    if (interaction.isButton()) {

      const member =
        interaction.member;

      const channel =
        member.voice?.channel;

      // ================================================
      // ต้องอยู่ในห้องเสียง
      // ================================================

      if (!channel) {

        return interaction.reply({

          content:
            "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

          ephemeral: true
        });
      }

      // ================================================
      // ตรวจสอบห้อง
      // ================================================

      const data =
        tempChannels.get(
          channel.id
        );

      // ================================================
      // ปุ่ม OWNER
      // ================================================

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
          await interaction.guild.members
            .fetch(data.owner)
            .catch(() => null);

        return interaction.reply({

          embeds: [

            new EmbedBuilder()

              .setTitle(
                "👑 เจ้าของห้อง"
              )

              .setDescription(
                `เจ้าของห้องปัจจุบันคือ <@${data.owner}>`
              )

              .setColor(
                0xffd700
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

      // ================================================
      // ตรวจสอบเจ้าของ
      // ================================================

      if (
        !data ||
        data.owner !== member.id
      ) {

        return interaction.reply({

          content:
            "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ",

          ephemeral: true
        });
      }

      // =================================================
      // ✏️ เปลี่ยนชื่อ
      // =================================================

      if (
        interaction.customId === "name"
      ) {

        const modal =
          new ModalBuilder()

            .setCustomId(
              "rename_room"
            )

            .setTitle(
              "✏️ เปลี่ยนชื่อห้อง"
            );

        const input =
          new TextInputBuilder()

            .setCustomId(
              "room_name"
            )

            .setLabel(
              "ชื่อห้องใหม่"
            )

            .setPlaceholder(
              "กรอกชื่อห้อง"
            )

            .setStyle(
              TextInputStyle.Short
            )

            .setRequired(true)

            .setMaxLength(100);

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
        interaction.customId === "limit"
      ) {

        const modal =
          new ModalBuilder()

            .setCustomId(
              "limit_room"
            )

            .setTitle(
              "🎯 ตั้งจำนวนคน"
            );

        const input =
          new TextInputBuilder()

            .setCustomId(
              "limit_input"
            )

            .setLabel(
              "จำนวนคน (0 = ไม่จำกัด)"
            )

            .setPlaceholder(
              "เช่น 5 หรือ 0"
            )

            .setStyle(
              TextInputStyle.Short
            )

            .setRequired(true)

            .setMaxLength(2);

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
      // 👥 เลือกสมาชิก
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
              "🎯 เลือกสมาชิก..."
            )

            .setMinValues(1)

            .setMaxValues(1);

        return interaction.reply({

          content:
            "🎯 โปรดเลือกสมาชิกจากเมนูด้านล่าง",

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
      // จากตรงนี้เป็น Permission
      // =================================================

      await interaction.deferReply({
        ephemeral: true
      });

      // =================================================
      // 🔒 LOCK
      //
      // @everyone เข้าไม่ได้
      // ALLOW_ROLE เข้าไม่ได้
      // OWNER เข้าได้
      // =================================================

      if (
        interaction.customId === "lock"
      ) {

        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: false
            }
          )
          .catch(() => {});

        if (allowRoleId) {

          await channel.permissionOverwrites
            .edit(
              allowRoleId,
              {
                ViewChannel: true,
                Connect: false
              }
            )
            .catch(() => {});
        }

        await channel.permissionOverwrites
          .edit(
            data.owner,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(() => {});

        return interaction.editReply({

          content:
            "🔒 **ล็อกห้องเรียบร้อยแล้ว**\nเฉพาะเจ้าของห้องเท่านั้นที่สามารถเข้าได้"
        });
      }

      // =================================================
      // 🔓 UNLOCK
      //
      // @everyone เข้าไม่ได้
      // ALLOW_ROLE เข้าได้
      // OWNER เข้าได้
      // =================================================

      if (
        interaction.customId === "unlock"
      ) {

        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: false
            }
          )
          .catch(() => {});

        if (allowRoleId) {

          await channel.permissionOverwrites
            .edit(
              allowRoleId,
              {
                ViewChannel: true,
                Connect: true
              }
            )
            .catch(() => {});
        }

        await channel.permissionOverwrites
          .edit(
            data.owner,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(() => {});

        return interaction.editReply({

          content:
            "🔓 **ปลดล็อกห้องเรียบร้อยแล้ว**\nสมาชิกที่มียศที่กำหนดสามารถเข้าห้องได้"
        });
      }

      // =================================================
      // 🙈 HIDE
      // =================================================

      if (
        interaction.customId === "hide"
      ) {

        const permissions = [

          // =============================================
          // @everyone
          // =============================================

          {
            id:
              interaction.guild.id,

            deny: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect
            ]
          },

          // =============================================
          // Bot
          // =============================================

          {
            id:
              client.user.id,

            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers
            ]
          },

          // =============================================
          // Owner
          // =============================================

          {
            id:
              data.owner,

            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers
            ]
          }
        ];

        // =============================================
        // ยศใหญ่
        // =============================================

        for (
          const roleId of bigRoleIds
        ) {

          permissions.push({

            id: roleId,

            allow: [
              PermissionFlagsBits.ViewChannel
            ]
          });
        }

        // =============================================
        // Allow Role
        // =============================================

        if (allowRoleId) {

          permissions.push({

            id: allowRoleId,

            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect
            ]
          });
        }

        // =============================================
        // ตั้ง Permission ใหม่
        // =============================================

        await channel.permissionOverwrites
          .set(permissions)
          .catch(console.error);

        return interaction.editReply({

          content:
            "🙈 **ซ่อนห้องเรียบร้อยแล้ว**"
        });
      }

      // =================================================
      // 👁️ SHOW
      //
      // ทุกคนมองเห็น
      // แต่ @everyone ยังเข้าไม่ได้
      // =================================================

      if (
        interaction.customId === "show"
      ) {

        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: false
            }
          )
          .catch(() => {});

        if (allowRoleId) {

          await channel.permissionOverwrites
            .edit(
              allowRoleId,
              {
                ViewChannel: true,
                Connect: true
              }
            )
            .catch(() => {});
        }

        await channel.permissionOverwrites
          .edit(
            data.owner,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(() => {});

        return interaction.editReply({

          content:
            "👁️ **แสดงห้องเรียบร้อยแล้ว**\n@everyone สามารถมองเห็นห้องได้ แต่ยังไม่สามารถเข้าได้"
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
        interaction.member.voice?.channel;

      if (!channel) {

        return interaction.reply({

          content:
            "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

          ephemeral: true
        });
      }

      const data =
        tempChannels.get(
          channel.id
        );

      // ================================================
      // ตรวจสอบเจ้าของ
      // ================================================

      if (
        !data ||
        data.owner !== interaction.member.id
      ) {

        return interaction.reply({

          content:
            "❌ คุณต้องเป็นเจ้าของห้องเท่านั้น",

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

        await channel.permissionOverwrites
          .edit(
            targetId,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(() => {});

        return interaction.reply({

          content:
            `✅ อนุญาตให้ <@${targetId}> เข้าห้องได้แล้วครับ`,

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

        await channel.permissionOverwrites
          .edit(
            targetId,
            {
              ViewChannel: false,
              Connect: false
            }
          )
          .catch(() => {});

        // ===============================================
        // ถ้าคนที่บล็อกอยู่ในห้อง
        // เตะออก
        // ===============================================

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
            `🚫 บล็อก <@${targetId}> เรียบร้อยแล้วครับ`,

          ephemeral: true
        });
      }

      // =================================================
      // 🔁 TRANSFER
      // =================================================

      if (
        interaction.customId ===
        "select_transfer"
      ) {

        const targetMember =
          await interaction.guild.members
            .fetch(targetId)
            .catch(() => null);

        if (!targetMember) {

          return interaction.reply({

            content:
              "❌ ไม่พบสมาชิกคนนี้",

            ephemeral: true
          });
        }

        // ===============================================
        // เจ้าของเดิม
        // ===============================================

        const oldOwnerId =
          data.owner;

        // ===============================================
        // เปลี่ยนเจ้าของ
        // ===============================================

        data.owner =
          targetId;

        // ===============================================
        // เจ้าของใหม่
        // ===============================================

        await channel.permissionOverwrites
          .edit(
            targetId,
            {
              ViewChannel: true,
              Connect: true,
              ManageChannels: true,
              MoveMembers: true
            }
          )
          .catch(() => {});

        // ===============================================
        // เจ้าของเก่า
        // ===============================================

        await channel.permissionOverwrites
          .edit(
            oldOwnerId,
            {
              ViewChannel: true,
              Connect: true,
              ManageChannels: false,
              MoveMembers: false
            }
          )
          .catch(() => {});

        // ===============================================
        // เปลี่ยนชื่อห้อง
        // ===============================================

        await channel
          .setName(
            `📍・ห้องส่วนตัวของ ${targetMember.user.username}`
          )
          .catch(() => {});

        return interaction.reply({

          content:
            `🔁 โอนเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้วครับ`,

          ephemeral: true
        });
      }
    }

    // ==================================================
    // MODAL SUBMIT
    // ==================================================

    if (
      interaction.isModalSubmit()
    ) {

      const channel =
        interaction.member.voice?.channel;

      if (!channel) {

        return interaction.reply({

          content:
            "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

          ephemeral: true
        });
      }

      const data =
        tempChannels.get(
          channel.id
        );

      // ================================================
      // ตรวจสอบเจ้าของ
      // ================================================

      if (
        !data ||
        data.owner !== interaction.member.id
      ) {

        return interaction.reply({

          content:
            "❌ คุณต้องเป็นเจ้าของห้องเท่านั้น",

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
            )
            .trim();

        if (!name) {

          return interaction.reply({

            content:
              "❌ กรุณาใส่ชื่อห้อง",

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
            )
            .trim();

        const limit =
          Number(limitInput);

        // ===============================================
        // ตรวจสอบตัวเลข
        // ===============================================

        if (
          !Number.isInteger(limit) ||
          limit < 0 ||
          limit > 99
        ) {

          return interaction.reply({

            content:
              "❌ โปรดใส่หมายเลขระหว่าง **0 - 99**",

            ephemeral: true
          });
        }

        // ===============================================
        // 0 = ไม่จำกัด
        // ===============================================

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

    // ==================================================
    // ส่ง Error ให้ผู้ใช้
    // ==================================================

    try {

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        await interaction.reply({

          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผล",

          ephemeral: true
        });

      } else if (
        interaction.deferred
      ) {

        await interaction.editReply({

          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผล"
        });
      }

    } catch (replyError) {

      console.error(
        "❌ ไม่สามารถส่งข้อความ Error:",
        replyError
      );
    }
  }
});

// ======================================================
// LOGIN
// ======================================================

if (token) {

  client.login(token)

    .then(() => {

      console.log(
        "🔐 กำลังเข้าสู่ระบบ Discord..."
      );

    })

    .catch(error => {

      console.error(
        "❌ Login Discord ไม่สำเร็จ:",
        error
      );

    });

}
```
