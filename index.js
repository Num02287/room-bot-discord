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
// WEB SERVER สำหรับ Render / Cloud
// =====================================================
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Web Server is ready.");
});

// =====================================================
// ENVIRONMENT VARIABLES
// =====================================================
const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

// =====================================================
// ยศใหญ่ - สามารถเข้าห้องได้ทุกห้อง
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
// เก็บห้องชั่วคราว
// =====================================================
const tempChannels = new Map();

// =====================================================
// SLASH COMMAND
// =====================================================
const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("ระบบสร้างห้องและแผงควบคุมห้อง")
    .setDMPermission(false)
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

// =====================================================
// READY
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

    console.log("🚀 ติดตั้ง Slash Commands เรียบร้อยแล้ว!");
  } catch (err) {
    console.error("❌ Slash Command Error:", err);
  }
});

// =====================================================
// ฟังก์ชันตรวจสอบสิทธิ์ยศใหญ่
// =====================================================
function hasBigRole(member) {
  if (!member || !member.roles) return false;

  return bigRoleIds.some(roleId =>
    member.roles.cache.has(roleId)
  );
}

// =====================================================
// ฟังก์ชันใส่สิทธิ์ยศใหญ่
// =====================================================
async function applyBigRoles(channel) {
  for (const roleId of bigRoleIds) {
    await channel.permissionOverwrites.edit(roleId, {
      ViewChannel: true,
      Connect: true
    }).catch(() => {});
  }
}

// =====================================================
// สร้าง Permission สำหรับห้องใหม่
// =====================================================
function createRoomPermissions(guildId, ownerId) {

  const permissionOverwrites = [
    {
      id: guildId,
      allow: ["ViewChannel"],
      deny: ["Connect"]
    },

    {
      id: ownerId,
      allow: [
        "ViewChannel",
        "Connect"
      ]
    },

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

  // ยศที่อนุญาตเพิ่มเติม
  if (allowRoleId) {
    permissionOverwrites.push({
      id: allowRoleId,
      allow: [
        "ViewChannel",
        "Connect"
      ]
    });
  }

  // ยศใหญ่ทั้งหมด
  for (const roleId of bigRoleIds) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        "ViewChannel",
        "Connect"
      ]
    });
  }

  return permissionOverwrites;
}

// =====================================================
// VOICE STATE
// =====================================================
client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // =================================================
    // สมาชิกเข้าห้องสร้าง
    // =================================================
    if (newState.channelId === createChannelId) {

      const guildId = newState.guild.id;
      const ownerId = newState.member.id;

      const permissionOverwrites =
        createRoomPermissions(
          guildId,
          ownerId
        );

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

      await newState
        .setChannel(channel)
        .catch(() => {});

      tempChannels.set(
        channel.id,
        {
          owner: ownerId,
          savedPermissions: null
        }
      );

      return;
    }

    // =================================================
    // สมาชิกออกจากห้องชั่วคราว
    // =================================================
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
          await channel.delete()
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
      "❌ Error in voiceStateUpdate:",
      error
    );

  }

});

