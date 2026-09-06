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
// =====================================================

const tempChannels = new Map();

// =====================================================
// ฟังก์ชันหา Role ที่มีสิทธิ์ ViewChannel + Connect
// "ในหมวด ZONE"
// =====================================================
//
// สำคัญ:
// ฟังก์ชันนี้อ่าน Permission จาก CATEGORY เท่านั้น
// ไม่ได้แก้ Permission ของห้องกดเข้าห้องนี้
// =====================================================

function getZoneRoles(guild) {
  const category = guild.channels.cache.get(categoryId);

  if (!category) {
    console.log("⚠️ ไม่พบ CATEGORY_ID");
    return [];
  }

  const zoneRoles = [];

  category.permissionOverwrites.cache.forEach(overwrite => {

    // ต้องเป็น Role เท่านั้น
    if (overwrite.type !== 0) return;

    // ไม่เอา @everyone
    if (overwrite.id === guild.id) return;

    const role = guild.roles.cache.get(overwrite.id);

    if (!role) return;

    // ต้องมี Allow ViewChannel และ Connect
    const canView = overwrite.allow.has("ViewChannel");
    const canConnect = overwrite.allow.has("Connect");

    if (canView && canConnect) {
      zoneRoles.push(role.id);
    }
  });

  // ถ้ากำหนด ALLOW_ROLE_ID ไว้
  // ให้รวม Role นี้ด้วย
  if (
    allowRoleId &&
    !zoneRoles.includes(allowRoleId)
  ) {
    zoneRoles.push(allowRoleId);
  }

  return zoneRoles;
}

// =====================================================
// สร้าง Permission สำหรับ "ห้องส่วนตัวที่สร้างใหม่"
// =====================================================

function buildPrivateRoomPermissions(guild, ownerId) {

  const permissions = [

    // =================================================
    // @everyone
    // ห้องส่วนตัวสามารถเข้าได้
    // =================================================

    {
      id: guild.id,
      allow: [
        "ViewChannel",
        "Connect"
      ]
    },

    // =================================================
    // เจ้าของห้อง
    // =================================================

    {
      id: ownerId,
      allow: [
        "ViewChannel",
        "Connect"
      ]
    },

    // =================================================
    // Bot
    // =================================================

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
  // Role ที่มีสิทธิ์ View + Connect ใน Category ZONE
  // =================================================

  const zoneRoles = getZoneRoles(guild);

  for (const roleId of zoneRoles) {

    // ป้องกัน Permission ซ้ำ
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
        "ViewChannel",
        "Connect"
      ]
    });
  }

  return permissions;
}

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

    console.log(
      "🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!"
    );

  } catch (err) {

    console.error(err);

  }

});

// =====================================================
// ระบบสร้างห้องและลบห้องอัตโนมัติ
// =====================================================

