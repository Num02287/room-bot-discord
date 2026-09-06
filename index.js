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
    .setDescription("เปิดแผงควบคุมห้องส่วนตัว")
    .setDMPermission(false)
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {
  console.log(`✅ Login as: ${client.user.tag}`);

  try {
    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: commands
      }
    );

    console.log("🚀 ติดตั้ง Slash Command /room เรียบร้อยแล้ว");
  } catch (error) {
    console.error(
      "❌ ไม่สามารถติดตั้ง Slash Command:",
      error
    );
  }
});

// ======================================================
// ฟังก์ชัน Permission ตอนสร้างห้อง
//
// @everyone = เห็นห้อง แต่เข้าไม่ได้
// เจ้าของ = เข้าได้ + ควบคุมห้อง
// ALLOW_ROLE = เข้าได้
// Bot = จัดการห้องได้
// ======================================================

function createPrivatePermissions(guildId, ownerId) {

  const permissions = [

    // ==================================================
    // @everyone
    // เห็นห้อง แต่ห้ามเข้า
    // ==================================================

    {
      id: guildId,

      allow: [
        PermissionFlagsBits.ViewChannel
      ],

      deny: [
        PermissionFlagsBits.Connect
      ]
    },

    // ==================================================
    // เจ้าของห้อง
    // ==================================================

    {
      id: ownerId,

      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers
      ]
    },

    // ==================================================
    // Bot
    // ==================================================

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

  // ====================================================
  // ยศที่ได้รับอนุญาต
  // ====================================================

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
    // สมาชิกเข้าห้องสร้างห้อง
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

      // =================================================
      // Permission
      // =================================================

      const permissionOverwrites =
        createPrivatePermissions(
          guild.id,
          ownerId
        );

      // =================================================
      // สร้างห้อง
      // =================================================

      const channel = await guild.channels.create({

        name:
          `ห้องส่วนตัวของ ${newState.member.user.username}`,

        type:
          ChannelType.GuildVoice,

        parent:
          categoryId || null,

        permissionOverwrites:
          permissionOverwrites
      });

      // =================================================
      // เก็บเจ้าของห้อง
      // =================================================

      tempChannels.set(channel.id, {
        owner: ownerId
      });

      // =================================================
      // ย้ายเจ้าของเข้าห้อง
      // =================================================

      await newState
        .setChannel(channel)
        .catch(error => {

          console.error(
            "❌ ไม่สามารถย้ายสมาชิกเข้าห้อง:",
            error
          );

        });

      console.log(
        `✅ สร้างห้องสำเร็จ: ${channel.name}`
      );

      return;
    }

    // ==================================================
    // ตรวจสอบห้องชั่วคราวเมื่อสมาชิกออก
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

      // =================================================
      // ห้องถูกลบไปแล้ว
      // =================================================

      if (!channel) {

        tempChannels.delete(channelId);

        return;
      }

      // =================================================
      // ไม่มีคนในห้อง
      // ลบห้อง
      // =================================================

      if (channel.members.size === 0) {

        console.log(
          `🗑️ ลบห้อง ${channel.name}`
        );

        await channel
          .delete()
          .catch(error => {

            console.error(
              "❌ ไม่สามารถลบห้อง:",
              error
            );

          });

        tempChannels.delete(channelId);
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

      const embed = new EmbedBuilder()

        .setTitle(
          "🏠 ระบบสร้างห้องส่วนตัวประจำโซน"
        )

        .setDescription(
          [
            "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว",
            "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ",
            "",
            "📌 **วิธีใช้งาน**",
            "1️⃣ เข้าไปที่ห้องสร้างห้อง",
            "2️⃣ ระบบจะสร้างห้องส่วนตัวให้อัตโนมัติ",
            "3️⃣ ใช้ปุ่มด้านล่างเพื่อจัดการห้อง",
            "",
            "🔒 ห้องที่สร้างใหม่จะไม่อนุญาตให้ @everyone เข้า",
            "⭐ ยศที่กำหนดสามารถเข้าห้องได้ทันที"
          ].join("\n")
        )

        .setImage(
          "https://i.ibb.co/Kjbw5BGb/image.png"
        )

        .setFooter({
          text:
            "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        })

        .setColor(0x2b2d31);

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
      // ส่ง Panel
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
          "✅ สร้างแผงควบคุมเรียบร้อยแล้ว",

        ephemeral: true
      });

      await interaction
        .deleteReply()
        .catch(() => {});

      return;
    }

    // ==================================================
    // BUTTONS
    // ==================================================

    if (interaction.isButton()) {

      const member =
        interaction.member;

      const channel =
        member.voice?.channel;

      // =================================================
      // ไม่ได้อยู่ใน Voice
      // =================================================

      if (!channel) {

        return interaction.reply({

          content:
            "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

          ephemeral: true
        });
      }

      // =================================================
      // ตรวจสอบห้อง
      // =================================================

      const data =
        tempChannels.get(channel.id);

      if (!data) {

        return interaction.reply({

          content:
            "❌ ห้องนี้ไม่ได้อยู่ในระบบห้องส่วนตัว",

          ephemeral: true
        });
      }

      // =================================================
      // OWNER
      // =================================================

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

      // =================================================
      // ตรวจสอบเจ้าของ
      // =================================================

      if (
        data.owner !== member.id
      ) {

        return interaction.reply({

          content:
            "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ",

          ephemeral: true
        });
      }

      // =================================================
      // NAME MODAL
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
            .addComponents(input)

        );

        return interaction.showModal(
          modal
        );
      }

      // =================================================
      // LIMIT MODAL
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
              "ตัวอย่าง: 5 หรือ 0"
            )

            .setStyle(
              TextInputStyle.Short
            )

            .setRequired(true)

            .setMaxLength(2);

        modal.addComponents(

          new ActionRowBuilder()
            .addComponents(input)

        );

        return interaction.showModal(
          modal
        );
      }

      // =================================================
      // SELECT MENU
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
              "🎯 เลือกสมาชิกที่ต้องการ..."
            )

            .setMinValues(1)

            .setMaxValues(1);

        return interaction.reply({

          content:
            "🎯 **โปรดเลือกสมาชิกจากเมนูด้านล่าง**",

          components: [

            new ActionRowBuilder()
              .addComponents(menu)

          ],

          ephemeral: true
        });
      }

      // =================================================
      // DEFER
      // =================================================

      await interaction.deferReply({
        ephemeral: true
      });

      // =================================================
      // 🔒 LOCK
      // =================================================

      if (
        interaction.customId === "lock"
      ) {

        // @everyone เข้าไม่ได้
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: false
            }
          )
          .catch(console.error);

        // เจ้าของเข้าได้
        await channel.permissionOverwrites
          .edit(
            data.owner,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(console.error);

        // ยศพิเศษเข้าได้
        if (allowRoleId) {

          await channel.permissionOverwrites
            .edit(
              allowRoleId,
              {
                ViewChannel: true,
                Connect: true
              }
            )
            .catch(console.error);
        }

        return interaction.editReply({

          content:
            "🔒 **ล็อกห้องเรียบร้อยแล้ว**\nสมาชิกทั่วไปไม่สามารถเข้าห้องได้"
        });
      }

      // =================================================
      // 🔓 UNLOCK
      // =================================================

      if (
        interaction.customId === "unlock"
      ) {

        // @everyone เข้าได้
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(console.error);

        // เจ้าของ
        await channel.permissionOverwrites
          .edit(
            data.owner,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(console.error);

        // ยศพิเศษ
        if (allowRoleId) {

          await channel.permissionOverwrites
            .edit(
              allowRoleId,
              {
                ViewChannel: true,
                Connect: true
              }
            )
            .catch(console.error);
        }

        return interaction.editReply({

          content:
            "🔓 **ปลดล็อกห้องเรียบร้อยแล้ว**\nทุกคนสามารถเข้าห้องได้"
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
          // ซ่อน + เข้าไม่ได้
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
          // เจ้าของ
          // =============================================

          {
            id:
              data.owner,

            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect
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
        // ยศพิเศษ
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
        // ตั้ง Permission
        // =============================================

        await channel.permissionOverwrites
          .set(permissions)
          .catch(console.error);

        return interaction.editReply({

          content:
            "🙈 **ซ่อนห้องเรียบร้อยแล้ว**\nสมาชิกทั่วไปจะมองไม่เห็นห้อง"
        });
      }

      // =================================================
      // 👁 SHOW
      // =================================================

      if (
        interaction.customId === "show"
      ) {

        // @everyone
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(console.error);

        // เจ้าของ
        await channel.permissionOverwrites
          .edit(
            data.owner,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(console.error);

        // ยศพิเศษ
        if (allowRoleId) {

          await channel.permissionOverwrites
            .edit(
              allowRoleId,
              {
                ViewChannel: true,
                Connect: true
              }
            )
            .catch(console.error);
        }

        return interaction.editReply({

          content:
            "👁️ **แสดงห้องเรียบร้อยแล้ว**\nทุกคนสามารถมองเห็นและเข้าห้องได้"
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
      // ALLOW
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
          .catch(console.error);

        return interaction.reply({

          content:
            `✅ อนุญาตให้ <@${targetId}> มองเห็นและเข้าห้องได้แล้ว`,

          ephemeral: true
        });
      }

      // =================================================
      // DENY
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
          .catch(console.error);

        // ถ้าอยู่ในห้องให้เตะออก
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
            `🚫 บล็อก <@${targetId}> เรียบร้อยแล้ว`,

          ephemeral: true
        });
      }

      // =================================================
      // TRANSFER OWNER
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
          .catch(console.error);

        // ===============================================
        // เจ้าของเดิมกลับเป็นสมาชิกทั่วไป
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
          .catch(console.error);

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
            `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้ว`,

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
      // RENAME
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
          .catch(console.error);

        return interaction.reply({

          content:
            `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`,

          ephemeral: true
        });
      }

      // =================================================
      // LIMIT
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

        if (
          !Number.isInteger(limit) ||
          limit < 0 ||
          limit > 99
        ) {

          return interaction.reply({

            content:
              "❌ โปรดใส่ตัวเลขระหว่าง **0 - 99**",

            ephemeral: true
          });
        }

        await channel
          .setUserLimit(limit)
          .catch(console.error);

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

if (!token) {

  console.error(
    "❌ ไม่พบ TOKEN ใน Environment Variables"
  );

} else {

  client.login(token)

    .then(() => {

      console.log(
        "🔐 กำลัง Login Discord..."
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
