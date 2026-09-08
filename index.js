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
// WEB SERVER
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
// ยศใหญ่ - เข้าได้ทุกห้อง
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
// เก็บข้อมูลห้องชั่วคราว
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
].map(command => command.toJSON());

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
      "🚀 ติดตั้ง Slash Command /room เรียบร้อยแล้ว!"
    );

  } catch (error) {

    console.error(
      "❌ Slash Command Error:",
      error
    );

  }

});

// =====================================================
// ฟังก์ชันใส่สิทธิ์ยศใหญ่
// =====================================================

async function applyBigRoles(channel) {

  for (const roleId of bigRoleIds) {

    await channel.permissionOverwrites
      .edit(roleId, {
        ViewChannel: true,
        Connect: true
      })
      .catch(() => {});

  }

}

// =====================================================
// สร้าง Permission ห้อง
// =====================================================

function createRoomPermissions(
  guildId,
  ownerId
) {

  const permissions = [

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

  // Role ที่กำหนดเพิ่มเติม
  if (allowRoleId) {

    permissions.push({
      id: allowRoleId,
      allow: [
        "ViewChannel",
        "Connect"
      ]
    });

  }

  // ยศใหญ่
  for (const roleId of bigRoleIds) {

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
// VOICE STATE UPDATE
// =====================================================

client.on(
  "voiceStateUpdate",
  async (oldState, newState) => {

    try {

      // =================================================
      // สร้างห้องเมื่อเข้าห้องสร้าง
      // =================================================

      if (
        newState.channelId === createChannelId
      ) {

        const guildId =
          newState.guild.id;

        const ownerId =
          newState.member.id;

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

        console.log(
          `🏠 สร้างห้อง ${channel.name}`
        );

        return;
      }

      // =================================================
      // ลบห้องเมื่อไม่มีสมาชิก
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

            await channel
              .delete()
              .catch(() => {});

          }

          tempChannels.delete(
            oldState.channelId
          );

          console.log(
            "🗑️ ลบห้องชั่วคราวแล้ว"
          );

        }

      }

    } catch (error) {

      console.error(
        "❌ VoiceState Error:",
        error
      );

    }

  }
);

// =====================================================
// INTERACTION CREATE
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
              "🏠 แผงควบคุมระบบห้อง"
            )

            .setDescription(
              "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
            )

            .setImage(
              "https://i.ibb.co/Kjbw5BGb/image.png"
            )

            .setFooter({
              text:
                "ระบบจัดการห้องส่วนตัว"
            })

            .setColor(
              0x2b2d31
            );

        // =================================================
        // แถวที่ 1
        // เฉพาะ Emoji
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
        // แถวที่ 2
        // เฉพาะ Emoji
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
                .setEmoji("🔄")
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

        await interaction.channel.send({

          embeds: [
            embed
          ],

          components: [
            row1,
            row2
          ]

        });

        return interaction.reply({

          content:
            "✅ สร้างแผงควบคุมเรียบร้อยแล้ว",

          ephemeral: true

        });

      }

      // =================================================
      // BUTTON
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
              "❌ คุณต้องอยู่ในห้องเสียงก่อน",

            ephemeral: true

          });

        }

        const data =
          tempChannels.get(
            channel.id
          );

        // =================================================
        // เช็คเจ้าของ
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
        // ตรวจสอบเจ้าของ
        // =================================================

        if (
          !data ||
          data.owner !== member.id
        ) {

          return interaction.reply({

            content:
              "❌ คุณไม่ใช่เจ้าของห้องนี้",

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
              .addComponents(input)

          );

          return interaction.showModal(
            modal
          );

        }

        // =================================================
        // จำกัดจำนวนคน
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
                "ตั้งจำนวนสมาชิก"
              );

          const input =
            new TextInputBuilder()
              .setCustomId(
                "limit_input"
              )
              .setLabel(
                "จำนวนคน 0 - 99"
              )
              .setPlaceholder(
                "0 = ไม่จำกัด"
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

        // =================================================
        // USER SELECT
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
              "🎯 โปรดเลือกสมาชิก",

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

          // ยศใหญ่ยังเข้าได้
          await applyBigRoles(
            channel
          );

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

          await interaction.deferReply({
            ephemeral: true
          });

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

          await applyBigRoles(
            channel
          );

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

          await interaction.deferReply({
            ephemeral: true
          });

          // บันทึก Permission
          data.savedPermissions =
            channel.permissionOverwrites.cache.map(
              overwrite => ({
                id: overwrite.id,
                allow:
                  overwrite.allow.bitfield.toString(),
                deny:
                  overwrite.deny.bitfield.toString()
              })
            );

          // ซ่อนจากทุกคน
          await channel.permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                ViewChannel: false,
                Connect: false
              }
            )
            .catch(() => {});

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

          // Role พิเศษ
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

          // ยศใหญ่
          await applyBigRoles(
            channel
          );

          return interaction.editReply({

            content:
              "🙈 ซ่อนห้องเรียบร้อยแล้ว"

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

          if (
            data.savedPermissions
          ) {

            for (
              const permission
              of data.savedPermissions
            ) {

              await channel.permissionOverwrites
                .edit(
                  permission.id,
                  {
                    allow:
                      BigInt(
                        permission.allow
                      ),
                    deny:
                      BigInt(
                        permission.deny
                      )
                  }
                )
                .catch(() => {});

            }

          } else {

            await channel.permissionOverwrites
              .edit(
                interaction.guild.id,
                {
                  ViewChannel: true
                }
              )
              .catch(() => {});

          }

          // ยศใหญ่
          await applyBigRoles(
            channel
          );

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
          data.owner !==
            interaction.member.id
        ) {

          return interaction.reply({

            content:
              "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของ",

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
              `✅ อนุญาตให้ <@${targetId}> เข้าห้องได้แล้ว`,

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
                Connect: false,
                ViewChannel: false
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
              `🚫 ไม่อนุญาต <@${targetId}> เข้าห้องแล้ว`,

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

          await channel.permissionOverwrites
            .edit(
              targetId,
              {
                Connect: true,
                ViewChannel: true
              }
            )
            .catch(() => {});

          // ยศใหญ่
          await applyBigRoles(
            channel
          );

          return interaction.reply({

            content:
              `🔄 โอนเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้ว`,

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
          data.owner !==
            interaction.member.id
        ) {

          return interaction.reply({

            content:
              "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของ",

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
                "❌ โปรดใส่จำนวน 0 - 99",

              ephemeral: true

            });

          }

          await channel
            .setUserLimit(limit)
            .catch(() => {});

          return interaction.reply({

            content:
              `🎯 ตั้งจำนวนสมาชิกเป็น **${
                limit === 0
                  ? "ไม่จำกัด"
                  : limit + " คน"
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

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        await interaction.reply({

          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผล",

          ephemeral: true

        }).catch(() => {});

      } else if (
        interaction.deferred
      ) {

        await interaction.editReply({

          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผล"

        }).catch(() => {});

      }

    }

  }
);

// =====================================================
// LOGIN
// =====================================================

client.login(token);
