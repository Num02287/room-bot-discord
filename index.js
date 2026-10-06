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
  console.log("🌐 Web Server is ready.");
});

// ======================================================
// 🔐 Environment Variables
// ======================================================

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;

// ======================================================
// 🧑‍🤝‍🧑 ยศที่อนุญาต
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
// 🏠 ข้อมูลห้องชั่วคราว
// ======================================================

const tempChannels = new Map();

// ======================================================
// 💾 จำชื่อห้อง
// ======================================================

const savedRoomNames = new Map();

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
// 🛠️ อ่าน Error
// ======================================================

function getErrorMessage(error) {
  return (
    error?.rawError?.message ||
    error?.message ||
    "ไม่ทราบสาเหตุ"
  );
}

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
      "🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว"
    );

  } catch (error) {

    console.error(
      "❌ Slash Command Error:",
      error
    );

  }

});

// ======================================================
// 🎤 ระบบสร้างห้องเสียง
// ======================================================

client.on(
  "voiceStateUpdate",
  async (oldState, newState) => {

    try {

      // ==================================================
      // สมาชิกเข้าห้องสร้างห้อง
      // ==================================================

      if (
        newState.channelId === createChannelId
      ) {

        const guildId =
          newState.guild.id;

        const ownerId =
          newState.member.id;

        // ==================================================
        // 🔐 Permission เริ่มต้น
        // ==================================================

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

        // ==================================================
        // 👑 ยศใหญ่
        // ==================================================

        for (
          const roleId of bigRoleIds
        ) {

          permissionOverwrites.push({

            id: roleId,

            allow: [
              "ViewChannel",
              "Connect"
            ]

          });

        }

        // ==================================================
        // 🧑‍🤝‍🧑 ยศจาก Render
        // ==================================================

        for (
          const roleId of allowRoleIds
        ) {

          permissionOverwrites.push({

            id: roleId,

            allow: [
              "ViewChannel",
              "Connect"
            ]

          });

        }

        // ==================================================
        // 💾 ชื่อเดิม
        // ==================================================

        const savedName =
          savedRoomNames.get(ownerId);

        const defaultName =
          `ห้องส่วนตัวของ ${newState.member.user.username}`;

        const roomName =
          savedName || defaultName;

        // ==================================================
        // 🏠 สร้างห้อง
        // ==================================================

        const channel =
          await newState.guild.channels.create({

            name: roomName,

            type: ChannelType.GuildVoice,

            parent: categoryId,

            permissionOverwrites

          });

        // ==================================================
        // 🚶 ย้ายสมาชิกเข้าห้อง
        // ==================================================

        await newState
          .setChannel(channel)
          .catch(() => {});

        // ==================================================
        // 💾 บันทึกห้อง
        // ==================================================

        tempChannels.set(
          channel.id,
          {
            owner: ownerId,
            savedPermissions: null
          }
        );

        console.log(
          `🏠 สร้างห้อง "${roomName}" ให้ ${newState.member.user.username}`
        );

        return;
      }

      // ==================================================
      // 🗑️ ลบห้องเมื่อไม่มีสมาชิก
      // ==================================================

      if (
        oldState.channelId &&
        tempChannels.has(oldState.channelId)
      ) {

        const channel =
          oldState.guild.channels.cache.get(
            oldState.channelId
          ) ||
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
            `🗑️ ลบห้อง ${oldState.channelId} เนื่องจากไม่มีสมาชิก`
          );

        }

      }

    } catch (error) {

      console.error(
        "❌ Error in voiceStateUpdate:",
        error
      );

    }

  }
);

