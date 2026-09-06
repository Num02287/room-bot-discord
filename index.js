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
// Web Server สำหรับรันบน Cloud เช่น Render
// =====================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(
  process.env.PORT || 3000,
  () => console.log("Web Server is ready.")
);

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

const rest = new REST({
  version: "10"
}).setToken(token);

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

    console.log(
      "🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!"
    );

  } catch (err) {

    console.error(err);

  }

});

// =====================================================
// ฟังก์ชันดึง Role ที่ Category อนุญาต Connect
// =====================================================

function getCategoryAllowedRoles(guild) {

  const category =
    guild.channels.cache.get(categoryId);

  if (!category) {
    return [];
  }

  const roleIds = [];

  category.permissionOverwrites.cache.forEach(
    overwrite => {

      // type 0 = Role
      if (
        overwrite.type === 0 &&
        overwrite.id !== guild.id
      ) {

        if (
          overwrite.allow.has("Connect")
        ) {

          roleIds.push(overwrite.id);

        }

      }

    }
  );

  return roleIds;
}

// =====================================================
// ฟังก์ชันสร้าง Permission ห้องส่วนตัว
// =====================================================

function createRoomPermissions(guild, ownerId) {

  const permissions = [

    // ===============================================
    // @everyone
    // ===============================================

    {
      id: guild.id,

      allow: [
        "ViewChannel"
      ],

      deny: [
        "Connect"
      ]
    },

    // ===============================================
    // เจ้าของห้อง
    // ===============================================

    {
      id: ownerId,

      allow: [
        "ViewChannel",
        "Connect"
      ]
    },

    // ===============================================
    // Bot
    // ===============================================

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

  // ===============================================
  // Role ที่ Category อนุญาต Connect
  // ===============================================

  const allowedRoles =
    getCategoryAllowedRoles(guild);

  allowedRoles.forEach(roleId => {

    // ป้องกันซ้ำ
    if (
      roleId === ownerId ||
      roleId === client.user.id
    ) {
      return;
    }

    permissions.push({

      id: roleId,

      allow: [
        "ViewChannel",
        "Connect"
      ]

    });

  });

  return permissions;
}

// =====================================================
// ระบบสร้างห้องและลบห้องอัตโนมัติ
// =====================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // =================================================
    // 1. สมาชิกเข้าห้องกดเข้าห้องนี้
    // =================================================

    if (
      newState.channelId === createChannelId
    ) {

      const guild =
        newState.guild;

      const ownerId =
        newState.member.id;

      // ===============================================
      // Permission ห้องใหม่
      // ===============================================

      const permissionOverwrites =
        createRoomPermissions(
          guild,
          ownerId
        );

      // ===============================================
      // สร้างห้อง
      // ===============================================

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

      // ===============================================
      // ย้ายคนสร้างเข้าห้อง
      // ===============================================

      await newState
        .setChannel(channel)
        .catch(() => {});

      // ===============================================
      // บันทึกเจ้าของห้อง
      // ===============================================

      tempChannels.set(
        channel.id,
        {
          owner: ownerId
        }
      );

      console.log(
        `🏠 สร้างห้อง ${channel.name} โดย ${newState.member.user.tag}`
      );

      return;
    }

    // =================================================
    // 2. ตรวจสอบห้องชั่วคราวที่สมาชิกออก
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
          .catch(
            () => null
          );

      // ===============================================
      // ถ้าไม่มีคนอยู่
      // ===============================================

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

        console.log(
          `🗑️ ลบห้อง ${oldState.channelId}`
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

      // =================================================
      // ตอบ Interaction ทันที
      // ป้องกัน "กำลังคิด..."
      // =================================================

      await interaction.deferReply({
        ephemeral: true
      });

      // =================================================
      // Embed
      // =================================================

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

          .setColor(
            0x2b2d31
          );

      // =================================================
      // Row 1
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
      // Row 2
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

      // =================================================
      // แก้ข้อความตอบกลับ
      // =================================================

      await interaction.editReply({

        content:
          "✅ สร้างแผงควบคุมเรียบร้อยแล้ว"

      });

      // =================================================
      // ลบข้อความ Ephemeral
      // =================================================

      return interaction.deleteReply();

    }

    // =================================================
    // BUTTONS
    // =================================================

    if (
      interaction.isButton()
    ) {

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
        tempChannels.get(
          channel.id
        );

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
      // ตรวจสอบเจ้าของห้อง
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
      // เปลี่ยนชื่อห้อง
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
      // ตั้งจำนวนคน
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
      // ALLOW / DENY / TRANSFER
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
      // Defer สำหรับปุ่มที่เหลือ
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
          .catch(() => {});

        // ดึง Role จาก Category
        const category =
          interaction.guild.channels.cache.get(
            categoryId
          );

        if (category) {

          category.permissionOverwrites.cache.forEach(
            overwrite => {

              if (
                overwrite.type === 0 &&
                overwrite.id !== interaction.guild.id
              ) {

                if (
                  overwrite.allow.has("Connect")
                ) {

                  channel.permissionOverwrites
                    .edit(
                      overwrite.id,
                      {
                        Connect: false
                      }
                    )
                    .catch(() => {});

                }

              }

            }
          );

        }

        // เจ้าของเข้าได้
        await channel.permissionOverwrites
          .edit(
            data.owner,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(() => {});

        // Bot เข้าได้
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
            "🔒 ล็อกห้องเรียบร้อยแล้ว\n" +
            "👑 ขณะนี้มีเพียงเจ้าของห้องเท่านั้นที่สามารถเข้าได้"

        });

      }

      // =================================================
      // 🔓 UNLOCK
      // =================================================

      if (
        interaction.customId === "unlock"
      ) {

        // @everyone ยังเข้าไม่ได้
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: false
            }
          )
          .catch(() => {});

        // ดึง Role จาก Category
        const category =
          interaction.guild.channels.cache.get(
            categoryId
          );

        if (category) {

          category.permissionOverwrites.cache.forEach(
            overwrite => {

              if (
                overwrite.type === 0 &&
                overwrite.id !== interaction.guild.id
              ) {

                if (
                  overwrite.allow.has("Connect")
                ) {

                  channel.permissionOverwrites
                    .edit(
                      overwrite.id,
                      {
                        ViewChannel: true,
                        Connect: true
                      }
                    )
                    .catch(() => {});

                }

              }

            }
          );

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

        // Bot
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
            "🔓 ปลดล็อกห้องเรียบร้อยแล้ว\n" +
            "👥 ยศที่ได้รับอนุญาตจากหมวดสามารถเข้าห้องได้แล้ว"

        });

      }

      // =================================================
      // 🙈 HIDE
      // =================================================

      if (
        interaction.customId === "hide"
      ) {

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

          // @everyone
          {
            id:
              interaction.guild.id,

            deny:
              [
                "ViewChannel",
                "Connect"
              ]
          },

          // Bot
          {
            id:
              client.user.id,

            allow:
              [
                "ViewChannel",
                "Connect",
                "ManageChannels",
                "MoveMembers"
              ]
          },

          // เจ้าของ
          {
            id:
              data.owner,

            allow:
              [
                "ViewChannel",
                "Connect"
              ]
          }

        ];

        // Role ใหญ่
        bigRoleIds.forEach(
          roleId => {

            permissions.push({

              id:
                roleId,

              allow:
                [
                  "ViewChannel"
                ]

            });

          }
        );

        await channel.permissionOverwrites
          .set(
            permissions
          )
          .catch(
            console.error
          );

        return interaction.editReply({

          content:
            "🙈 ซ่อนเรียบร้อยแล้ว"

        });

      }

      // =================================================
      // 👁 SHOW
      // =================================================

      if (
        interaction.customId === "show"
      ) {

        // @everyone เห็นแต่เข้าไม่ได้
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: false
            }
          )
          .catch(() => {});

        // ดึง Role จาก Category
        const category =
          interaction.guild.channels.cache.get(
            categoryId
          );

        if (category) {

          category.permissionOverwrites.cache.forEach(
            overwrite => {

              if (
                overwrite.type === 0 &&
                overwrite.id !== interaction.guild.id
              ) {

                if (
                  overwrite.allow.has("Connect")
                ) {

                  channel.permissionOverwrites
                    .edit(
                      overwrite.id,
                      {
                        ViewChannel: true,
                        Connect: true
                      }
                    )
                    .catch(() => {});

                }

              }

            }
          );

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

        // Bot
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
            "👁️ แสดงห้องเรียบร้อยแล้ว"

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
      // TRANSFER
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
            .catch(
              () => null
            );

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
    // MODAL SUBMIT
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
            name
          )
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