// =====================================================
// INTERACTION CREATE
// =====================================================
client.on("interactionCreate", async (interaction) => {

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
            "🏠 แผงควบคุมระบบห้อง"
          )

          .setDescription(
            "จัดการห้องส่วนตัวของคุณได้จากปุ่มด้านล่าง\n\n" +
            "🔹 ตั้งชื่อห้อง\n" +
            "🔹 ล็อก / ปลดล็อก\n" +
            "🔹 จำกัดจำนวนสมาชิก\n" +
            "🔹 ซ่อน / แสดงห้อง\n" +
            "🔹 โอนเจ้าของห้อง\n" +
            "🔹 อนุญาต / ไม่อนุญาตสมาชิก"
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
      // แถวที่ 1
      // =================================================
      const row1 =
        new ActionRowBuilder()
          .addComponents(

            new ButtonBuilder()
              .setCustomId("name")
              .setEmoji("✏️")
              .setLabel("ตั้งชื่อห้อง")
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
              .setLabel("ระบุจำนวนสมาชิก")
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId("owner")
              .setEmoji("👑")
              .setLabel("เช็คเจ้าของห้อง")
              .setStyle(ButtonStyle.Secondary)

          );

      // =================================================
      // แถวที่ 2
      // =================================================
      const row2 =
        new ActionRowBuilder()
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
              .setEmoji("🔄")
              .setLabel("โอนห้อง")
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId("allow")
              .setEmoji("🧑‍🤝‍🧑")
              .setLabel("อนุญาตสมาชิก")
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId("deny")
              .setEmoji("🚫")
              .setLabel("ไม่อนุญาตสมาชิก")
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
          "✅ ส่งแผงควบคุมระบบห้องเรียบร้อยแล้วครับ",
        ephemeral: true
      });
    }

    // =================================================
    // BUTTON
    // =================================================
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

      // =================================================
      // OWNER
      // =================================================
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
      // ตรวจเจ้าของ
      // =================================================
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

      // =================================================
      // เปลี่ยนชื่อ
      // =================================================
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
            .setPlaceholder("กรอกชื่อห้องที่ต้องการ")
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
      // จำกัดจำนวนคน
      // =================================================
      if (
        interaction.customId === "limit"
      ) {

        const modal =
          new ModalBuilder()
            .setCustomId("limit_room")
            .setTitle("🎯 ตั้งจำนวนสมาชิก");

        const input =
          new TextInputBuilder()
            .setCustomId("limit_input")
            .setLabel("ใส่จำนวนคน (0 = ไม่จำกัด)")
            .setPlaceholder("0 - 99")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // =================================================
      // ALLOW / DENY / TRANSFER
      // =================================================
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

      // =================================================
      // LOCK
      // =================================================
      if (
        interaction.customId === "lock"
      ) {

        await interaction.deferReply({
          ephemeral: true
        });

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: true,
            Connect: false
          }
        ).catch(() => {});

        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              ViewChannel: true,
              Connect: false
            }
          ).catch(() => {});

        }

        // ยศใหญ่ยังเข้าได้
        await applyBigRoles(channel);

        return interaction.editReply({
          content:
            "🔒 ล็อกห้องเรียบร้อยแล้ว\n\n👑 ยศใหญ่ยังสามารถเข้าห้องได้"
        });

      }

      // =================================================
      // UNLOCK
      // =================================================
      if (
        interaction.customId === "unlock"
      ) {

        await interaction.deferReply({
          ephemeral: true
        });

        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: true,
            Connect: false
          }
        ).catch(() => {});

        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              ViewChannel: true,
              Connect: true
            }
          ).catch(() => {});

        }

        await applyBigRoles(channel);

        return interaction.editReply({
          content:
            "🔓 ปลดล็อกห้องเรียบร้อยแล้วครับ"
        });

      }

      // =================================================
      // HIDE
      // =================================================
      if (
        interaction.customId === "hide"
      ) {

        await interaction.deferReply({
          ephemeral: true
        });

        // บันทึก permission เดิม
        data.savedPermissions =
          channel.permissionOverwrites.cache.map(
            overwrite => ({
              id: overwrite.id,
              allow: overwrite.allow.bitfield.toString(),
              deny: overwrite.deny.bitfield.toString(),
              type: overwrite.type
            })
          );

        // ทุกคนมองไม่เห็น
        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: false,
            Connect: false
          }
        ).catch(() => {});

        // เจ้าของ
        await channel.permissionOverwrites.edit(
          data.owner,
          {
            ViewChannel: true,
            Connect: true
          }
        ).catch(() => {});

        // Bot
        await channel.permissionOverwrites.edit(
          client.user.id,
          {
            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MoveMembers: true
          }
        ).catch(() => {});

        // Role พิเศษ
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              ViewChannel: true,
              Connect: true
            }
          ).catch(() => {});

        }

        // ยศใหญ่
        await applyBigRoles(channel);

        return interaction.editReply({
          content:
            "🙈 ซ่อนห้องเรียบร้อยแล้วครับ\n\n👑 ยศใหญ่ยังสามารถมองเห็นและเข้าห้องได้"
        });

      }

      // =================================================
      // SHOW
      // =================================================
      if (
        interaction.customId === "show"
      ) {

        await interaction.deferReply({
          ephemeral: true
        });

        if (data.savedPermissions) {

          for (
            const permission
            of data.savedPermissions
          ) {

            await channel.permissionOverwrites.edit(
              permission.id,
              {
                allow: BigInt(permission.allow),
                deny: BigInt(permission.deny)
              }
            ).catch(() => {});

          }

        } else {

          await channel.permissionOverwrites.edit(
            interaction.guild.id,
            {
              ViewChannel: true
            }
          ).catch(() => {});

        }

        // ยศใหญ่เข้าได้เสมอ
        await applyBigRoles(channel);

        return interaction.editReply({
          content:
            "👁️ แสดงห้องเรียบร้อยแล้วครับ"
        });

      }
    }

    // =================================================
    // USER SELECT MENU
    // =================================================
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

      // =================================================
      // ALLOW
      // =================================================
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

      // =================================================
      // DENY
      // =================================================
      if (
        interaction.customId === "select_deny"
      ) {

        await channel.permissionOverwrites.edit(
          targetId,
          {
            Connect: false,
            ViewChannel: false
          }
        ).catch(() => {});

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

          await channel.setName(
            `📍・ห้องส่วนตัวของ ${targetUser.username}`
          ).catch(() => {});

        }

        await channel.permissionOverwrites.edit(
          targetId,
          {
            Connect: true,
            ViewChannel: true
          }
        ).catch(() => {});

        // ยศใหญ่ยังเข้าได้
        await applyBigRoles(channel);

        return interaction.reply({
          content:
            `🔄 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้วครับ`,
          ephemeral: true
        });

      }
    }

    // =================================================
    // MODAL
    // =================================================
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

      // =================================================
      // RENAME
      // =================================================
      if (
        interaction.customId === "rename_room"
      ) {

        const name =
          interaction.fields.getTextInputValue(
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
      // LIMIT
      // =================================================
      if (
        interaction.customId === "limit_room"
      ) {

        const limitInput =
          interaction.fields.getTextInputValue(
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
            `🎯 ตั้งจำกัดจำนวนสมาชิกเป็น **${
              limit === 0
                ? "ไม่จำกัด"
                : `${limit} คน`
            }** เรียบร้อยแล้ว`,

          ephemeral: true

        });

      }
    }

  } catch (err) {

    console.error(
      "❌ Interaction Error:",
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

// =====================================================
// LOGIN
// =====================================================
client.login(token);
