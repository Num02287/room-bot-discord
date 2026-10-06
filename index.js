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
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const express = require("express");

// =====================================================
// EXPRESS SERVER
// =====================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Discord Bot Online");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Web Server running on port ${PORT}`);
});

// =====================================================
// CONFIG
// =====================================================

const TOKEN = process.env.TOKEN;

const CREATE_CHANNEL_ID = process.env.CREATE_CHANNEL_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const ALLOW_ROLE_ID = process.env.ALLOW_ROLE_ID;

// ใส่ Role ID ที่ต้องการให้เข้าห้องได้ทุกห้อง
const bigRoleIds = [
  // "123456789012345678",
  // "987654321098765432"
];

// =====================================================
// DISCORD CLIENT
// =====================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// =====================================================
// DATA
// =====================================================

const tempChannels = new Map();

// ป้องกันการสร้างห้องซ้ำ
const creatingRooms = new Set();

// ป้องกันการโอนเจ้าของพร้อมกันหลายครั้ง
const transferringRooms = new Set();

// =====================================================
// HELPER
// =====================================================

function getRoomData(channelId) {
  return tempChannels.get(channelId);
}

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

function removePreviousOwner(data, userId) {
  if (!data.previousOwners) {
    return;
  }

  data.previousOwners =
    data.previousOwners.filter(id => id !== userId);
}

function isOwner(userId, data) {
  return data && data.owner === userId;
}

async function setMemberPermission(
  channel,
  userId,
  connect = true
) {
  if (!userId) return;

  try {
    await channel.permissionOverwrites.edit(
      userId,
      {
        ViewChannel: true,
        Connect: connect
      }
    );
  } catch (error) {
    console.error(
      `Permission Error ${userId}:`,
      error.message
    );
  }
}

// =====================================================
// READY
// =====================================================

client.once("ready", async () => {
  console.log(`🤖 Bot Online: ${client.user.tag}`);

  try {
    const rest = new REST({
      version: "10"
    }).setToken(TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: [
          {
            name: "room",
            description: "เปิดแผงควบคุมห้องส่วนตัว"
          }
        ]
      }
    );

    console.log("✅ Slash Command /room พร้อมใช้งาน");
  } catch (error) {
    console.error(
      "Slash Command Error:",
      error
    );
  }
});

// =====================================================
// VOICE STATE
// =====================================================

client.on(
  "voiceStateUpdate",
  async (oldState, newState) => {

    // =================================================
    // สร้างห้องเมื่อเข้าห้องสร้าง
    // =================================================

    if (
      newState.channelId === CREATE_CHANNEL_ID &&
      oldState.channelId !== CREATE_CHANNEL_ID
    ) {

      const userId = newState.member.id;

      // ป้องกันสร้างซ้ำ
      if (creatingRooms.has(userId)) {
        return;
      }

      creatingRooms.add(userId);

      try {

        const guild = newState.guild;
        const member = newState.member;

        // =============================================
        // สร้างห้อง
        // =============================================

        const channel =
          await guild.channels.create({
            name:
              `📍・ห้องส่วนตัวของ ${member.user.username}`,

            type: ChannelType.GuildVoice,

            parent: CATEGORY_ID,

            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,

                allow: [
                  "ViewChannel"
                ],

                deny: [
                  "Connect"
                ]
              },

              {
                id: member.id,

                allow: [
                  "ViewChannel",
                  "Connect",
                  "ManageChannels",
                  "MoveMembers"
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
              },

              ...bigRoleIds.map(roleId => ({
                id: roleId,

                allow: [
                  "ViewChannel",
                  "Connect"
                ]
              })),

              ...(ALLOW_ROLE_ID
                ? [
                    {
                      id: ALLOW_ROLE_ID,

                      allow: [
                        "ViewChannel",
                        "Connect"
                      ]
                    }
                  ]
                : [])
            ]
          });

        // =============================================
        // เก็บข้อมูลห้อง
        // =============================================

        tempChannels.set(
          channel.id,
          {
            owner: member.id,

            previousOwners: [],

            locked: false,

            hidden: false,

            savedOverwrites: null,

            allowedUsers: [],

            deniedUsers: []
          }
        );

        // =============================================
        // ย้ายสมาชิกทันที
        // =============================================

        await member.voice.setChannel(channel);

        console.log(
          `🏠 สร้างห้อง ${channel.name}`
        );

      } catch (error) {

        console.error(
          "Create Room Error:",
          error
        );

      } finally {

        creatingRooms.delete(userId);

      }
    }

    // =================================================
    // ลบห้องเมื่อไม่มีคนอยู่
    // =================================================

    if (
      oldState.channelId &&
      oldState.channelId !== CREATE_CHANNEL_ID
    ) {

      const oldChannel =
        oldState.guild.channels.cache.get(
          oldState.channelId
        );

      if (
        oldChannel &&
        oldChannel.type === ChannelType.GuildVoice &&
        tempChannels.has(oldChannel.id)
      ) {

        if (oldChannel.members.size === 0) {

          tempChannels.delete(
            oldChannel.id
          );

          try {
            await oldChannel.delete(
              "ห้องส่วนตัวไม่มีสมาชิก"
            );

            console.log(
              `🗑️ ลบห้อง ${oldChannel.name}`
            );

          } catch (error) {

            console.error(
              "Delete Room Error:",
              error.message
            );
          }
        }
      }
    }
  }
);

