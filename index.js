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
//
// Render Environment Variable:
//
// ALLOW_ROLE_ID
//
// ตัวอย่าง:
//
// 123456789,987654321,555555555
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
// 💾 จำชื่อห้องของแต่ละคน
//
// ownerId -> ชื่อห้อง
//
// ตัวอย่าง:
//
// 123456789 -> "ห้องเล่นเกม"
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
// 🧹 ฟังก์ชันชื่อห้องเริ่มต้น
// ======================================================

function getDefaultRoomName(member) {
  return `ห้องส่วนตัวของ ${member.user.username}`;
}

// ======================================================
// 🔎 ฟังก์ชันตรวจสอบว่าเป็นเจ้าของห้องหรือไม่
// ======================================================

function isRoomOwner(member, data) {
  return (
    data &&
    data.owner === member.id
  );
}

// ======================================================
// ✅ Bot Ready
// ======================================================

client.once("ready", async () => {

  console.log(
    `✅ Login as: ${client.user.tag}`
  );

  console.log(
    `🧑‍🤝‍🧑 Allow Roles: ${
      allowRoleIds.length > 0
        ? allowRoleIds.join(", ")
        : "ไม่มี"
    }`
  );

  try {

    await rest.put(
      Routes.applicationCommands(
        client.user.id
      ),
      {
        body: commands
      }
    );

    console.log(
      "🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!"
    );

  } catch (error) {

    console.error(
      "❌ Slash Command Error:",
      error
    );

  }

});

// ======================================================
// 🎤 ระบบสร้างห้องเสียงอัตโนมัติ
// ======================================================

