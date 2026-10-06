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
// 🌐 WEB SERVER สำหรับ Render
// ======================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web Server is ready.");
});

// ======================================================
// 🔐 ENV
// ======================================================

const token = process.env.TOKEN;

const createChannelId =
  process.env.CREATE_CHANNEL_ID;

const categoryId =
  process.env.CATEGORY_ID;

const allowRoleIds =
  process.env.ALLOW_ROLE_ID
    ? process.env.ALLOW_ROLE_ID
        .split(",")
        .map(id => id.trim())
        .filter(Boolean)
    : [];

// ======================================================
// 🤖 CLIENT
// ======================================================

const client = new Client({

  intents: [

    GatewayIntentBits.Guilds,

    GatewayIntentBits.GuildVoiceStates,

    GatewayIntentBits.GuildMembers

  ]

});

// ======================================================
// 🏠 ห้องชั่วคราว
// ======================================================

const tempChannels = new Map();

// ======================================================
// 🛡️ ป้องกันสร้างห้องซ้ำ
// ======================================================

const creatingRooms = new Set();

// ======================================================
// 🔁 ป้องกันโอนซ้ำ
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

    .setDescription(
      "ระบบจัดการห้องส่วนตัว"
    )

    .setDMPermission(false)

].map(command => command.toJSON());

// ======================================================
// 🔧 REST
// ======================================================

const rest = new REST({
  version: "10"
}).setToken(token);

// ======================================================
// 🧰 GET ROOM DATA
// ======================================================

function getRoomData(channelId) {

  if (!channelId) {
    return null;
  }

  return tempChannels.get(
    channelId
  );
}

// ======================================================
// 🧰 ADD PREVIOUS OWNER
// ======================================================

function addPreviousOwner(
  data,
  userId
) {

  if (!data.previousOwners) {

    data.previousOwners = [];

  }

  if (
    userId &&
    !data.previousOwners.includes(
      userId
    )
  ) {

    data.previousOwners.push(
      userId
    );

  }

}

// ======================================================
// 🧰 REMOVE PREVIOUS OWNER
// ======================================================

function removePreviousOwner(
  data,
  userId
) {

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
// 🧰 SET MEMBER PERMISSION
// ======================================================

async function setMemberPermission(
  channel,
  userId,
  canConnect
) {

  if (
    !channel ||
    !userId
  ) {

    return;

  }

  try {

    await channel
      .permissionOverwrites
      .edit(
        userId,
        {

          ViewChannel: true,

          Connect: canConnect

        }
      );

  } catch (error) {

    console.error(
      `Permission Error ${userId}:`,
      error.message
    );

  }

}

// ======================================================
// 🧰 CLEANUP
// ======================================================

function cleanupRoom(
  channelId
) {

  tempChannels.delete(
    channelId
  );

  creatingRooms.delete(
    channelId
  );

  transferringRooms.delete(
    channelId
  );

}

// ======================================================
// 🟢 READY
// ======================================================

client.once(
  "ready",
  async () => {

    console.log(
      `🤖 Login as: ${client.user.tag}`
    );

    console.log(
      "🌐 Web Server is running"
    );

    console.log(
      `🏠 Create Channel: ${createChannelId}`
    );

    console.log(
      `📁 Category: ${categoryId}`
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
        "✅ Slash Command พร้อมใช้งาน"
      );

    } catch (error) {

      console.error(
        "Slash Command Error:",
        error
      );

    }

  }
);

// ======================================================
// 🎤 VOICE STATE
// ======================================================

