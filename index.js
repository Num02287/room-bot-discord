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

// =====================================================
// Web Server สำหรับรันบน Cloud เช่น Render
// =====================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web Server is ready.");
});

// =====================================================
// Environment Variables
// =====================================================

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

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
// channelId => { owner: userId }
// =====================================================

const tempChannels = new Map();

// =====================================================
// Slash Commands
// =====================================================

const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("ระบบสร้างห้อง")
    .setDMPermission(false)
].map(c => c.toJSON());

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

    console.log("🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!");
  } catch (err) {
    console.error(err);
  }
});

// =====================================================
// ฟังก์ชันดึง Role ที่มีสิทธิ์อยู่ในหมวด ZONE
// =====================================================

function getCategoryAllowedRoles(guild) {
  const category = guild.channels.cache.get(categoryId);

  if (!category) {
    return [];
  }

  const roles = [];

  // Permission Overwrites ของหมวด
  category.permissionOverwrites.cache.forEach(overwrite => {

    // 0 = Role
    // 1 = Member
    if (overwrite.type !== 0) return;

    // ไม่เอา @everyone
    if (overwrite.id === guild.id) return;

    const role = guild.roles.cache.get(overwrite.id);

    if (!role) return;

    // ถ้ามีการ Allow ViewChannel หรือ Connect
    const canView = overwrite.allow.has(
      PermissionFlagsBits.ViewChannel
    );

    const canConnect = overwrite.allow.has(
      PermissionFlagsBits.Connect
    );

    if (canView || canConnect) {
      roles.push(role.id);
    }
  });

  // ถ้ามี ALLOW_ROLE_ID ให้รวมด้วย
  if (allowRoleId && !roles.includes(allowRoleId)) {
    roles.push(allowRoleId);
  }

  return roles;
}

// =====================================================
// สร้าง Permission สำหรับห้องส่วนตัว
// =====================================================

function buildRoomPermissions(guild, ownerId) {

  const permissions = [
    // @everyone
    {
      id: guild.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect
      ]
    },

    // เจ้าของห้อง
    {
      id: ownerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect
      ]
    },

    // Bot
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

  // ===================================================
  // เพิ่มยศที่มีสิทธิ์อยู่ในหมวด ZONE
  // ===================================================

  const categoryRoles = getCategoryAllowedRoles(guild);

  for (const roleId of categoryRoles) {

    // กันซ้ำ
    if (
      roleId === guild.id ||
      roleId === ownerId ||
      roleId === client.user.id
    ) {
      continue;
    }

    permissions.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect
      ]
    });
  }

  return permissions;
}