client.on(
  "voiceStateUpdate",
  async (oldState, newState) => {

    try {

      // ==================================================
      // 🏠 1. สมาชิกเข้าห้องสร้างห้อง
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

          // 👤 เจ้าของห้อง
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
        // 👑 เพิ่มสิทธิ์ยศใหญ่
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
        // 🧑‍🤝‍🧑 เพิ่มสิทธิ์ยศจาก Render
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
        // 💾 ตรวจสอบชื่อที่จำไว้
        // ==================================================

        const savedName =
          savedRoomNames.get(
            ownerId
          );

        // ==================================================
        // 🏠 ชื่อเริ่มต้น
        // ==================================================

        const defaultName =
          getDefaultRoomName(
            newState.member
          );

        // ==================================================
        // 🏠 เลือกชื่อห้อง
        // ==================================================

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
        // 🚶 ย้ายเจ้าของเข้าห้อง
        // ==================================================

        await newState
          .setChannel(channel)
          .catch(() => {});

        // ==================================================
        // 💾 บันทึกข้อมูลห้อง
        // ==================================================

        tempChannels.set(
          channel.id,
          {
            owner: ownerId
          }
        );

        console.log(
          `🏠 สร้างห้อง "${roomName}" ให้ ${newState.member.user.username}`
        );

        return;
      }

      // ==================================================
      // 🗑️ 2. ลบห้องเมื่อไม่มีคน
      // ==================================================

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
            `🗑️ ลบห้อง ${oldState.channelId}`
          );

          // ==================================================
          // ⚠️ ไม่ลบ savedRoomNames
          //
          // เพราะต้องการจำชื่อห้องไว้
          // ==================================================

          return;
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
// 🎛️ ระบบ Interaction
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
        // ปุ่มชุดที่ 1
        // ==================================================

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

        // ==================================================
        // ปุ่มชุดที่ 2
        // ==================================================

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

        // ==================================================
        // ส่งแผงควบคุม
        // ==================================================

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

        await interaction.deleteReply()
          .catch(() => {});

        return;
      }

      // ==================================================
      // 2. ปุ่ม
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
              "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",

            ephemeral: true

          });

        }

        // ==================================================
        // ข้อมูลห้อง
        // ==================================================

        const data =
          tempChannels.get(
            channel.id
          );

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

        // ==================================================
        // 🛡️ ตรวจสอบเจ้าของ
        //
        // หลังโอน data.owner จะเป็น ID ของเจ้าของใหม่
        // ดังนั้นเจ้าของใหม่จะใช้ทุกปุ่มได้ทันที
        // ==================================================

        if (
          !isRoomOwner(
            member,
            data
          )
        ) {

          return interaction.reply({

            content:
              "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ ไม่สามารถสั่งการได้",

            ephemeral: true

          });

        }

        // ==================================================
        // ✏️ เปลี่ยนชื่อ
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
                "เว้นว่างแล้วกดส่ง = รีเซ็ตชื่อเริ่มต้น"
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(false)
              .setMaxLength(100);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(input)
          );

          return interaction.showModal(
            modal
          );
        }

        // ==================================================
        // 🎯 จำกัดจำนวนคน
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
              .addComponents(input)
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

        // ==================================================
        // Permission Commands
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
        // 🙈 HIDE ROOM
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

            // @everyone
            {
              id:
                interaction.guild.id,

              deny: [
                "ViewChannel",
                "Connect"
              ]
            },

            // 🤖 Bot
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

            // 👑 เจ้าของปัจจุบัน
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
              "❌ Hide Room Error:",
              error
            );

            return interaction.editReply({

              content:
                "❌ ไม่สามารถซ่อนห้องได้ กรุณาตรวจสอบสิทธิ์ Manage Channels ของบอท"

            });

          }
        }

        // ==================================================
        // 👁️ SHOW ROOM
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
                  permission => ({

                    id:
                      permission.id,

                    type:
                      permission.type,

                    allow:
                      BigInt(
                        permission.allow
                      ),

                    deny:
                      BigInt(
                        permission.deny
                      )

                  })
                )

              );

              delete data.savedPermissions;

            } catch (error) {

              console.error(
                "❌ Show Room Error:",
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
        // 🛡️ ตรวจสอบเจ้าของ
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
              `🚫 บล็อก <@${targetId}> ไม่ให้เข้าห้องเรียบร้อยแล้วครับ`,

            ephemeral: true

          });
        }

        // ==================================================
        // 🔁 TRANSFER OWNER
        // ==================================================

        if (
          interaction.customId === "select_transfer"
        ) {

          const oldOwnerId =
            data.owner;

          const newOwnerId =
            targetId;

          // ==================================================
          // ❌ ป้องกันโอนให้ตัวเอง
          // ==================================================

          if (
            oldOwnerId === newOwnerId
          ) {

            return interaction.reply({

              content:
                "❌ คุณเป็นเจ้าของห้องนี้อยู่แล้วครับ",

              ephemeral: true

            });

          }

          // ==================================================
          // 🔎 ตรวจสอบสมาชิก
          // ==================================================

          const newOwnerMember =
            await interaction.guild.members
              .fetch(newOwnerId)
              .catch(() => null);

          if (!newOwnerMember) {

            return interaction.reply({

              content:
                "❌ ไม่พบสมาชิกที่ต้องการโอนเจ้าของ",

              ephemeral: true

            });

          }

          // ==================================================
          // 💾 จำชื่อห้องปัจจุบัน
          //
          // ทำให้ชื่อห้องติดไปกับเจ้าของใหม่
          // ==================================================

          const currentRoomName =
            channel.name;

          // ==================================================
          // เปลี่ยนเจ้าของ
          // ==================================================

          data.owner =
            newOwnerId;

          // ==================================================
          // 💾 บันทึกชื่อให้เจ้าของใหม่
          // ==================================================

          savedRoomNames.set(
            newOwnerId,
            currentRoomName
          );

          // ==================================================
          // ลบชื่อที่จำไว้ของเจ้าของเก่า
          // ==================================================

          savedRoomNames.delete(
            oldOwnerId
          );

          // ==================================================
          // 👑 ให้เจ้าของใหม่เข้าห้อง
          // และเห็นห้อง
          // ==================================================

          await channel.permissionOverwrites.edit(

            newOwnerId,

            {
              ViewChannel: true,
              Connect: true
            }

          ).catch(() => {});

          // ==================================================
          // 👤 เจ้าของเก่ายังอยู่ในห้องได้
          //
          // แต่จะไม่สามารถควบคุมได้
          // เพราะ data.owner เปลี่ยนแล้ว
          // ==================================================

          await channel.permissionOverwrites.edit(

            oldOwnerId,

            {
              ViewChannel: true,
              Connect: true
            }

          ).catch(() => {});

          // ==================================================
          // 🏠 คงชื่อห้องเดิม
          // ==================================================

          await channel
            .setName(
              currentRoomName
            )
            .catch(() => {});

          // ==================================================
          // 🚶 ถ้าเจ้าของใหม่อยู่ในห้องเสียงอื่น
          // ให้ย้ายเข้าห้องนี้
          // ==================================================

          if (
            newOwnerMember.voice.channelId &&
            newOwnerMember.voice.channelId !== channel.id
          ) {

            await newOwnerMember.voice
              .setChannel(channel)
              .catch(() => {});

          }

          // ==================================================
          // ถ้าเจ้าของใหม่ไม่ได้อยู่ในห้องเสียง
          // ไม่ต้องย้าย เพราะ Discord อาจไม่อนุญาต
          // ==================================================

          return interaction.reply({

            content:
              `🔁 โอนความเป็นเจ้าของห้องให้ <@${newOwnerId}> เรียบร้อยแล้วครับ\n\n` +
              `👑 เจ้าของใหม่สามารถจัดการห้องได้ทุกฟังก์ชันแล้วครับ`,

            ephemeral: true

          });
        }

      }

      // ==================================================
      // 4. Modal
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

        // ==================================================
        // 🛡️ ตรวจสอบเจ้าของ
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

          // ==================================================
          // 🔄 เว้นว่าง = รีเซ็ตชื่อ
          // ==================================================

          if (!name) {

            const defaultName =
              getDefaultRoomName(
                interaction.member
              );

            // ==================================================
            // 🗑️ ลบชื่อที่จำไว้
            // ==================================================

            savedRoomNames.delete(
              interaction.member.id
            );

            // ==================================================
            // ✏️ เปลี่ยนกลับชื่อเริ่มต้น
            // ==================================================

            await channel
              .setName(
                defaultName
              )
              .catch(() => {});

            return interaction.reply({

              content:
                `🔄 รีเซ็ตชื่อห้องกลับเป็น **${defaultName}** เรียบร้อยแล้ว`,

              ephemeral: true

            });

          }

          // ==================================================
          // 💾 จำชื่อใหม่
          // ==================================================

          savedRoomNames.set(
            interaction.member.id,
            name
          );

          // ==================================================
          // ✏️ เปลี่ยนชื่อห้อง
          // ==================================================

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
              )
              .trim();

          const limit =
            parseInt(
              limitInput,
              10
            );

          // ==================================================
          // ตรวจสอบ
          // ==================================================

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

          // ==================================================
          // ตั้งจำนวนคน
          // ==================================================

          await channel
            .setUserLimit(
              limit
            )
            .catch(() => {});

          return interaction.reply({

            content:
              `🎯 ตั้งจำกัดจำนวนคนเป็น **${
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

      // ==================================================
      // ตอบ Error
      // ==================================================

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

  }
);

// ======================================================
// 🚀 Login
// ======================================================

client.login(token);
