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
// 🧰 ฟังก์ชันตรวจข้อมูลห้อง
// ======================================================

function getRoomData(channelId) {
  return tempChannels.get(channelId);
}

// ======================================================
// 🧰 ฟังก์ชันเพิ่มเจ้าของเก่า
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
// 🧰 ฟังก์ชันตั้งสิทธิ์เจ้าของ
// ======================================================

async function setOwnerPermission(
  channel,
  userId,
  canConnect = true
) {

  if (!channel || !userId) {
    return;
  }

  await channel.permissionOverwrites
    .edit(
      userId,
      {
        ViewChannel: true,
        Connect: canConnect
      }
    )
    .catch(error => {
      console.error(
        `Owner Permission Error (${userId}):`,
        error
      );
    });
}

// ======================================================
// 🧰 ฟังก์ชันจัดการเจ้าของเก่าทั้งหมด
// ======================================================

async function updatePreviousOwners(
  channel,
  data,
  canConnect
) {

  if (
    !data ||
    !Array.isArray(data.previousOwners)
  ) {
    return;
  }

  for (
    const previousOwnerId
    of data.previousOwners
  ) {

    // ห้ามไปแก้สิทธิ์เจ้าของปัจจุบัน
    if (
      previousOwnerId === data.owner
    ) {
      continue;
    }

    await setOwnerPermission(
      channel,
      previousOwnerId,
      canConnect
    );
  }
}

// ======================================================
// 🧰 ฟังก์ชันสร้าง Permission พื้นฐาน
// ======================================================