// =====================================================
// ระบบสร้างห้องและลบห้องอัตโนมัติ
// =====================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // =================================================
    // 1. สมาชิกเข้าห้อง "กดเข้าห้องนี้"
    // =================================================

    if (newState.channelId === createChannelId) {

      const guildId = newState.guild.id;
      const ownerId = newState.member.id;

      // -----------------------------------------------
      // สร้าง Permission ห้องส่วนตัว
      // -----------------------------------------------

      const permissionOverwrites =
        buildRoomPermissions(
          newState.guild,
          ownerId
        );

      // -----------------------------------------------
      // สร้างห้อง
      // -----------------------------------------------

      const channel = await newState.guild.channels.create({
        name: `ห้องส่วนตัวของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: permissionOverwrites
      });

      // -----------------------------------------------
      // ย้ายคนเข้าห้อง
      // -----------------------------------------------

      await newState.setChannel(channel).catch(() => {});

      // -----------------------------------------------
      // บันทึกเจ้าของห้อง
      // -----------------------------------------------

      tempChannels.set(channel.id, {
        owner: ownerId
      });

      console.log(
        `🏠 สร้างห้อง ${channel.name} | เจ้าของ: ${newState.member.user.username}`
      );

      return;
    }

    // =================================================
    // 2. สมาชิกออกจากห้องชั่วคราว
    // =================================================

    if (
      oldState.channelId &&
      tempChannels.has(oldState.channelId)
    ) {

      const channel = await oldState.guild.channels
        .fetch(oldState.channelId)
        .catch(() => null);

      // -----------------------------------------------
      // ถ้าไม่มีคนอยู่ในห้องแล้ว
      // ให้ลบห้อง
      // -----------------------------------------------

      if (!channel || channel.members.size === 0) {

        if (channel) {
          await channel.delete().catch(() => {});
        }

        tempChannels.delete(oldState.channelId);

        console.log(
          `🗑️ ลบห้องชั่วคราว ${oldState.channelId}`
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

// =====================================================
// ระบบ Interaction
// =====================================================

client.on("interactionCreate", async (interaction) => {

  try {

    // =================================================
    // 1. /room
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
          "🔹 สมาชิกที่มียศในหมวดโซนสามารถเข้าห้องส่วนตัวได้\n\n" +
          "📌 เจ้าของห้องสามารถล็อกหรือปลดล็อกห้องได้"
        )
        .setImage(
          "https://i.ibb.co/Kjbw5BGb/image.png"
        )
        .setFooter({
          text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        })
        .setColor(0x2b2d31);

      // =================================================
      // ปุ่มแถวที่ 1
      // =================================================

      const row1 = new ActionRowBuilder()
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

      // =================================================
      // ปุ่มแถวที่ 2
      // =================================================

      const row2 = new ActionRowBuilder()
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

      // =================================================
      // ส่งแผงควบคุมลงช่อง
      // =================================================

      await interaction.channel.send({
        embeds: [embed],
        components: [row1, row2]
      });

      // ตอบแบบเงียบ
      await interaction.reply({
        content: "กำลังสร้างแผงควบคุม...",
        ephemeral: true
      });

      await interaction.deleteReply().catch(() => {});

      return;
    }

    // =================================================
    // 2. Buttons
    // =================================================

    if (interaction.isButton()) {

      const member = interaction.member;
      const channel = member.voice.channel;

      // ต้องอยู่ใน Voice
      if (!channel) {

        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",
          ephemeral: true
        });

      }

      // ตรวจสอบว่าเป็นห้องชั่วคราวหรือไม่
      const data = tempChannels.get(channel.id);

      // =================================================
      // ปุ่ม OWNER
      // =================================================

      if (interaction.customId === "owner") {

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
              .setTitle("👑 เจ้าของห้อง")
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

      // =================================================
      // ตรวจสอบเจ้าของ
      // =================================================

      if (!data || data.owner !== member.id) {

        return interaction.reply({
          content:
            "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ ไม่สามารถสั่งการได้",
          ephemeral: true
        });

      }

      // =================================================
      // เปลี่ยนชื่อ
      // =================================================

      if (interaction.customId === "name") {

        const modal = new ModalBuilder()
          .setCustomId("rename_room")
          .setTitle("เปลี่ยนชื่อห้อง");

        const input = new TextInputBuilder()
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

      // =================================================
      // ตั้งจำนวนคน
      // =================================================

      if (interaction.customId === "limit") {

        const modal = new ModalBuilder()
          .setCustomId("limit_room")
          .setTitle("ตั้งจำนวนคน");

        const input = new TextInputBuilder()
          .setCustomId("limit_input")
          .setLabel("ใส่จำนวนคน (0 = ไม่จำกัด)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // =================================================
      // Allow / Deny / Transfer
      // =================================================

      if (
        ["allow", "deny", "transfer"]
          .includes(interaction.customId)
      ) {

        const menu =
          new UserSelectMenuBuilder()
            .setCustomId(
              `select_${interaction.customId}`
            )
            .setPlaceholder(
              "เลือกสมาชิกที่ต้องการ..."
            )
            .setMinValues(1)
            .setMaxValues(1);

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

      // =================================================
      // Defer
      // =================================================

      await interaction.deferReply({
        ephemeral: true
      });

      // =================================================
      // LOCK
      // =================================================

      if (interaction.customId === "lock") {

        // ปิด @everyone
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: false
            }
          )
          .catch(() => {});

        // ปิดยศในหมวด ZONE
        const categoryRoles =
          getCategoryAllowedRoles(
            interaction.guild
          );

        for (const roleId of categoryRoles) {

          await channel.permissionOverwrites
            .edit(
              roleId,
              {
                Connect: false
              }
            )
            .catch(() => {});

        }

        // เจ้าของยังเข้าได้
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
            "🔒 ล็อกห้องเรียบร้อยแล้ว\n" +
            "❌ @everyone และยศในหมวด ZONE ไม่สามารถเข้าห้องได้"
        });

      }

      // =================================================
      // UNLOCK
      // =================================================

      if (interaction.customId === "unlock") {

        // @everyone เข้าได้
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(() => {});

        // ยศในหมวด ZONE เข้าได้
        const categoryRoles =
          getCategoryAllowedRoles(
            interaction.guild
          );

        for (const roleId of categoryRoles) {

          await channel.permissionOverwrites
            .edit(
              roleId,
              {
                ViewChannel: true,
                Connect: true
              }
            )
            .catch(() => {});

        }

        // เจ้าของ
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
            "🔓 ปลดล็อกห้องเรียบร้อยแล้ว\n" +
            "✅ @everyone และยศในหมวด ZONE สามารถเข้าห้องได้"
        });

      }

      // =================================================
      // HIDE
      // =================================================

      if (interaction.customId === "hide") {

        // รายชื่อยศใหญ่ที่ต้องการให้มองเห็นห้อง
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

        const permissions = [

          // ซ่อนจาก @everyone
          {
            id: interaction.guild.id,
            deny: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect
            ]
          },

          // Bot
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers
            ]
          },

          // เจ้าของ
          {
            id: data.owner,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect
            ]
          }

        ];

        // -----------------------------------------------
        // ยศในหมวด ZONE
        // -----------------------------------------------

        const categoryRoles =
          getCategoryAllowedRoles(
            interaction.guild
          );

        for (const roleId of categoryRoles) {

          if (
            !permissions.some(
              p => p.id === roleId
            )
          ) {

            permissions.push({
              id: roleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect
              ]
            });

          }

        }

        // -----------------------------------------------
        // ยศใหญ่
        // -----------------------------------------------

        for (const roleId of bigRoleIds) {

          if (
            !permissions.some(
              p => p.id === roleId
            )
          ) {

            permissions.push({
              id: roleId,
              allow: [
                PermissionFlagsBits.ViewChannel
              ]
            });

          }

        }

        await channel.permissionOverwrites
          .set(permissions)
          .catch(console.error);

        return interaction.editReply({
          content:
            "🙈 ซ่อนห้องเรียบร้อยแล้ว"
        });

      }

      // =================================================
      // SHOW
      // =================================================

      if (interaction.customId === "show") {

        // @everyone กลับมาเห็นและเข้าได้
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(() => {});

        // ยศในหมวด ZONE
        const categoryRoles =
          getCategoryAllowedRoles(
            interaction.guild
          );

        for (const roleId of categoryRoles) {

          await channel.permissionOverwrites
            .edit(
              roleId,
              {
                ViewChannel: true,
                Connect: true
              }
            )
            .catch(() => {});

        }

        // เจ้าของ
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
            "👁️ แสดงห้องเรียบร้อยแล้ว"
        });

      }

    }

    // =================================================
    // 3. User Select Menu
    // =================================================

    if (interaction.isUserSelectMenu()) {

      const channel =
        interaction.member.voice.channel;

      const data =
        tempChannels.get(channel?.id);

      // ตรวจสอบเจ้าของ
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

      // =================================================
      // DENY
      // =================================================

      if (
        interaction.customId === "select_deny"
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
          channel.members.get(targetId);

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
      // TRANSFER
      // =================================================

      if (
        interaction.customId === "select_transfer"
      ) {

        data.owner = targetId;

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

    // =================================================
    // 4. Modal Submit
    // =================================================

    if (interaction.isModalSubmit()) {

      const channel =
        interaction.member.voice.channel;

      const data =
        tempChannels.get(channel?.id);

      // ตรวจสอบเจ้าของ
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
            .getTextInputValue("room_name");

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
            .getTextInputValue("limit_input");

        const limit =
          parseInt(limitInput);

        // ตรวจสอบ
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

        const finalLimit =
          limit === 0 ? 0 : limit;

        await channel
          .setUserLimit(finalLimit)
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

});

// =====================================================
// Login
// =====================================================

client.login(token);
