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
  PermissionsBitField
} = require("discord.js");

const express = require("express");

// =====================================================
// Web Server สำหรับ Render / Cloud
// =====================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web Server is ready.");
});

// =====================================================
// Environment Variables
// =====================================================

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

// =====================================================
// ตรวจสอบ Environment Variables
// =====================================================

if (!token) {
  console.error("❌ ไม่พบ TOKEN ใน Environment Variables");
  process.exit(1);
}

if (!createChannelId) {
  console.error("❌ ไม่พบ CREATE_CHANNEL_ID ใน Environment Variables");
}

if (!categoryId) {
  console.error("❌ ไม่พบ CATEGORY_ID ใน Environment Variables");
}

// =====================================================
// Discord Client
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// =====================================================
// เก็บข้อมูลห้องชั่วคราว
// =====================================================
//
// Map Structure:
//
// tempChannels.set(channelId, {
//   owner: userId,
//   hidden: false
// });
//
// =====================================================

const tempChannels = new Map();

// =====================================================
// ยศใหญ่ที่สามารถมองเห็นห้องตอน Hide
// =====================================================

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

// =====================================================
// Slash Command
// =====================================================

const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("เปิดแผงควบคุมห้องส่วนตัว")
    .setDMPermission(false)
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

// =====================================================
// Bot Ready
// =====================================================

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
    console.error("❌ ไม่สามารถติดตั้ง Slash Command:", error);
  }
});

// =====================================================
// ฟังก์ชันสร้าง Permission ห้อง
// =====================================================