async function resetBasicPermissions(
  channel,
  guildId
) {

  // @everyone
  await channel.permissionOverwrites
    .edit(
      guildId,
      {
        ViewChannel: true,
        Connect: false
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
}

// ======================================================
// 🟢 Bot Ready
// ======================================================

client.once("ready", async () => {

  console.log(
    `Login as: ${client.user.tag}`
  );

  console.log(
    `Allow Roles: ${
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
      "รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!"
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
          newState.member.id;

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
          const roleId
          of bigRoleIds
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
          const roleId
          of allowRoleIds
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
        // สร้างห้อง
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
        // ย้ายสมาชิกเข้าห้อง
        // ==================================================

        await newState
          .setChannel(channel)
          .catch(() => {});

        // ==================================================
        // บันทึกข้อมูลห้อง
        // ==================================================

        tempChannels.set(
          channel.id,
          {

            // เจ้าของปัจจุบัน
            owner: ownerId,

            // เจ้าของเก่าทั้งหมด
            previousOwners: [],

            // สถานะ Lock
            locked: false,

            // Permission ก่อน Hide
            savedPermissions: null
          }
        );

        console.log(
          `สร้างห้อง ${channel.id} เจ้าของ ${ownerId}`
        );

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
            `ลบห้อง ${oldState.channelId}`
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

            .setColor(0x2b2d31);

        // ==================================================
        // ปุ่มแถวที่ 1
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
        // ปุ่มแถวที่ 2
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
          embeds: [embed],
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

        if (!channel) {

          return interaction.reply({
            content:
              "❌ คุณต้องอยู่ในห้องเสียงก่อน",
            ephemeral: true
          });
        }

        const data =
          getRoomData(channel.id);

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

        // ==================================================
        // 🔐 ตรวจเจ้าของปัจจุบัน
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
        // ✏️ เปลี่ยนชื่อ
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
              .setRequired(true);

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
              .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(input)
          );

          return interaction.showModal(
            modal
          );
        }

        // ==================================================
        // 🧑‍🤝‍🧑 Allow / Deny / Transfer
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
                .addComponents(menu)
            ],

            ephemeral: true
          });
        }

        // ==================================================
        // Defer
        // ==================================================

        await interaction.deferReply({
          ephemeral: true
        });

        // ==================================================
        // 🔒 LOCK
        // ==================================================

        if (
          interaction.customId ===
          "lock"
        ) {

          data.locked = true;

          // @everyone
          await channel.permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                ViewChannel: true,
                Connect: false
              }
            )
            .catch(() => {});

          // ยศที่อนุญาต
          for (
            const roleId
            of allowRoleIds
          ) {

            await channel.permissionOverwrites
              .edit(
                roleId,
                {
                  ViewChannel: true,
                  Connect: false
                }
              )
              .catch(() => {});
          }

          // เจ้าของเก่าทั้งหมด
          await updatePreviousOwners(
            channel,
            data,
            false
          );

          // เจ้าของปัจจุบัน
          await setOwnerPermission(
            channel,
            data.owner,
            true
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

          data.locked = false;

          // @everyone
          await channel.permissionOverwrites
            .edit(
              interaction.guild.id,
              {
                ViewChannel: true,
                Connect: false
              }
            )
            .catch(() => {});

          // ยศที่อนุญาต
          for (
            const roleId
            of allowRoleIds
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

          // เจ้าของเก่ากลับเข้าได้
          await updatePreviousOwners(
            channel,
            data,
            true
          );

          // เจ้าของปัจจุบัน
          await setOwnerPermission(
            channel,
            data.owner,
            true
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

            await channel.permissionOverwrites
              .set(permissions);

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

          if (
            data.savedPermissions
          ) {

            try {

              await channel.permissionOverwrites
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
              `✅ อนุญาตให้ <@${targetId}> มองเห็นและเข้าห้องได้แล้ว`,

            ephemeral: true
          });
        }

        // ==================================================
        // 🚫 DENY
        // ==================================================

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
              `🚫 บล็อก <@${targetId}> ไม่ให้เข้าห้องเรียบร้อยแล้ว`,

            ephemeral: true
          });
        }

        // ==================================================
        // 🔁 TRANSFER OWNER
        // ==================================================

        if (
          interaction.customId ===
          "select_transfer"
        ) {

          // ----------------------------------------------
          // ห้ามโอนให้ตัวเอง
          // ----------------------------------------------

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

          // ----------------------------------------------
          // ตรวจว่า target เป็นสมาชิกในเซิร์ฟเวอร์
          // ----------------------------------------------

          const targetMember =
            await interaction.guild.members
              .fetch(targetId)
              .catch(() => null);

          if (!targetMember) {

            return interaction.reply({
              content:
                "❌ ไม่พบสมาชิกที่ต้องการโอนห้องให้",
              ephemeral: true
            });
          }

          const oldOwnerId =
            data.owner;

          // ----------------------------------------------
          // เก็บเจ้าของเดิม
          // ----------------------------------------------

          addPreviousOwner(
            data,
            oldOwnerId
          );

          // ----------------------------------------------
          // เปลี่ยนเจ้าของ
          // ----------------------------------------------

          data.owner =
            targetId;

          // ----------------------------------------------
          // เจ้าของเดิม
          // ----------------------------------------------

          await setOwnerPermission(
            channel,
            oldOwnerId,
            !data.locked
          );

          // ----------------------------------------------
          // เจ้าของใหม่
          // ----------------------------------------------

          await setOwnerPermission(
            channel,
            targetId,
            true
          );

          // ----------------------------------------------
          // ถ้าห้อง Lock อยู่
          // ให้เจ้าของเก่าทั้งหมดเข้าไม่ได้
          // ----------------------------------------------

          if (
            data.locked
          ) {

            await updatePreviousOwners(
              channel,
              data,
              false
            );

            // เปิดให้เจ้าของใหม่
            await setOwnerPermission(
              channel,
              data.owner,
              true
            );
          }

          // ----------------------------------------------
          // เปลี่ยนชื่อห้อง
          // ----------------------------------------------

          await channel
            .setName(
              `📍・ห้องส่วนตัวของ ${targetMember.user.username}`
            )
            .catch(() => {});

          // ----------------------------------------------
          // แจ้งผล
          // ----------------------------------------------

          return interaction.reply({

            content:
              `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้ว`,

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

          await channel
            .setName(
              name.trim()
            )
            .catch(() => {});

          return interaction.reply({

            content:
              `✏️ เปลี่ยนชื่อห้องเป็น **${name.trim()}** เรียบร้อยแล้ว`,

            ephemeral: true
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

          await channel
            .setUserLimit(
              limit
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

  client.login(token);
}
