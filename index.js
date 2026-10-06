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
// 🌐 Web Server สำหรับ Render
// ======================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web Server is ready.");
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
// 🛡️ ป้องกันสร้างห้องซ้ำ
// ======================================================

const creatingRooms = new Set();

// ======================================================
// 🔁 ป้องกันการโอนซ้อน
// ======================================================

const transferringRooms = new Set();

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
// 🧰 ฟังก์ชันตั้ง Permission ผู้ใช้
// ======================================================

async function setMemberPermission(
  channel,
  userId,
  canConnect
) {
  if (!channel || !userId) {
    return;
  }

  return channel.permissionOverwrites
    .edit(
      userId,
      {
        ViewChannel: true,
        Connect: canConnect
      }
    )
    .catch(error => {
      console.error(
        `Permission Error ${userId}:`,
        error.message
      );
    });
}

// ======================================================
// 🧰 เพิ่มเจ้าของเก่า
// ======================================================

function addPreviousOwner(data, userId) {

  if (!data.previousOwners) {
    data.previousOwners = [];
  }

  if (
    userId &&
    !data.previousOwners.includes(userId)
  ) {
    data.previousOwners.push(userId);
  }
}

// ======================================================
// 🧰 ลบออกจากรายชื่อเจ้าของเก่า
// ======================================================

function removePreviousOwner(data, userId) {

  if (
    !data.previousOwners ||
    !userId
  ) {
    return;
  }

  data.previousOwners =
    data.previousOwners.filter(
      id => id !== userId
    );
}

// ======================================================
// 🧰 ตรวจห้อง
// ======================================================

function getRoomData(channelId) {

  if (!channelId) {
    return null;
  }

  return tempChannels.get(channelId);
}

// ======================================================
// 🧰 ล้างข้อมูลห้อง
// ======================================================

function cleanupRoom(channelId) {

  if (!channelId) {
    return;
  }

  tempChannels.delete(channelId);
  transferringRooms.delete(channelId);
}