// ======================================================
// 🎛️ Interaction
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

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
              "🔹 **หมายเหตุ:** สมาชิกที่มียศพิเศษจะสามารถเข้าห้องนี้ได้ทันที"
            )

            .setImage(
              "https://i.ibb.co/Kjbw5BGb/image.png"
            )

            .setFooter({
              text:
                "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
            })

            .setColor(0x2b2d31);

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
      // 2. Button
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
        // ตรวจสอบห้อง
        // ==================================================

        const data =
          tempChannels.get(
            channel.id
          );

        // ==================================================
        // 👑 OWNER
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
        // ✏️ RENAME
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

              .setPlaceholder(
                "กรุณาระบุชื่อห้อง"
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

        // ==================================================
        // 🎯 LIMIT
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

        // ==================================================
        // ⚡ Defer ทันที
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

          try {

            const promises = [];

            // @everyone
            promises.push(
              channel.permissionOverwrites.edit(
                interaction.guild.id,
                {
                  ViewChannel: true,
                  Connect: false
                }
              )
            );

            // ยศใหญ่
            for (
              const roleId of bigRoleIds
            ) {

              promises.push(

                channel.permissionOverwrites.edit(
                  roleId,
                  {
                    ViewChannel: true,
                    Connect: false
                  }
                ).catch(() => {})

              );

            }

            // ยศจาก Render
            for (
              const roleId of allowRoleIds
            ) {

              promises.push(

                channel.permissionOverwrites.edit(
                  roleId,
                  {
                    ViewChannel: true,
                    Connect: false
                  }
                ).catch(() => {})

              );

            }

            // สมาชิกที่เคย Allow
            for (
              const [id, overwrite]
              of channel.permissionOverwrites.cache
            ) {

              if (
                id === interaction.guild.id ||
                id === client.user.id ||
                id === data.owner
              ) {
                continue;
              }

              if (
                overwrite.type === 1
              ) {

                promises.push(

                  channel.permissionOverwrites.edit(
                    id,
                    {
                      Connect: false
                    }
                  ).catch(() => {})

                );

              }

            }

            await Promise.all(promises);

            return interaction.editReply({

              content:
                "🔒 ล็อกห้องเรียบร้อยแล้ว"

            });

          } catch (error) {

            console.error(
              "Lock Error:",
              error
            );

            return interaction.editReply({

              content:
                `❌ ไม่สามารถล็อกห้องได้\n${getErrorMessage(error)}`

            });

          }

        }

        // ==================================================
        // 🔓 UNLOCK
        // ==================================================

        if (
          interaction.customId === "unlock"
        ) {

          try {

            const promises = [];

            // @everyone
            promises.push(

              channel.permissionOverwrites.edit(
                interaction.guild.id,
                {
                  ViewChannel: true,
                  Connect: false
                }
              )

            );

            // ยศใหญ่
            for (
              const roleId of bigRoleIds
            ) {

              promises.push(

                channel.permissionOverwrites.edit(
                  roleId,
                  {
                    ViewChannel: true,
                    Connect: true
                  }
                ).catch(() => {})

              );

            }

            // ยศจาก Render
            for (
              const roleId of allowRoleIds
            ) {

              promises.push(

                channel.permissionOverwrites.edit(
                  roleId,
                  {
                    ViewChannel: true,
                    Connect: true
                  }
                ).catch(() => {})

              );

            }

            // เจ้าของ
            promises.push(

              channel.permissionOverwrites.edit(
                data.owner,
                {
                  ViewChannel: true,
                  Connect: true
                }
              )

            );

            // Bot
            promises.push(

              channel.permissionOverwrites.edit(
                client.user.id,
                {
                  ViewChannel: true,
                  Connect: true,
                  ManageChannels: true,
                  MoveMembers: true
                }
              )

            );

            // สมาชิกที่เคย Allow
            for (
              const [id, overwrite]
              of channel.permissionOverwrites.cache
            ) {

              if (
                id === interaction.guild.id ||
                id === client.user.id ||
                id === data.owner
              ) {
                continue;
              }

              if (
                overwrite.type === 1
              ) {

                promises.push(

                  channel.permissionOverwrites.edit(
                    id,
                    {
                      ViewChannel: true,
                      Connect: true
                    }
                  ).catch(() => {})

                );

              }

            }

            await Promise.all(promises);

            return interaction.editReply({

              content:
                "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"

            });

          } catch (error) {

            console.error(
              "Unlock Error:",
              error
            );

            return interaction.editReply({

              content:
                `❌ ไม่สามารถปลดล็อกห้องได้\n${getErrorMessage(error)}`

            });

          }

        }

        // ==================================================
        // 🙈 HIDE
        // ==================================================

        if (
          interaction.customId === "hide"
        ) {

          try {

            // บันทึก Permission เดิม
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

            await channel.permissionOverwrites.set(
              permissions
            );

            return interaction.editReply({

              content:
                "🙈 ซ่อนห้องเรียบร้อยแล้ว"

            });

          } catch (error) {

            console.error(
              "Hide Error:",
              error
            );

            return interaction.editReply({

              content:
                `❌ ไม่สามารถซ่อนห้องได้\n${getErrorMessage(error)}`

            });

          }

        }

        // ==================================================
        // 👁️ SHOW
        // ==================================================

        if (
          interaction.customId === "show"
        ) {

          try {

            if (
              data.savedPermissions
            ) {

              await channel.permissionOverwrites.set(

                data.savedPermissions.map(
                  permission => ({

                    id:
                      permission.id,

                    type:
                      permission.type,

                    allow:
                      BigInt(permission.allow),

                    deny:
                      BigInt(permission.deny)

                  })
                )

              );

              delete data.savedPermissions;

            } else {

              await channel.permissionOverwrites.edit(

                interaction.guild.id,

                {
                  ViewChannel: true
                }

              );

            }

            return interaction.editReply({

              content:
                "👁️ แสดงห้องเรียบร้อยแล้ว"

            });

          } catch (error) {

            console.error(
              "Show Error:",
              error
            );

            return interaction.editReply({

              content:
                `❌ ไม่สามารถแสดงห้องได้\n${getErrorMessage(error)}`

            });

          }

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

          try {

            await interaction.reply({

              content:
                `⏳ กำลังอนุญาต <@${targetId}>...`,

              ephemeral: true

            });

            await channel.permissionOverwrites.edit(

              targetId,

              {
                ViewChannel: true,
                Connect: true
              }

            );

            return interaction.editReply({

              content:
                `✅ อนุญาตให้ <@${targetId}> มองเห็นและเข้าห้องได้แล้ว`

            });

          } catch (error) {

            console.error(
              "Allow Error:",
              error
            );

            if (
              interaction.replied
            ) {

              return interaction.editReply({

                content:
                  `❌ ไม่สามารถอนุญาตสมาชิกได้\n${getErrorMessage(error)}`

              });

            }

          }

        }

        // ==================================================
        // 🚫 DENY
        // ==================================================

        if (
          interaction.customId === "select_deny"
        ) {

          try {

            await interaction.reply({

              content:
                `⏳ กำลังบล็อก <@${targetId}>...`,

              ephemeral: true

            });

            const targetMember =
              channel.members.get(
                targetId
              );

            // ทำ Permission และ Disconnect พร้อมกัน
            await Promise.all([

              channel.permissionOverwrites.edit(

                targetId,

                {
                  Connect: false
                }

              ),

              targetMember
                ? targetMember.voice
                    .disconnect()
                    .catch(() => {})
                : Promise.resolve()

            ]);

            return interaction.editReply({

              content:
                `🚫 บล็อก <@${targetId}> ไม่ให้เข้าห้องเรียบร้อยแล้ว`

            });

          } catch (error) {

            console.error(
              "Deny Error:",
              error
            );

            if (
              interaction.replied
            ) {

              return interaction.editReply({

                content:
                  `❌ ไม่สามารถบล็อกสมาชิกได้\n${getErrorMessage(error)}`

              });

            }

          }

        }

        // ==================================================
        // 🔁 TRANSFER OWNER
        // ==================================================

        if (
          interaction.customId === "select_transfer"
        ) {

          // ป้องกันโอนให้ตัวเอง
          if (
            targetId === interaction.member.id
          ) {

            return interaction.reply({

              content:
                "❌ ไม่สามารถโอนห้องให้ตัวเองได้",

              ephemeral: true

            });

          }

          const oldOwnerId =
            data.owner;

          const currentRoomName =
            channel.name;

          try {

            // ==================================================
            // ดึงสมาชิกเป้าหมายก่อน
            // ==================================================

            const targetMember =
              await interaction.guild.members
                .fetch(targetId)
                .catch(() => null);

            if (!targetMember) {

              return interaction.reply({

                content:
                  "❌ ไม่พบสมาชิกที่ต้องการโอนห้อง",

                ephemeral: true

              });

            }

            // ==================================================
            // เปลี่ยนเจ้าของใน Memory ก่อน
            // ==================================================

            data.owner =
              targetId;

            // ==================================================
            // จำชื่อห้องให้เจ้าของใหม่
            // ==================================================

            savedRoomNames.set(
              targetId,
              currentRoomName
            );

            savedRoomNames.delete(
              oldOwnerId
            );

            // ==================================================
            // Permission พร้อมกัน
            // ==================================================

            await Promise.all([

              // เจ้าของใหม่
              channel.permissionOverwrites.edit(
                targetId,
                {
                  ViewChannel: true,
                  Connect: true
                }
              ),

              // เจ้าของเดิม
              channel.permissionOverwrites.edit(
                oldOwnerId,
                {
                  ViewChannel: false,
                  Connect: false
                }
              )

            ]);

            // ==================================================
            // ย้ายเจ้าของเดิมออก + ย้ายเจ้าของใหม่เข้า
            // พร้อมกัน
            // ==================================================

            const oldOwnerMember =
              channel.members.get(
                oldOwnerId
              );

            await Promise.all([

              oldOwnerMember
                ? oldOwnerMember.voice
                    .disconnect()
                    .catch(() => {})
                : Promise.resolve(),

              targetMember.voice.channelId !== channel.id
                ? targetMember.voice
                    .setChannel(channel)
                    .catch(() => {})
                : Promise.resolve()

            ]);

            console.log(
              `🔁 โอนเจ้าของห้อง ${channel.name} จาก ${oldOwnerId} → ${targetId}`
            );

            return interaction.reply({

              content:
                `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้ว\n` +
                `❌ <@${oldOwnerId}> ถูกนำสิทธิ์การเข้าห้องออกแล้ว`,

              ephemeral: true

            });

          } catch (error) {

            console.error(
              "❌ Transfer Error:",
              error
            );

            // ==================================================
            // คืนข้อมูลเจ้าของเดิม
            // ==================================================

            data.owner =
              oldOwnerId;

            savedRoomNames.delete(
              targetId
            );

            savedRoomNames.set(
              oldOwnerId,
              currentRoomName
            );

            await Promise.all([

              channel.permissionOverwrites.edit(
                oldOwnerId,
                {
                  ViewChannel: true,
                  Connect: true
                }
              ).catch(() => {}),

              channel.permissionOverwrites.edit(
                targetId,
                {
                  ViewChannel: false,
                  Connect: false
                }
              ).catch(() => {})

            ]);

            return interaction.reply({

              content:
                `❌ ไม่สามารถโอนเจ้าของห้องได้\n${getErrorMessage(error)}`,

              ephemeral: true

            });

          }

        }

      }

      // ==================================================
      // 4. Modal
      // ======================================================

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
              )
              .trim();

          if (!name) {

            return interaction.reply({

              content:
                "❌ กรุณาระบุชื่อห้อง",

              ephemeral: true

            });

          }

          try {

            await channel.setName(
              name
            );

            savedRoomNames.set(
              interaction.member.id,
              name
            );

            return interaction.reply({

              content:
                `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`,

              ephemeral: true

            });

          } catch (error) {

            console.error(
              "Rename Error:",
              error
            );

            return interaction.reply({

              content:
                `❌ ไม่สามารถเปลี่ยนชื่อห้องได้\n${getErrorMessage(error)}`,

              ephemeral: true

            });

          }

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
              )
              .trim();

          const limit =
            parseInt(
              limitInput,
              10
            );

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

          try {

            await channel.setUserLimit(
              limit
            );

            return interaction.reply({

              content:
                `🎯 ตั้งจำกัดจำนวนคนไว้ที่ **${
                  limit === 0
                    ? "ไม่จำกัด"
                    : limit + " คน"
                }** เรียบร้อยแล้ว`,

              ephemeral: true

            });

          } catch (error) {

            console.error(
              "Limit Error:",
              error
            );

            return interaction.reply({

              content:
                `❌ ไม่สามารถตั้งจำนวนคนได้\n${getErrorMessage(error)}`,

              ephemeral: true

            });

          }

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
            "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง",

          ephemeral: true

        }).catch(() => {});

      } else {

        await interaction.editReply({

          content:
            "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง"

        }).catch(() => {});

      }

    }

  }
);

// ======================================================
// 🚀 Login
// ======================================================

client.login(token);