function createRoomPermissions(guildId, ownerId) {
  const permissions = [
    {
      id: guildId,
      allow: [
        PermissionsBitField.Flags.ViewChannel
      ],
      deny: [
        PermissionsBitField.Flags.Connect
      ]
    },

    {
      id: ownerId,
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
  if (allowRoleId) {
    permissions.push({
      id: allowRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.Connect
      ]
    });
  }

  return permissions;
}

// =====================================================
// Voice State Update
// =====================================================

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {

    // =================================================
    // 1. สมาชิกเข้าห้อง CREATE CHANNEL
    // =================================================

    if (newState.channelId === createChannelId) {

      const guild = newState.guild;
      const ownerId = newState.member.id;

      // สร้าง Permission
      const permissionOverwrites = createRoomPermissions(
        guild.id,
        ownerId
      );

      // สร้างห้อง
      const channel = await guild.channels.create({
        name: `ห้องส่วนตัวของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites
      });

      // ย้ายสมาชิกเข้าห้อง
      await newState.setChannel(channel).catch(() => {});

      // เก็บข้อมูลห้อง
      tempChannels.set(channel.id, {
        owner: ownerId,
        hidden: false
      });

      console.log(
        `🏠 สร้างห้อง ${channel.name} | Owner: ${newState.member.user.tag}`
      );

      return;
    }

    // =================================================
    // 2. ตรวจสอบห้องเก่า
    // =================================================

    if (
      oldState.channelId &&
      tempChannels.has(oldState.channelId)
    ) {

      const channel = await oldState.guild.channels
        .fetch(oldState.channelId)
        .catch(() => null);

      // ถ้าห้องไม่มีอยู่แล้ว
      if (!channel) {
        tempChannels.delete(oldState.channelId);
        return;
      }

      // ถ้าไม่มีคนอยู่ในห้อง
      if (channel.members.size === 0) {

        await channel.delete().catch(() => {});

        tempChannels.delete(oldState.channelId);

        console.log(
          `🗑️ ลบห้องชั่วคราว ${channel.name}`
        );

        return;
      }
    }

  } catch (error) {
    console.error(
      "❌ Error in voiceStateUpdate:",
      error
    );
  }
});

// =====================================================
// Interaction Create
// =====================================================

client.on("interactionCreate", async interaction => {

  try {

    // =================================================
    // /room
    // =================================================

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "room"
    ) {

      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
        .setDescription(
          "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
          "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n" +
          "🔹 สมาชิกที่มียศพิเศษสามารถเข้าห้องได้ตามสิทธิ์ที่กำหนด\n\n" +
          "📌 **วิธีใช้งาน**\n" +
          "กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        )
        .setImage(
          "https://i.ibb.co/Kjbw5BGb/image.png"
        )
        .setFooter({
          text: "📌 ระบบจัดการห้องส่วนตัว"
        })
        .setColor(0x2b2d31);

      // =================================================
      // Row 1
      // =================================================

      const row1 = new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId("name")
            .setEmoji("✏️")
            .setLabel("ชื่อห้อง")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("lock")
            .setEmoji("🔒")
            .setLabel("ล็อก")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("unlock")
            .setEmoji("🔓")
            .setLabel("ปลดล็อก")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("limit")
            .setEmoji("🎯")
            .setLabel("จำกัดคน")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("owner")
            .setEmoji("👑")
            .setLabel("เจ้าของ")
            .setStyle(ButtonStyle.Secondary)
        );

      // =================================================
      // Row 2
      // =================================================

      const row2 = new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId("hide")
            .setEmoji("🙈")
            .setLabel("ซ่อนห้อง")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("show")
            .setEmoji("👁️")
            .setLabel("แสดงห้อง")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("transfer")
            .setEmoji("🔁")
            .setLabel("โอนเจ้าของ")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("allow")
            .setEmoji("🧑‍🤝‍🧑")
            .setLabel("อนุญาต")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("deny")
            .setEmoji("🚫")
            .setLabel("บล็อก")
            .setStyle(ButtonStyle.Secondary)
        );

      // ส่ง Panel
      await interaction.channel.send({
        embeds: [embed],
        components: [row1, row2]
      });

      // ตอบแบบเงียบ
      await interaction.reply({
        content: "✅ สร้างแผงควบคุมเรียบร้อยแล้ว",
        ephemeral: true
      });

      return;
    }

    // =================================================
    // Buttons
    // =================================================

    if (interaction.isButton()) {

      const member = interaction.member;

      // ตรวจว่าผู้ใช้กำลังอยู่ใน Voice
      const channel = member.voice.channel;

      if (!channel) {
        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",
          ephemeral: true
        });
      }

      // ตรวจว่าเป็นห้องระบบหรือไม่
      const data = tempChannels.get(channel.id);

      if (!data) {
        return interaction.reply({
          content: "❌ ห้องนี้ไม่ใช่ห้องส่วนตัวของระบบ",
          ephemeral: true
        });
      }

      // =================================================
      // OWNER
      // =================================================

      if (interaction.customId === "owner") {

        const ownerMember =
          interaction.guild.members.cache.get(data.owner);

        return interaction.reply({

          embeds: [

            new EmbedBuilder()
              .setTitle("👑 เจ้าของห้อง")
              .setDescription(
                `เจ้าของห้องปัจจุบันคือ <@${data.owner}>`
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

      // =================================================
      // ตรวจสอบ Owner
      // =================================================

      if (data.owner !== member.id) {

        return interaction.reply({
          content:
            "❌ คุณไม่ใช่เจ้าของห้องนี้\n" +
            "เฉพาะเจ้าของห้องเท่านั้นที่สามารถจัดการได้",
          ephemeral: true
        });
      }

      // =================================================
      // NAME
      // =================================================

      if (interaction.customId === "name") {

        const modal = new ModalBuilder()
          .setCustomId("rename_room")
          .setTitle("✏️ เปลี่ยนชื่อห้อง");

        const input = new TextInputBuilder()
          .setCustomId("room_name")
          .setLabel("ชื่อห้องใหม่")
          .setPlaceholder("เช่น ห้องพูดคุย")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true);

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
          .setCustomId("limit_room")
          .setTitle("🎯 ตั้งจำนวนคน");

        const input = new TextInputBuilder()
          .setCustomId("limit_input")
          .setLabel("จำนวนคน (0 = ไม่จำกัด)")
          .setPlaceholder("0 - 99")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // =================================================
      // USER SELECT
      // =================================================

      if (
        ["allow", "deny", "transfer"].includes(
          interaction.customId
        )
      ) {

        const menu = new UserSelectMenuBuilder()
          .setCustomId(
            `select_${interaction.customId}`
          )
          .setPlaceholder(
            "👤 เลือกสมาชิกที่ต้องการ..."
          )
          .setMinValues(1)
          .setMaxValues(1);

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

      // =================================================
      // LOCK
      // =================================================

      if (interaction.customId === "lock") {

        await interaction.deferReply({
          ephemeral: true
        });

        // @everyone มองเห็น แต่เข้าไม่ได้
        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: true,
            Connect: false
          }
        );

        // ยศพิเศษเข้าไม่ได้
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              ViewChannel: true,
              Connect: false
            }
          );
        }

        // Owner เข้าได้เสมอ
        await channel.permissionOverwrites.edit(
          data.owner,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        data.hidden = false;

        return interaction.editReply({
          content:
            "🔒 **ล็อกห้องเรียบร้อยแล้ว**\n" +
            "สมาชิกทั่วไปจะไม่สามารถเข้าห้องได้"
        });
      }

      // =================================================
      // UNLOCK
      // =================================================

      if (interaction.customId === "unlock") {

        await interaction.deferReply({
          ephemeral: true
        });

        // ⭐ สำคัญ
        // เปิดให้ @everyone เข้าได้
        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        // เปิดให้ยศพิเศษเข้าได้
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              ViewChannel: true,
              Connect: true
            }
          );
        }

        // Owner
        await channel.permissionOverwrites.edit(
          data.owner,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        data.hidden = false;

        return interaction.editReply({
          content:
            "🔓 **ปลดล็อกห้องเรียบร้อยแล้ว**\n" +
            "สมาชิกสามารถเข้าห้องได้แล้ว"
        });
      }

      // =================================================
      // HIDE
      // =================================================

      if (interaction.customId === "hide") {

        await interaction.deferReply({
          ephemeral: true
        });

        // ซ่อนจาก @everyone
        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: false,
            Connect: false
          }
        );

        // Bot
        await channel.permissionOverwrites.edit(
          client.user.id,
          {
            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MoveMembers: true
          }
        );

        // Owner
        await channel.permissionOverwrites.edit(
          data.owner,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        // ยศใหญ่
        for (const roleId of bigRoleIds) {

          await channel.permissionOverwrites.edit(
            roleId,
            {
              ViewChannel: true,
              Connect: true
            }
          ).catch(() => {});
        }

        // ยศพิเศษ
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              ViewChannel: true,
              Connect: true
            }
          );
        }

        data.hidden = true;

        return interaction.editReply({
          content:
            "🙈 **ซ่อนห้องเรียบร้อยแล้ว**\n" +
            "สมาชิกทั่วไปจะไม่สามารถมองเห็นห้องได้"
        });
      }

      // =================================================
      // SHOW
      // =================================================

      if (interaction.customId === "show") {

        await interaction.deferReply({
          ephemeral: true
        });

        // ⭐ สำคัญมาก
        // แสดงห้อง = เปิด ViewChannel
        // และเปิด Connect ด้วย
        //
        // ห้ามใช้ Connect: false ตรงนี้
        // เพราะจะทำให้ห้องล็อก
        // =================================================

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        // ยศพิเศษ
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              ViewChannel: true,
              Connect: true
            }
          );
        }

        // Owner
        await channel.permissionOverwrites.edit(
          data.owner,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        data.hidden = false;

        return interaction.editReply({
          content:
            "👁️ **แสดงห้องเรียบร้อยแล้ว**\n" +
            "🔓 ห้องถูกปลดล็อกให้สมาชิกสามารถเข้าได้แล้ว"
        });
      }

      // =================================================
      // กรณีปุ่มไม่ตรง
      // =================================================

      return;
    }

    // =================================================
    // USER SELECT MENU
    // =================================================

    if (interaction.isUserSelectMenu()) {

      const channel =
        interaction.member.voice.channel;

      const data =
        tempChannels.get(channel?.id);

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

      // =================================================
      // ALLOW
      // =================================================

      if (
        interaction.customId === "select_allow"
      ) {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        return interaction.reply({

          content:
            `✅ อนุญาตให้ <@${targetId}> ` +
            `มองเห็นและเข้าห้องได้แล้วครับ`,

          ephemeral: true
        });
      }

      // =================================================
      // DENY
      // =================================================

      if (
        interaction.customId === "select_deny"
      ) {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            ViewChannel: false,
            Connect: false
          }
        );

        const targetMember =
          channel.members.get(targetId);

        if (targetMember) {

          await targetMember.voice
            .disconnect()
            .catch(() => {});
        }

        return interaction.reply({

          content:
            `🚫 บล็อก <@${targetId}> ` +
            `ไม่ให้มองเห็นและเข้าห้องแล้วครับ`,

          ephemeral: true
        });
      }

      // =================================================
      // TRANSFER OWNER
      // =================================================

      if (
        interaction.customId === "select_transfer"
      ) {

        const oldOwnerId = data.owner;

        // เปลี่ยน Owner
        data.owner = targetId;

        // =================================================
        // ถอดสิทธิ์ Owner เก่า
        // =================================================

        await channel.permissionOverwrites.edit(
          oldOwnerId,
          {
            ViewChannel: true,
            Connect: false
          }
        );

        // =================================================
        // ให้ Owner ใหม่
        // =================================================

        await channel.permissionOverwrites.edit(
          targetId,
          {
            ViewChannel: true,
            Connect: true
          }
        );

        // เปลี่ยนชื่อห้อง
        const targetUser =
          await client.users
            .fetch(targetId)
            .catch(() => null);

        if (targetUser) {

          await channel.setName(
            `ห้องส่วนตัวของ ${targetUser.username}`
          ).catch(() => {});
        }

        return interaction.reply({

          content:
            `🔁 โอนความเป็นเจ้าของห้องให้ ` +
            `<@${targetId}> เรียบร้อยแล้วครับ`,

          ephemeral: true
        });
      }

      return;
    }

    // =================================================
    // MODAL SUBMIT
    // =================================================

    if (interaction.isModalSubmit()) {

      const channel =
        interaction.member.voice.channel;

      const data =
        tempChannels.get(channel?.id);

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

      // =================================================
      // RENAME
      // =================================================

      if (
        interaction.customId === "rename_room"
      ) {

        const name =
          interaction.fields
            .getTextInputValue("room_name")
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

      // =================================================
      // LIMIT
      // =================================================

      if (
        interaction.customId === "limit_room"
      ) {

        const limitInput =
          interaction.fields
            .getTextInputValue("limit_input")
            .trim();

        const limit =
          parseInt(limitInput, 10);

        if (
          isNaN(limit) ||
          limit < 0 ||
          limit > 99
        ) {

          return interaction.reply({
            content:
              "❌ โปรดใส่หมายเลขที่ถูกต้องระหว่าง **0 - 99**",
            ephemeral: true
          });
        }

        await channel
          .setUserLimit(limit)
          .catch(() => {});

        return interaction.reply({

          content:
            limit === 0
              ? "🎯 ตั้งจำนวนคนเป็น **ไม่จำกัด** เรียบร้อยแล้ว"
              : `🎯 จำกัดจำนวนสมาชิกไว้ที่ **${limit} คน** เรียบร้อยแล้ว`,

          ephemeral: true
        });
      }
    }

  } catch (error) {

    console.error(
      "❌ Interaction Error:",
      error
    );

    // =================================================
    // ป้องกัน Interaction Failed
    // =================================================

    try {

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        await interaction.reply({
          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง",
          ephemeral: true
        });

      } else if (
        interaction.deferred
      ) {

        await interaction.editReply({
          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง"
        });
      }

    } catch (replyError) {

      console.error(
        "❌ Reply Error:",
        replyError
      );
    }
  }
});

// =====================================================
// Login
// =====================================================

client.login(token);