client.on(
  "voiceStateUpdate",
  async (
    oldState,
    newState
  ) => {

    try {

      // ==================================================
      // 🏠 สร้างห้อง
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
        // 🛡️ ป้องกันสร้างซ้ำ
        // ==================================================

        const createKey =
          `${guildId}:${ownerId}`;

        if (
          creatingRooms.has(
            createKey
          )
        ) {

          return;

        }

        creatingRooms.add(
          createKey
        );

        try {

          // ==================================================
          // 🔐 PERMISSIONS
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
          // 👑 BIG ROLES
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
          // 🧑‍🤝‍🧑 ALLOW ROLES
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
          // 🏠 CREATE CHANNEL
          // ==================================================

          const channel =
            await newState.guild.channels.create({

              name:
                `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,

              type:
                ChannelType.GuildVoice,

              parent:
                categoryId,

              permissionOverwrites

            });

          // ==================================================
          // 💾 SAVE DATA ทันที
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

          console.log(
            `🏠 Created: ${channel.name}`
          );

          // ==================================================
          // 🚀 ย้ายสมาชิก
          // ==================================================

          await newState
            .setChannel(
              channel
            )
            .catch(error => {

              console.error(
                "Move Member Error:",
                error.message
              );

            });

        } catch (error) {

          console.error(
            "Create Room Error:",
            error
          );

        } finally {

          creatingRooms.delete(
            createKey
          );

        }

        return;

      }

      // ==================================================
      // 🗑️ ลบห้องเมื่อไม่มีคน
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
            `🗑️ Deleted Room: ${channelId}`
          );

        }

      }

    } catch (error) {

      console.error(
        "Voice State Error:",
        error
      );

    }

  }
);

// ======================================================
// 🎛️ INTERACTION
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      // ==================================================
      // /ROOM
      // ==================================================

      if (
        interaction.isChatInputCommand() &&
        interaction.commandName === "room"
      ) {

        // ==================================================
        // ⚡ ตอบทันที
        // ==================================================

        await interaction.deferReply({
          ephemeral: true
        });

        // ==================================================
        // EMBED
        // ==================================================

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
        // ROW 1
        // ==================================================

        const row1 =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()

                .setCustomId(
                  "name"
                )

                .setEmoji(
                  "✏️"
                )

                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()

                .setCustomId(
                  "lock"
                )

                .setEmoji(
                  "🔒"
                )

                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()

                .setCustomId(
                  "unlock"
                )

                .setEmoji(
                  "🔓"
                )

                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()

                .setCustomId(
                  "limit"
                )

                .setEmoji(
                  "🎯"
                )

                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()

                .setCustomId(
                  "owner"
                )

                .setEmoji(
                  "👑"
                )

                .setStyle(
                  ButtonStyle.Secondary
                )

            );

        // ==================================================
        // ROW 2
        // ==================================================

        const row2 =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()

                .setCustomId(
                  "hide"
                )

                .setEmoji(
                  "🙈"
                )

                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()

                .setCustomId(
                  "show"
                )

                .setEmoji(
                  "👁"
                )

                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()

                .setCustomId(
                  "transfer"
                )

                .setEmoji(
                  "🔁"
                )

                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()

                .setCustomId(
                  "allow"
                )

                .setEmoji(
                  "🧑‍🤝‍🧑"
                )

                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()

                .setCustomId(
                  "deny"
                )

                .setEmoji(
                  "🚫"
                )

                .setStyle(
                  ButtonStyle.Secondary
                )

            );

        // ==================================================
        // 📤 ส่ง Panel
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

        // ==================================================
        // ⚡ ปิด "กำลังคิด..."
        // ==================================================

        return interaction.editReply({

          content:
            "✅ แผงควบคุมพร้อมใช้งานแล้ว"

        });

      }

      // ==================================================
      // 🔘 BUTTON
      // ==================================================

      if (
        interaction.isButton()
      ) {

        const member =
          interaction.member;

        const channel =
          member.voice.channel;

        // ==================================================
        // ตรวจห้อง
        // ==================================================

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
        // 👑 OWNER
        // ==================================================

        if (
          interaction.customId ===
          "owner"
        ) {

          if (!data) {

            return interaction.reply({

              content:
                "❌ ห้องนี้ไม่ได้อยู่ในระบบ",

              ephemeral: true

            });

          }

          return interaction.reply({

            content:
              `👑 เจ้าของห้องปัจจุบันคือ <@${data.owner}>`,

            ephemeral: true

          });

        }

        // ==================================================
        // 🔐 ตรวจเจ้าของ
        // ==================================================

        if (
          !data ||
          data.owner !==
          member.id
        ) {

          return interaction.reply({

            content:
              "❌ คุณไม่ใช่เจ้าของห้องนี้",

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
                "ใส่จำนวนคน 0 - 99"
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
        // ALLOW / DENY / TRANSFER
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
                "เลือกสมาชิก..."
              );

          return interaction.reply({

            content:
              "🎯 เลือกสมาชิกจากเมนูด้านล่าง",

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

          data.locked =
            true;

          const jobs = [];

          // @everyone
          jobs.push(

            channel
              .permissionOverwrites
              .edit(

                interaction.guild.id,

                {
                  ViewChannel: true,
                  Connect: false
                }

              )

          );

          // Allow Roles
          for (
            const roleId of allowRoleIds
          ) {

            jobs.push(

              channel
                .permissionOverwrites
                .edit(

                  roleId,

                  {
                    ViewChannel: true,
                    Connect: false
                  }

                )

            );

          }

          // Previous Owners
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

          // Current Owner
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

          data.locked =
            false;

          const jobs = [];

          // @everyone
          jobs.push(

            channel
              .permissionOverwrites
              .edit(

                interaction.guild.id,

                {
                  ViewChannel: true,
                  Connect: false
                }

              )

          );

          // Allow Roles
          for (
            const roleId of allowRoleIds
          ) {

            jobs.push(

              channel
                .permissionOverwrites
                .edit(

                  roleId,

                  {
                    ViewChannel: true,
                    Connect: true
                  }

                )

            );

          }

          // Previous Owners
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

          // Current Owner
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

          try {

            // เก็บ Permission เดิม
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
                        overwrite.allow.bitfield.toString(),

                      deny:
                        overwrite.deny.bitfield.toString()

                    })
                  );

            }

            await channel
              .permissionOverwrites
              .set([

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

              ]);

            data.hidden =
              true;

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
                "❌ ไม่สามารถซ่อนห้องได้"

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

            data.hidden =
              false;

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
                "❌ ไม่สามารถแสดงห้องได้"

            });

          }

        }

      }

      // ==================================================
      // 👤 USER SELECT
      // ==================================================

      if (
        interaction.isUserSelectMenu()
      ) {

        const channel =
          interaction.member
            .voice.channel;

        const data =
          getRoomData(
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

        // ==================================================
        // ALLOW
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
                ViewChannel: true,
                Connect: true
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
              `✅ อนุญาต <@${targetId}> เข้าห้องแล้ว`

          });

        }

        // ==================================================
        // DENY
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
              `🚫 บล็อก <@${targetId}> แล้ว`

          });

        }

        // ==================================================
        // 🔁 TRANSFER
        // ==================================================

        if (
          interaction.customId ===
          "select_transfer"
        ) {

          if (
            transferringRooms.has(
              channel.id
            )
          ) {

            return interaction.reply({

              content:
                "⏳ ห้องนี้กำลังโอนเจ้าของ",

              ephemeral: true

            });

          }

          if (
            targetId ===
            interaction.member.id
          ) {

            return interaction.reply({

              content:
                "❌ ไม่สามารถโอนให้ตัวเองได้",

              ephemeral: true

            });

          }

          // ==================================================
          // ⚡ ตอบ Interaction ก่อน
          // ==================================================

          transferringRooms.add(
            channel.id
          );

          await interaction.deferReply({
            ephemeral: true
          });

          const oldOwnerId =
            data.owner;

          const oldOwnerMember =
            interaction.guild.members.cache.get(
              oldOwnerId
            );

          const oldOwnerName =
            oldOwnerMember
              ? oldOwnerMember.user.username
              : "ห้องส่วนตัว";

          try {

            // ==================================================
            // 👤 หา Member
            // ==================================================

            const targetMember =
              interaction.guild.members.cache.get(
                targetId
              ) ||
              await interaction.guild.members
                .fetch(
                  targetId
                )
                .catch(
                  () => null
                );

            if (!targetMember) {

              return interaction.editReply({

                content:
                  "❌ ไม่พบสมาชิกที่ต้องการโอน"

              });

            }

            // ==================================================
            // 👑 เก็บเจ้าของเก่า
            // ==================================================

            addPreviousOwner(
              data,
              oldOwnerId
            );

            // ==================================================
            // ถ้าคนใหม่เคยเป็นเจ้าของเก่า
            // ให้เอาออกจาก previousOwners
            // ==================================================

            removePreviousOwner(
              data,
              targetId
            );

            // ==================================================
            // 👑 เปลี่ยนเจ้าของ
            // ==================================================

            data.owner =
              targetId;

            // ==================================================
            // 🔐 เจ้าของเก่า
            // ==================================================

            const oldOwnerCanConnect =
              data.locked
                ? false
                : true;

            // ==================================================
            // 🔐 Permission
            // ==================================================

            await Promise.allSettled([

              setMemberPermission(

                channel,

                oldOwnerId,

                oldOwnerCanConnect

              ),

              setMemberPermission(

                channel,

                targetId,

                true

              )

            ]);

            // ==================================================
            // 🏠 เปลี่ยนชื่อห้อง
            // ==================================================

            const newChannelName =
              `📍・ห้องส่วนตัวของ ${targetMember.user.username}`;

            await channel
              .setName(
                newChannelName
              );

            // ==================================================
            // ✅ สำเร็จ
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
            // 🔄 คืนเจ้าของ
            // ==================================================

            data.owner =
              oldOwnerId;

            // ==================================================
            // 🔄 คืนชื่อ
            // ==================================================

            await channel
              .setName(
                `📍・ห้องส่วนตัวของ ${oldOwnerName}`
              )
              .catch(
                () => {}
              );

            return interaction.editReply({

              content:
                "❌ ไม่สามารถโอนเจ้าของได้ กรุณาลองใหม่"

            });

          } finally {

            transferringRooms.delete(
              channel.id
            );

          }

        }

      }

      // ==================================================
      // 📝 MODAL
      // ==================================================

      if (
        interaction.isModalSubmit()
      ) {

        const channel =
          interaction.member
            .voice.channel;

        const data =
          getRoomData(
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
              "❌ คุณไม่ใช่เจ้าของห้องนี้",

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
              )
              .trim();

          if (!name) {

            return interaction.reply({

              content:
                "❌ กรุณาใส่ชื่อห้อง",

              ephemeral: true

            });

          }

          await interaction.deferReply({
            ephemeral: true
          });

          try {

            await channel
              .setName(
                name
              );

            return interaction.editReply({

              content:
                `✏️ เปลี่ยนชื่อห้องเป็น **${name}** แล้ว`

            });

          } catch (error) {

            console.error(
              "Rename Error:",
              error
            );

            return interaction.editReply({

              content:
                "❌ เปลี่ยนชื่อห้องไม่สำเร็จ"

            });

          }

        }

        // ==================================================
        // 🎯 LIMIT
        // ==================================================

        if (
          interaction.customId ===
          "limit_room"
        ) {

          const input =
            interaction.fields
              .getTextInputValue(
                "limit_input"
              )
              .trim();

          const limit =
            parseInt(
              input,
              10
            );

          if (
            isNaN(limit) ||
            limit < 0 ||
            limit > 99
          ) {

            return interaction.reply({

              content:
                "❌ กรุณาใส่ตัวเลข 0 - 99",

              ephemeral: true

            });

          }

          await interaction.deferReply({
            ephemeral: true
          });

          try {

            await channel
              .setUserLimit(
                limit
              );

            return interaction.editReply({

              content:
                `🎯 ตั้งจำนวนคนเป็น **${
                  limit === 0
                    ? "ไม่จำกัด"
                    : `${limit} คน`
                }** แล้ว`

            });

          } catch (error) {

            console.error(
              "Limit Error:",
              error
            );

            return interaction.editReply({

              content:
                "❌ ตั้งจำนวนคนไม่สำเร็จ"

            });

          }

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

      try {

        if (
          !interaction.replied &&
          !interaction.deferred
        ) {

          await interaction.reply({

            content:
              "❌ เกิดข้อผิดพลาด",

            ephemeral: true

          });

        } else {

          await interaction.editReply({

            content:
              "❌ เกิดข้อผิดพลาด"

          });

        }

      } catch {

        // ไม่ทำอะไร
      }

    }

  }
);

// ======================================================
// 🚀 LOGIN
// ======================================================

if (!token) {

  console.error(
    "❌ ไม่พบ TOKEN"
  );

} else {

  client
    .login(token)
    .then(() => {

      console.log(
        "🚀 กำลังเข้าสู่ระบบ Discord..."
      );

    })
    .catch(error => {

      console.error(
        "❌ Login Error:",
        error
      );

    });

}