// ======================================================
// 🟢 Bot Ready
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
      "Slash Command Error:",
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
      // 🏠 สร้างห้องใหม่
      // ==================================================

      if (
        newState.channelId ===
        createChannelId
      ) {

        const guildId =
          newState.guild.id;

        const ownerId =
          newState.member?.id;

        if (!ownerId) {
          return;
        }

        // ==================================================
        // 🛡️ ป้องกัน Event ซ้ำ
        // ==================================================

        const createKey =
          `${guildId}:${ownerId}`;

        if (
          creatingRooms.has(createKey)
        ) {
          return;
        }

        creatingRooms.add(createKey);

        try {

          // ==================================================
          // Permission พื้นฐาน
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

            // 👑 เจ้าของ
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
          // 🧑‍🤝‍🧑 ยศที่อนุญาต
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
          // 🏠 สร้างห้อง
          // ==================================================

          const channel =
            await newState.guild.channels.create({

              name:
                `ห้องส่วนตัวของ ${newState.member.user.username}`,

              type:
                ChannelType.GuildVoice,

              parent:
                categoryId,

              permissionOverwrites

            });

          // ==================================================
          // 💾 บันทึกข้อมูลทันที
          // ==================================================

          tempChannels.set(
            channel.id,
            {

              owner:
                ownerId,

              previousOwners:
                [],

              locked:
                false,

              hidden:
                false,

              savedPermissions:
                null

            }
          );

          // ==================================================
          // 🚀 ย้ายเข้าห้อง
          // ==================================================

          await newState
            .setChannel(channel)
            .catch(error => {

              console.error(
                "Move Member Error:",
                error.message
              );

            });

          console.log(
            `🏠 สร้างห้อง ${channel.id} | เจ้าของ ${ownerId}`
          );

        } finally {

          creatingRooms.delete(
            createKey
          );

        }

        return;
      }

      // ==================================================
      // 🗑️ ลบห้องเมื่อไม่มีสมาชิก
      // ==================================================

      if (
        oldState.channelId &&
        tempChannels.has(
          oldState.channelId
        )
      ) {

        const channel =
          oldState.guild.channels.cache.get(
            oldState.channelId
          );

        if (!channel) {

          cleanupRoom(
            oldState.channelId
          );

          return;
        }

        if (
          channel.members.size === 0
        ) {

          const channelId =
            channel.id;

          await channel
            .delete()
            .catch(error => {

              console.error(
                "Delete Room Error:",
                error.message
              );

            });

          cleanupRoom(
            channelId
          );

          console.log(
            `🗑️ ลบห้อง ${channelId}`
          );

        }

      }

    } catch (error) {

      console.error(
        "voiceStateUpdate Error:",
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

        // ==================================================
        // แถวที่ 1
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
        // แถวที่ 2
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
      // 2. Buttons
      // ==================================================

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
          getRoomData(
            channel.id
          );

        // ==================================================
        // 👑 ดูเจ้าของ
        // ==================================================

        if (
          interaction.customId ===
          "owner"
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

        // ==================================================
        // 🔐 ตรวจเจ้าของ
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
        // ✏️ NAME
        // ==================================================

        if (
          interaction.customId ===
          "name"
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

              .setRequired(
                true
              );

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
          interaction.customId ===
          "limit"
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

              .setRequired(
                true
              );

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
        // 🧑‍🤝‍🧑 ALLOW / DENY / TRANSFER
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
        // 🔒 LOCK
        // ==================================================

        if (
          interaction.customId ===
          "lock"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          data.locked = true;

          const jobs = [];

          // @everyone
          jobs.push(
            channel.permissionOverwrites
              .edit(
                interaction.guild.id,
                {
                  ViewChannel: true,
                  Connect: false
                }
              )
          );

          // ยศที่อนุญาต
          for (
            const roleId of allowRoleIds
          ) {

            jobs.push(
              channel.permissionOverwrites
                .edit(
                  roleId,
                  {
                    ViewChannel: true,
                    Connect: false
                  }
                )
            );

          }

          // เจ้าของเก่า
          for (
            const previousOwnerId
            of data.previousOwners || []
          ) {

            if (
              previousOwnerId ===
              data.owner
            ) {
              continue;
            }

            jobs.push(
              setMemberPermission(
                channel,
                previousOwnerId,
                false
              )
            );

          }

          // เจ้าของปัจจุบัน
          jobs.push(
            setMemberPermission(
              channel,
              data.owner,
              true
            )
          );

          await Promise.allSettled(
            jobs
          );

          return interaction.editReply({

            content:
              "🔒 ล็อกห้องเรียบร้อยแล้ว"

          });

        }

        // ==================================================
        // 🔓 UNLOCK
        // ==================================================

        if (
          interaction.customId ===
          "unlock"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          data.locked = false;

          const jobs = [];

          // @everyone
          jobs.push(
            channel.permissionOverwrites
              .edit(
                interaction.guild.id,
                {
                  ViewChannel: true,
                  Connect: false
                }
              )
          );

          // ยศที่อนุญาต
          for (
            const roleId of allowRoleIds
          ) {

            jobs.push(
              channel.permissionOverwrites
                .edit(
                  roleId,
                  {
                    ViewChannel: true,
                    Connect: true
                  }
                )
            );

          }

          // เจ้าของเก่าทั้งหมด
          for (
            const previousOwnerId
            of data.previousOwners || []
          ) {

            if (
              previousOwnerId ===
              data.owner
            ) {
              continue;
            }

            jobs.push(
              setMemberPermission(
                channel,
                previousOwnerId,
                true
              )
            );

          }

          // เจ้าของปัจจุบัน
          jobs.push(
            setMemberPermission(
              channel,
              data.owner,
              true
            )
          );

          await Promise.allSettled(
            jobs
          );

          return interaction.editReply({

            content:
              "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"

          });

        }

        // ==================================================
        // 🙈 HIDE
        // ==================================================

        if (
          interaction.customId ===
          "hide"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          if (
            !data.savedPermissions
          ) {

            data.savedPermissions =
              channel
                .permissionOverwrites
                .cache
                .map(
                  overwrite => ({
                    id:
                      overwrite.id,

                    type:
                      overwrite.type,

                    allow:
                      overwrite.allow
                        .bitfield
                        .toString(),

                    deny:
                      overwrite.deny
                        .bitfield
                        .toString()
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

            // Bot
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

            // เจ้าของปัจจุบัน
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

            await channel
              .permissionOverwrites
              .set(
                permissions
              );

            data.hidden = true;

            return interaction.editReply({

              content:
                "🙈 ซ่อนห้องเรียบร้อยแล้ว"

            });

          } catch (error) {

            console.error(
              "Hide Room Error:",
              error
            );

            return interaction.editReply({

              content:
                "❌ ไม่สามารถซ่อนห้องได้ กรุณาตรวจสอบสิทธิ์ Manage Channels ของบอท"

            });

          }

        }

        // ==================================================
        // 👁 SHOW
        // ==================================================

        if (
          interaction.customId ===
          "show"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          try {

            if (
              data.savedPermissions
            ) {

              await channel
                .permissionOverwrites
                .set(

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

              data.savedPermissions =
                null;

            } else {

              await channel
                .permissionOverwrites
                .edit(
                  interaction.guild.id,
                  {
                    ViewChannel: true
                  }
                );

            }

            data.hidden = false;

            return interaction.editReply({

              content:
                "👁️ แสดงห้องเรียบร้อยแล้ว"

            });

          } catch (error) {

            console.error(
              "Show Room Error:",
              error
            );

            return interaction.editReply({

              content:
                "❌ ไม่สามารถแสดงห้องได้"

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
          interaction.member
            .voice
            .channel;

        const data =
          getRoomData(
            channel?.id
          );

        // ==================================================
        // ตรวจเจ้าของปัจจุบัน
        // ==================================================

        if (
          !channel ||
          !data ||
          data.owner !==
            interaction.member.id
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
          interaction.customId ===
          "select_allow"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          await channel
            .permissionOverwrites
            .edit(
              targetId,
              {
                Connect: true,
                ViewChannel: true
              }
            )
            .catch(error => {

              console.error(
                "Allow Error:",
                error
              );

            });

          return interaction.editReply({

            content:
              `✅ อนุญาตให้ <@${targetId}> มองเห็นและเข้าห้องได้แล้ว`

          });

        }

        // ==================================================
        // 🚫 DENY
        // ==================================================

        if (
          interaction.customId ===
          "select_deny"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          await channel
            .permissionOverwrites
            .edit(
              targetId,
              {
                Connect: false
              }
            )
            .catch(error => {

              console.error(
                "Deny Error:",
                error
              );

            });

          const targetMember =
            channel.members.get(
              targetId
            );

          if (
            targetMember
          ) {

            await targetMember
              .voice
              .disconnect()
              .catch(() => {});

          }

          return interaction.editReply({

            content:
              `🚫 บล็อก <@${targetId}> ไม่ให้เข้าห้องเรียบร้อยแล้ว`

          });

        }

        // ==================================================
        // 🔁 TRANSFER OWNER
        // ==================================================

        if (
          interaction.customId ===
          "select_transfer"
        ) {

          // ==================================================
          // 🛡️ ป้องกันโอนซ้อน
          // ==================================================

          if (
            transferringRooms.has(
              channel.id
            )
          ) {

            return interaction.reply({

              content:
                "⏳ ห้องนี้กำลังโอนเจ้าของ กรุณารอสักครู่",

              ephemeral: true

            });

          }

          // ==================================================
          // ห้ามโอนให้ตัวเอง
          // ==================================================

          if (
            targetId ===
            interaction.member.id
          ) {

            return interaction.reply({

              content:
                "❌ ไม่สามารถโอนห้องให้ตัวเองได้",

              ephemeral: true

            });

          }

          // ==================================================
          // ตรวจสมาชิก
          // ==================================================

          const targetMember =
            interaction.guild.members.cache.get(
              targetId
            ) ||
            await interaction.guild.members
              .fetch(targetId)
              .catch(() => null);

          if (
            !targetMember
          ) {

            return interaction.reply({

              content:
                "❌ ไม่พบสมาชิกที่ต้องการโอนห้องให้",

              ephemeral: true

            });

          }

          // ==================================================
          // 🔒 ล็อกการโอนห้อง
          // ==================================================

          transferringRooms.add(
            channel.id
          );

          // ==================================================
          // ⚡ ตอบ Interaction ทันที
          // ==================================================

          await interaction.deferReply({
            ephemeral: true
          });

          try {

            const oldOwnerId =
              data.owner;

            // ==================================================
            // บันทึกเจ้าของเดิม
            // ==================================================

            addPreviousOwner(
              data,
              oldOwnerId
            );

            // ==================================================
            // เจ้าของใหม่เคยเป็นเจ้าของเก่า
            // เอาออกจาก previousOwners
            // ==================================================

            removePreviousOwner(
              data,
              targetId
            );

            // ==================================================
            // เปลี่ยนเจ้าของใน Memory ก่อน
            // ==================================================

            data.owner =
              targetId;

            // ==================================================
            // Permission
            //
            // ทำพร้อมกัน
            // ==================================================

            const oldOwnerConnect =
              data.locked
                ? false
                : true;

            await Promise.allSettled([

              setMemberPermission(
                channel,
                oldOwnerId,
                oldOwnerConnect
              ),

              setMemberPermission(
                channel,
                targetId,
                true
              )

            ]);

            // ==================================================
            // เปลี่ยนชื่อห้อง
            // ==================================================

            const newRoomName =
              `📍・ห้องส่วนตัวของ ${targetMember.user.username}`;

            await channel
              .setName(
                newRoomName
              )
              .catch(error => {

                console.error(
                  "Rename Transfer Error:",
                  error.message
                );

              });

            // ==================================================
            // แจ้งผล
            // ==================================================

            return interaction.editReply({

              content:
                `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้ว`

            });

          } catch (error) {

            console.error(
              "Transfer Error:",
              error
            );

            // ==================================================
            // ถ้าเกิดข้อผิดพลาด
            // คืนเจ้าของเดิม
            // ==================================================

            data.owner =
              oldOwnerId;

            return interaction.editReply({

              content:
                "❌ ไม่สามารถโอนความเป็นเจ้าของได้ กรุณาลองใหม่อีกครั้ง"

            });

          } finally {

            transferringRooms.delete(
              channel.id
            );

          }

        }

      }

      // ==================================================
      // 4. Modal
      // ==================================================

      if (
        interaction.isModalSubmit()
      ) {

        const channel =
          interaction.member
            .voice
            .channel;

        const data =
          getRoomData(
            channel?.id
          );

        // ==================================================
        // ตรวจเจ้าของ
        // ==================================================

        if (
          !channel ||
          !data ||
          data.owner !==
            interaction.member.id
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
          interaction.customId ===
          "rename_room"
        ) {

          const name =
            interaction.fields
              .getTextInputValue(
                "room_name"
              );

          if (
            !name ||
            !name.trim()
          ) {

            return interaction.reply({

              content:
                "❌ กรุณาระบุชื่อห้อง",

              ephemeral: true

            });

          }

          await interaction.deferReply({
            ephemeral: true
          });

          await channel
            .setName(
              name.trim()
            )
            .catch(error => {

              console.error(
                "Rename Error:",
                error
              );

            });

          return interaction.editReply({

            content:
              `✏️ เปลี่ยนชื่อห้องเป็น **${name.trim()}** เรียบร้อยแล้ว`

          });

        }

        // ==================================================
        // 🎯 LIMIT
        // ==================================================

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
                "❌ โปรดใส่หมายเลขที่ถูกต้องระหว่าง (0 - 99)",

              ephemeral: true

            });

          }

          await interaction.deferReply({
            ephemeral: true
          });

          await channel
            .setUserLimit(
              limit
            )
            .catch(error => {

              console.error(
                "Limit Error:",
                error
              );

            });

          return interaction.editReply({

            content:
              `🎯 ตั้งจำกัดจำนวนคนรวมเจ้าของไว้ที่ **${
                limit === 0
                  ? "ไม่จำกัด"
                  : limit + " คน"
              }** เรียบร้อยแล้ว`

          });

        }

      }

    } catch (error) {

      console.error(
        "Interaction Error:",
        error
      );

      // ==================================================
      // ป้องกัน Interaction ตอบซ้ำ
      // ==================================================

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

      } else {

        await interaction
          .editReply({

            content:
              "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง"

          })
          .catch(() => {});

      }

    }

  }
);

// ======================================================
// 🚀 Login
// ======================================================

if (!token) {

  console.error(
    "❌ ไม่พบ TOKEN ใน Environment Variables"
  );

} else {

  client.login(token)
    .catch(error => {

      console.error(
        "❌ Discord Login Error:",
        error
      );

    });

}