// =====================================================
// INTERACTION
// =====================================================

client.on(
  "interactionCreate",
  async interaction => {

    // =================================================
    // /room
    // =================================================

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "room"
    ) {

      // =================================================
      // ตอบทันที
      // =================================================

      await interaction.reply({
        content:
          "✅ กำลังเปิดระบบจัดการห้อง...",
        ephemeral: true
      });

      try {

        // =============================================
        // EMBED
        // =============================================

        const embed =
          new EmbedBuilder()
            .setColor("#00AEEF")
            .setTitle(
              "🎛️ ระบบจัดการห้องส่วนตัว"
            )
            .setDescription(
              "เลือกเมนูด้านล่างเพื่อจัดการห้องของคุณ"
            );

        // =============================================
        // ROW 1
        // =============================================

        const row1 =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId("name")
                .setLabel("เปลี่ยนชื่อ")
                .setEmoji("✏️")
                .setStyle(
                  ButtonStyle.Primary
                ),

              new ButtonBuilder()
                .setCustomId("lock")
                .setLabel("ล็อกห้อง")
                .setEmoji("🔒")
                .setStyle(
                  ButtonStyle.Danger
                ),

              new ButtonBuilder()
                .setCustomId("unlock")
                .setLabel("ปลดล็อก")
                .setEmoji("🔓")
                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()
                .setCustomId("limit")
                .setLabel("จำกัดคน")
                .setEmoji("🎯")
                .setStyle(
                  ButtonStyle.Secondary
                )
            );

        // =============================================
        // ROW 2
        // =============================================

        const row2 =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId("owner")
                .setLabel("เจ้าของห้อง")
                .setEmoji("👑")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("hide")
                .setLabel("ซ่อนห้อง")
                .setEmoji("🙈")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("show")
                .setLabel("แสดงห้อง")
                .setEmoji("👁")
                .setStyle(
                  ButtonStyle.Secondary
                ),

              new ButtonBuilder()
                .setCustomId("transfer")
                .setLabel("โอนเจ้าของ")
                .setEmoji("🔁")
                .setStyle(
                  ButtonStyle.Primary
                )
            );

        // =============================================
        // ROW 3
        // =============================================

        const row3 =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()
                .setCustomId("allow")
                .setLabel("อนุญาตสมาชิก")
                .setEmoji("🧑‍🤝‍🧑")
                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()
                .setCustomId("deny")
                .setLabel("ไม่อนุญาต")
                .setEmoji("🚫")
                .setStyle(
                  ButtonStyle.Danger
                )
            );

        // =============================================
        // ส่ง Panel
        // =============================================

        await interaction.channel.send({
          embeds: [embed],

          components: [
            row1,
            row2,
            row3
          ]
        });

        // =============================================
        // เปลี่ยนข้อความตอบ
        // =============================================

        await interaction.editReply({
          content:
            "✅ เปิดระบบจัดการห้องเรียบร้อยแล้ว"
        });

      } catch (error) {

        console.error(
          "Room Panel Error:",
          error
        );

        await interaction.editReply({
          content:
            "❌ ไม่สามารถเปิดระบบจัดการห้องได้"
        }).catch(() => {});
      }

      return;
    }

    // =================================================
    // BUTTON
    // =================================================

    if (
      interaction.isButton()
    ) {

      const channel =
        interaction.member.voice.channel;

      if (
        !channel ||
        !tempChannels.has(channel.id)
      ) {

        return interaction.reply({
          content:
            "❌ คุณไม่ได้อยู่ในห้องส่วนตัว",
          ephemeral: true
        });
      }

      const data =
        getRoomData(channel.id);

      // =================================================
      // ตรวจเจ้าของ
      // =================================================

      if (
        !isOwner(
          interaction.member.id,
          data
        )
      ) {

        return interaction.reply({
          content:
            "❌ เฉพาะเจ้าของห้องเท่านั้นที่ใช้คำสั่งนี้ได้",
          ephemeral: true
        });
      }

      // =================================================
      // NAME
      // =================================================

      if (
        interaction.customId === "name"
      ) {

        const modal =
          new ModalBuilder()
            .setCustomId("modal_name")
            .setTitle(
              "✏️ เปลี่ยนชื่อห้อง"
            );

        const input =
          new TextInputBuilder()
            .setCustomId("room_name")
            .setLabel("ชื่อห้องใหม่")
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(100);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            input
          )
        );

        return interaction.showModal(
          modal
        );
      }

      // =================================================
      // LIMIT
      // =================================================

      if (
        interaction.customId === "limit"
      ) {

        const modal =
          new ModalBuilder()
            .setCustomId("modal_limit")
            .setTitle(
              "🎯 จำกัดจำนวนสมาชิก"
            );

        const input =
          new TextInputBuilder()
            .setCustomId("room_limit")
            .setLabel(
              "จำนวนสมาชิก 0 - 99"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(2);

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            input
          )
        );

        return interaction.showModal(
          modal
        );
      }

      // =================================================
      // LOCK
      // =================================================

      if (
        interaction.customId === "lock"
      ) {

        data.locked = true;

        await Promise.allSettled([

          channel.permissionOverwrites.edit(
            interaction.guild.roles.everyone.id,
            {
              Connect: false
            }
          ),

          setMemberPermission(
            channel,
            data.owner,
            true
          ),

          ...(data.previousOwners || []).map(
            id =>
              setMemberPermission(
                channel,
                id,
                false
              )
          ),

          ...(data.allowedUsers || []).map(
            id =>
              setMemberPermission(
                channel,
                id,
                false
              )
          ),

          ...bigRoleIds.map(
            roleId =>
              channel.permissionOverwrites.edit(
                roleId,
                {
                  Connect: false
                }
              )
          ),

          ...(ALLOW_ROLE_ID
            ? [
                channel.permissionOverwrites.edit(
                  ALLOW_ROLE_ID,
                  {
                    Connect: false
                  }
                )
              ]
            : [])
        ]);

        return interaction.reply({
          content:
            "🔒 ล็อกห้องเรียบร้อยแล้ว",
          ephemeral: true
        });
      }

      // =================================================
      // UNLOCK
      // =================================================

      if (
        interaction.customId === "unlock"
      ) {

        data.locked = false;

        await Promise.allSettled([

          channel.permissionOverwrites.edit(
            interaction.guild.roles.everyone.id,
            {
              Connect: false
            }
          ),

          setMemberPermission(
            channel,
            data.owner,
            true
          ),

          ...(data.previousOwners || []).map(
            id =>
              setMemberPermission(
                channel,
                id,
                true
              )
          ),

          ...bigRoleIds.map(
            roleId =>
              channel.permissionOverwrites.edit(
                roleId,
                {
                  ViewChannel: true,
                  Connect: true
                }
              )
          ),

          ...(ALLOW_ROLE_ID
            ? [
                channel.permissionOverwrites.edit(
                  ALLOW_ROLE_ID,
                  {
                    ViewChannel: true,
                    Connect: true
                  }
                )
              ]
            : [])
        ]);

        return interaction.reply({
          content:
            "🔓 ปลดล็อกห้องเรียบร้อยแล้ว",
          ephemeral: true
        });
      }

      // =================================================
      // HIDE
      // =================================================

      if (
        interaction.customId === "hide"
      ) {

        data.savedOverwrites =
          channel.permissionOverwrites.cache.map(
            overwrite => ({
              id: overwrite.id,

              allow:
                overwrite.allow.bitfield.toString(),

              deny:
                overwrite.deny.bitfield.toString()
            })
          );

        data.hidden = true;

        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone.id,
          {
            ViewChannel: false
          }
        );

        await setMemberPermission(
          channel,
          data.owner,
          true
        );

        return interaction.reply({
          content:
            "🙈 ซ่อนห้องเรียบร้อยแล้ว",
          ephemeral: true
        });
      }

      // =================================================
      // SHOW
      // =================================================

      if (
        interaction.customId === "show"
      ) {

        data.hidden = false;

        if (
          data.savedOverwrites
        ) {

          for (
            const overwrite of
            data.savedOverwrites
          ) {

            try {

              await channel.permissionOverwrites.edit(
                overwrite.id,
                {
                  ViewChannel:
                    overwrite.allow &
                    BigInt(1024)
                      ? true
                      : overwrite.deny &
                        BigInt(1024)
                        ? false
                        : null,

                  Connect:
                    overwrite.allow &
                    BigInt(1048576)
                      ? true
                      : overwrite.deny &
                        BigInt(1048576)
                        ? false
                        : null
                }
              );

            } catch {}
          }
        }

        await setMemberPermission(
          channel,
          data.owner,
          true
        );

        return interaction.reply({
          content:
            "👁 แสดงห้องเรียบร้อยแล้ว",
          ephemeral: true
        });
      }

      // =================================================
      // OWNER
      // =================================================

      if (
        interaction.customId === "owner"
      ) {

        return interaction.reply({
          content:
            `👑 เจ้าของห้องปัจจุบันคือ <@${data.owner}>`,
          ephemeral: true
        });
      }

      // =================================================
      // ALLOW
      // =================================================

      if (
        interaction.customId === "allow"
      ) {

        const menu =
          new UserSelectMenuBuilder()
            .setCustomId(
              "select_allow"
            )
            .setPlaceholder(
              "เลือกสมาชิกที่ต้องการอนุญาต"
            )
            .setMinValues(1)
            .setMaxValues(10);

        const row =
          new ActionRowBuilder()
            .addComponents(menu);

        return interaction.reply({
          content:
            "🧑‍🤝‍🧑 เลือกสมาชิกที่ต้องการอนุญาต",
          components: [row],
          ephemeral: true
        });
      }

      // =================================================
      // DENY
      // =================================================

      if (
        interaction.customId === "deny"
      ) {

        const menu =
          new UserSelectMenuBuilder()
            .setCustomId(
              "select_deny"
            )
            .setPlaceholder(
              "เลือกสมาชิกที่ต้องการไม่อนุญาต"
            )
            .setMinValues(1)
            .setMaxValues(10);

        const row =
          new ActionRowBuilder()
            .addComponents(menu);

        return interaction.reply({
          content:
            "🚫 เลือกสมาชิกที่ต้องการไม่อนุญาต",
          components: [row],
          ephemeral: true
        });
      }

      // =================================================
      // TRANSFER
      // =================================================

      if (
        interaction.customId === "transfer"
      ) {

        const menu =
          new UserSelectMenuBuilder()
            .setCustomId(
              "select_transfer"
            )
            .setPlaceholder(
              "เลือกสมาชิกที่จะเป็นเจ้าของห้อง"
            )
            .setMinValues(1)
            .setMaxValues(1);

        const row =
          new ActionRowBuilder()
            .addComponents(menu);

        return interaction.reply({
          content:
            "🔁 เลือกสมาชิกที่จะเป็นเจ้าของห้องใหม่",
          components: [row],
          ephemeral: true
        });
      }
    }

    // =================================================
    // USER SELECT
    // =================================================

    if (
      interaction.isUserSelectMenu()
    ) {

      const channel =
        interaction.member.voice.channel;

      if (
        !channel ||
        !tempChannels.has(channel.id)
      ) {

        return interaction.reply({
          content:
            "❌ คุณไม่ได้อยู่ในห้องส่วนตัว",
          ephemeral: true
        });
      }

      const data =
        getRoomData(channel.id);

      if (
        !isOwner(
          interaction.member.id,
          data
        )
      ) {

        return interaction.reply({
          content:
            "❌ เฉพาะเจ้าของห้องเท่านั้น",
          ephemeral: true
        });
      }

      // =================================================
      // ALLOW SELECT
      // =================================================

      if (
        interaction.customId === "select_allow"
      ) {

        const users =
          interaction.values;

        for (
          const userId of users
        ) {

          await setMemberPermission(
            channel,
            userId,
            true
          );

          if (
            !data.allowedUsers.includes(
              userId
            )
          ) {

            data.allowedUsers.push(
              userId
            );
          }

          data.deniedUsers =
            data.deniedUsers.filter(
              id => id !== userId
            );
        }

        return interaction.update({
          content:
            `🧑‍🤝‍🧑 อนุญาต ${users.length} คนเรียบร้อยแล้ว`,
          components: []
        });
      }

      // =================================================
      // DENY SELECT
      // =================================================

      if (
        interaction.customId === "select_deny"
      ) {

        const users =
          interaction.values;

        for (
          const userId of users
        ) {

          await setMemberPermission(
            channel,
            userId,
            false
          );

          if (
            !data.deniedUsers.includes(
              userId
            )
          ) {

            data.deniedUsers.push(
              userId
            );
          }

          data.allowedUsers =
            data.allowedUsers.filter(
              id => id !== userId
            );
        }

        return interaction.update({
          content:
            `🚫 ไม่อนุญาต ${users.length} คนเรียบร้อยแล้ว`,
          components: []
        });
      }

      // =================================================
      // TRANSFER SELECT
      // =================================================

      if (
        interaction.customId === "select_transfer"
      ) {

        const targetId =
          interaction.values[0];

        // ป้องกันโอนซ้อน
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

        // ห้ามโอนให้ตัวเอง
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

        transferringRooms.add(
          channel.id
        );

        // =================================================
        // ตอบ Interaction ทันที
        // =================================================

        await interaction.deferUpdate();

        const oldOwnerId =
          data.owner;

        try {

          const targetMember =
            interaction.guild.members.cache.get(
              targetId
            ) ||
            await interaction.guild.members
              .fetch(targetId)
              .catch(() => null);

          if (!targetMember) {

            return interaction.followUp({
              content:
                "❌ ไม่พบสมาชิกที่ต้องการโอน",
              ephemeral: true
            });
          }

          // =============================================
          // เก็บเจ้าของเก่า
          // =============================================

          addPreviousOwner(
            data,
            oldOwnerId
          );

          // ถ้าคนนี้เคยเป็นเจ้าของ
          // แล้วกลับมาเป็นเจ้าของอีกครั้ง
          // ให้เอาออกจาก previousOwners

          removePreviousOwner(
            data,
            targetId
          );

          // =============================================
          // เปลี่ยนเจ้าของ
          // =============================================

          data.owner =
            targetId;

          const oldOwnerCanConnect =
            data.locked
              ? false
              : true;

          // =============================================
          // Permission
          // =============================================

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

          // =============================================
          // เปลี่ยนชื่อห้องทุกครั้ง
          // =============================================

          await channel.setName(
            `📍・ห้องส่วนตัวของ ${targetMember.user.username}`
          );

          // =============================================
          // แจ้งผล
          // =============================================

          return interaction.followUp({
            content:
              `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้ว`,
            ephemeral: true
          });

        } catch (error) {

          console.error(
            "Transfer Error:",
            error
          );

          // คืนเจ้าของเดิม
          data.owner =
            oldOwnerId;

          return interaction.followUp({
            content:
              "❌ ไม่สามารถโอนเจ้าของได้ กรุณาลองใหม่",
            ephemeral: true
          });

        } finally {

          transferringRooms.delete(
            channel.id
          );
        }
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

      if (
        !channel ||
        !tempChannels.has(channel.id)
      ) {

        return interaction.reply({
          content:
            "❌ คุณไม่ได้อยู่ในห้องส่วนตัว",
          ephemeral: true
        });
      }

      const data =
        getRoomData(channel.id);

      if (
        !isOwner(
          interaction.member.id,
          data
        )
      ) {

        return interaction.reply({
          content:
            "❌ เฉพาะเจ้าของห้องเท่านั้น",
          ephemeral: true
        });
      }

      // =================================================
      // RENAME
      // =================================================

      if (
        interaction.customId === "modal_name"
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

          return interaction.reply({
            content:
              "✏️ เปลี่ยนชื่อห้องเรียบร้อยแล้ว",
            ephemeral: true
          });

        } catch (error) {

          console.error(
            "Rename Error:",
            error
          );

          return interaction.reply({
            content:
              "❌ ไม่สามารถเปลี่ยนชื่อห้องได้",
            ephemeral: true
          });
        }
      }

      // =================================================
      // LIMIT
      // =================================================

      if (
        interaction.customId === "modal_limit"
      ) {

        const value =
          interaction.fields
            .getTextInputValue(
              "room_limit"
            )
            .trim();

        const limit =
          Number(value);

        if (
          !Number.isInteger(limit) ||
          limit < 0 ||
          limit > 99
        ) {

          return interaction.reply({
            content:
              "❌ กรุณาใส่ตัวเลข 0 - 99",
            ephemeral: true
          });
        }

        try {

          await channel.setUserLimit(
            limit
          );

          return interaction.reply({
            content:
              `🎯 ตั้งจำนวนสมาชิกสูงสุดเป็น ${limit === 0 ? "ไม่จำกัด" : limit + " คน"}`,
            ephemeral: true
          });

        } catch (error) {

          console.error(
            "Limit Error:",
            error
          );

          return interaction.reply({
            content:
              "❌ ไม่สามารถตั้งจำนวนสมาชิกได้",
            ephemeral: true
          });
        }
      }
    }
  }
);

// =====================================================
// LOGIN
// =====================================================

client.login(TOKEN);