client.on(
  "voiceStateUpdate",
  async (oldState, newState) => {

    try {

      // =================================================
      // 1. สมาชิกเข้าห้อง "กดเข้าห้องนี้"
      // =================================================

      if (
        newState.channelId === createChannelId
      ) {

        const guildId =
          newState.guild.id;

        const ownerId =
          newState.member.id;

        // =================================================
        // สร้าง Permission เฉพาะห้องใหม่
        //
        // *** ไม่ได้แก้ Permission ห้อง Trigger ***
        // =================================================

        const permissionOverwrites =
          buildPrivateRoomPermissions(
            newState.guild,
            ownerId
          );

        // =================================================
        // สร้างห้องส่วนตัว
        // =================================================

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

        // =================================================
        // ย้ายคนสร้างเข้าห้อง
        // =================================================

        await newState
          .setChannel(channel)
          .catch(() => {});

        // =================================================
        // บันทึกเจ้าของห้อง
        // =================================================

        tempChannels.set(
          channel.id,
          {
            owner: ownerId
          }
        );

        console.log(
          `🏠 สร้างห้องส่วนตัว: ${channel.name}`
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

        const channel =
          await oldState.guild.channels
            .fetch(oldState.channelId)
            .catch(() => null);

        // =================================================
        // ถ้าไม่มีคนอยู่แล้ว ให้ลบห้อง
        // =================================================

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

  }
);

// =====================================================
// ระบบ Interaction
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
              "🔹 ยศที่มีสิทธิ์ในหมวดโซนสามารถเข้าห้องส่วนตัวได้\n\n" +
              "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
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
        // ปุ่มแถวที่ 1
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
        // ปุ่มแถวที่ 2
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

        // =================================================
        // ตอบคำสั่งแบบ Ephemeral
        // =================================================

        await interaction.reply({

          content:
            "กำลังสร้างแผงควบคุม...",

          ephemeral: true

        });

        await interaction
          .deleteReply()
          .catch(() => {});

        return;
      }

      // =================================================
      // Buttons
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
        // ตรวจสอบห้องชั่วคราว
        // =================================================

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
        // Allow / Deny / Transfer
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
              )

              .setMinValues(1)

              .setMaxValues(1);

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
        // Defer
        // =================================================

        await interaction.deferReply({
          ephemeral: true
        });

        // =================================================
        // LOCK
        // =================================================

        if (
          interaction.customId === "lock"
        ) {

          // -----------------------------------------------
          // @everyone เข้าไม่ได้
          // -----------------------------------------------

          await channel.permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                Connect: false
              }
            )
            .catch(() => {});

          // -----------------------------------------------
          // Role ใน ZONE เข้าไม่ได้
          // -----------------------------------------------

          const zoneRoles =
            getZoneRoles(
              interaction.guild
            );

          for (
            const roleId of zoneRoles
          ) {

            await channel.permissionOverwrites
              .edit(
                roleId,
                {
                  Connect: false
                }
              )
              .catch(() => {});

          }

          // -----------------------------------------------
          // เจ้าของยังเข้าได้
          // -----------------------------------------------

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
              "🔒 ล็อกห้องเรียบร้อยแล้ว"

          });

        }

        // =================================================
        // UNLOCK
        // =================================================

        if (
          interaction.customId === "unlock"
        ) {

          // -----------------------------------------------
          // @everyone เข้าได้
          // -----------------------------------------------

          await channel.permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                ViewChannel: true,
                Connect: true
              }
            )
            .catch(() => {});

          // -----------------------------------------------
          // Role ZONE เข้าได้
          // -----------------------------------------------

          const zoneRoles =
            getZoneRoles(
              interaction.guild
            );

          for (
            const roleId of zoneRoles
          ) {

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

          // -----------------------------------------------
          // เจ้าของ
          // -----------------------------------------------

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
              "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"

          });

        }

        // =================================================
        // HIDE
        // =================================================

        if (
          interaction.customId === "hide"
        ) {

          // -----------------------------------------------
          // ยศใหญ่เดิม
          // -----------------------------------------------

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

          // -----------------------------------------------
          // Permission พื้นฐาน
          // -----------------------------------------------

          const permissions = [

            // @everyone ซ่อน
            {
              id: interaction.guild.id,

              deny: [
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

            },

            // เจ้าของ
            {
              id: data.owner,

              allow: [
                "ViewChannel",
                "Connect"
              ]

            }

          ];

          // -----------------------------------------------
          // Role ZONE
          // -----------------------------------------------

          const zoneRoles =
            getZoneRoles(
              interaction.guild
            );

          for (
            const roleId of zoneRoles
          ) {

            if (
              !permissions.some(
                p => p.id === roleId
              )
            ) {

              permissions.push({

                id: roleId,

                allow: [
                  "ViewChannel",
                  "Connect"
                ]

              });

            }

          }

          // -----------------------------------------------
          // ยศใหญ่
          // -----------------------------------------------

          for (
            const roleId of bigRoleIds
          ) {

            if (
              !permissions.some(
                p => p.id === roleId
              )
            ) {

              permissions.push({

                id: roleId,

                allow: [
                  "ViewChannel"
                ]

              });

            }

          }

          // -----------------------------------------------
          // ตั้ง Permission ใหม่
          // เฉพาะห้องส่วนตัว
          // -----------------------------------------------

          await channel.permissionOverwrites
            .set(permissions)
            .catch(console.error);

          return interaction.editReply({

            content:
              "🙈 ซ่อนเรียบร้อยแล้ว"

          });

        }

        // =================================================
        // SHOW
        // =================================================

        if (
          interaction.customId === "show"
        ) {

          // -----------------------------------------------
          // @everyone
          // -----------------------------------------------

          await channel.permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                ViewChannel: true,
                Connect: true
              }
            )
            .catch(() => {});

          // -----------------------------------------------
          // Role ZONE
          // -----------------------------------------------

          const zoneRoles =
            getZoneRoles(
              interaction.guild
            );

          for (
            const roleId of zoneRoles
          ) {

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

          // -----------------------------------------------
          // เจ้าของ
          // -----------------------------------------------

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
      // User Select Menu
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

        // =================================================
        // ตรวจสอบเจ้าของ
        // =================================================

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
              .catch(() => null);

          if (targetUser) {

            await channel
              .setName(
                `📍・ห้องส่วนตัวของ ${targetUser.username}`
              )
              .catch(() => {});

          }

          // ให้เจ้าของใหม่เข้าได้
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
      // Modal Submit
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

        // =================================================
        // ตรวจสอบเจ้าของ
        // =================================================

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

          // ตรวจสอบจำนวน
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

      // =================================================
      // Error Response
      // =================================================

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

  }
);

// =====================================================
// Login
// =====================================================

client.login(token);
