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
// 🏠 เก็บข้อมูลห้องชั่วคราว
// ======================================================

const tempChannels = new Map();

// ======================================================
// 💾 จำชื่อห้องของสมาชิก
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
// 🔧 ฟังก์ชันชื่อห้องเริ่มต้น
// ======================================================

function getDefaultRoomName(username) {
  return `ห้องส่วนตัวของ ${username}`;
}

// ======================================================
// 🔧 ฟังก์ชันอ่านข้อความ Error
// ======================================================

function getErrorMessage(error) {
  return (
    error?.rawError?.message ||
    error?.message ||
    "ไม่ทราบสาเหตุ"
  );
}

// ======================================================
// 🔧 ดึงห้องส่วนตัวที่สมาชิกเป็นเจ้าของ
// ======================================================

function getOwnedTempRoom(interaction) {
  const member = interaction.member;

  if (!member) {
    return null;
  }

  const channel = member.voice?.channel;

  if (!channel) {
    return null;
  }

  const data = tempChannels.get(channel.id);

  if (!data) {
    return null;
  }

  if (data.owner !== member.id) {
    return null;
  }

  return {
    channel,
    data
  };
}

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
      "🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!"
    );

  } catch (err) {

    console.error(
      "❌ Slash Command Error:",
      err
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

      // ====================================================
      // 1. สมาชิกเข้าห้องสร้างห้อง
      // ====================================================

      if (
        newState.channelId === createChannelId &&
        oldState.channelId !== createChannelId
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
        // 🧑‍🤝‍🧑 เพิ่มสิทธิ์ยศที่ตั้งค่าใน Render
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
        // 💾 ตรวจสอบชื่อเดิม
        // ==================================================

        const savedName =
          savedRoomNames.get(ownerId);

        // ==================================================
        // 🏠 ชื่อเริ่มต้น
        // ==================================================

        const defaultName =
          getDefaultRoomName(
            newState.member.user.username
          );

        // ==================================================
        // 🏠 ชื่อห้อง
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
          .catch(error => {
            console.error(
              "Move member error:",
              error
            );
          });

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

      // ====================================================
      // 2. ลบห้องเมื่อไม่มีคน
      // ====================================================

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
            `🗑️ ลบห้อง ${oldState.channelId} เนื่องจากไม่มีสมาชิก`
          );

          // ไม่ลบ savedRoomNames
          // เพื่อให้ชื่อเดิมกลับมาเมื่อสร้างห้องใหม่

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

        await interaction.deleteReply();

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
          member?.voice?.channel;

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
        // ข้อมูลห้อง
        // ==================================================

        const data =
          tempChannels.get(
            channel.id
          );

        // ==================================================
        // 👑 ตรวจสอบเจ้าของ
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
                  p => ({

                    id:
                      p.id,

                    type:
                      p.type,

                    allow:
                      BigInt(p.allow),

                    deny:
                      BigInt(p.deny)

                  })
                )

              );

              delete data.savedPermissions;

            } catch (error) {

              console.error(
                "Show Room Error:",
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
          interaction.member?.voice?.channel;

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

            await channel.permissionOverwrites.edit(

              targetId,

              {
                Connect: true,
                ViewChannel: true
              }

            );

          } catch (error) {

            console.error(
              "Allow Error:",
              error
            );

            return interaction.reply({

              content:
                `❌ ไม่สามารถอนุญาตสมาชิกได้\n${getErrorMessage(error)}`,

              ephemeral: true

            });

          }

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
          interaction.customId === "select_deny"
        ) {

          try {

            await channel.permissionOverwrites.edit(

              targetId,

              {
                Connect: false
              }

            );

          } catch (error) {

            console.error(
              "Deny Error:",
              error
            );

            return interaction.reply({

              content:
                `❌ ไม่สามารถบล็อกสมาชิกได้\n${getErrorMessage(error)}`,

              ephemeral: true

            });

          }

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
          interaction.customId === "select_transfer"
        ) {

          // ------------------------------------------------
          // ป้องกันโอนให้ตัวเอง
          // ------------------------------------------------

          if (
            targetId === interaction.member.id
          ) {

            return interaction.reply({

              content:
                "❌ ไม่สามารถโอนห้องให้ตัวเองได้",

              ephemeral: true

            });

          }

          // ------------------------------------------------
          // เจ้าของเดิม
          // ------------------------------------------------

          const oldOwnerId =
            data.owner;

          // ------------------------------------------------
          // ⭐ สำคัญ
          // บันทึกชื่อห้องปัจจุบันเอาไว้
          // ------------------------------------------------

          const currentRoomName =
            channel.name;

          // ------------------------------------------------
          // เปลี่ยนเจ้าของทันที
          // ------------------------------------------------

          data.owner =
            targetId;

          // ------------------------------------------------
          // ⭐ ให้เจ้าของใหม่จำชื่อห้องปัจจุบัน
          // ------------------------------------------------

          savedRoomNames.set(
            targetId,
            currentRoomName
          );

          // ------------------------------------------------
          // ลบชื่อที่ผูกกับเจ้าของเดิม
          // ------------------------------------------------

          savedRoomNames.delete(
            oldOwnerId
          );

          // ------------------------------------------------
          // ให้สิทธิ์เจ้าของใหม่
          // ------------------------------------------------

          try {

            await channel.permissionOverwrites.edit(

              targetId,

              {
                Connect: true,
                ViewChannel: true
              }

            );

          } catch (error) {

            console.error(
              "Transfer Permission Error:",
              error
            );

          }

          // ------------------------------------------------
          // ตรวจสอบเจ้าของใหม่
          // ------------------------------------------------

          const targetMember =
            await interaction.guild.members
              .fetch(targetId)
              .catch(() => null);

          if (targetMember) {

            console.log(
              `🔁 โอนห้องจาก ${oldOwnerId} ไป ${targetId}`
            );

          }

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

        // ==================================================
        // ✏️ RENAME ROOM
        // ==================================================

        if (
          interaction.customId === "rename_room"
        ) {

          // ==================================================
          // ⭐ ตอบ Discord ทันที
          // ป้องกัน Interaction Failed
          // ==================================================

          await interaction.deferReply({
            ephemeral: true
          });

          try {

            // ------------------------------------------------
            // สมาชิก
            // ------------------------------------------------

            const member =
              interaction.member;

            // ------------------------------------------------
            // ห้องเสียงปัจจุบัน
            // ------------------------------------------------

            const channel =
              member?.voice?.channel;

            if (!channel) {

              return interaction.editReply({

                content:
                  "❌ คุณต้องอยู่ในห้องเสียงก่อน"

              });

            }

            // ------------------------------------------------
            // ดึงข้อมูลห้อง
            // ------------------------------------------------

            const data =
              tempChannels.get(
                channel.id
              );

            if (!data) {

              return interaction.editReply({

                content:
                  "❌ ห้องนี้ไม่ได้อยู่ในระบบห้องชั่วคราว"

              });

            }

            // ------------------------------------------------
            // ⭐ ตรวจสอบเจ้าของปัจจุบัน
            // ------------------------------------------------

            if (
              data.owner !== member.id
            ) {

              return interaction.editReply({

                content:
                  "❌ คุณไม่ใช่เจ้าของห้องนี้"

              });

            }

            // ------------------------------------------------
            // อ่านชื่อใหม่
            // ------------------------------------------------

            let name = "";

            try {

              name =
                interaction.fields
                  .getTextInputValue(
                    "room_name"
                  )
                  ?.trim() || "";

            } catch (error) {

              console.error(
                "Get room name error:",
                error
              );

              return interaction.editReply({

                content:
                  "❌ ไม่สามารถอ่านชื่อห้องจากแบบฟอร์มได้"

              });

            }

            console.log(
              `✏️ Rename request from ${member.user.tag}: "${name}"`
            );

            // ==================================================
            // 🔄 รีเซ็ตชื่อ
            // ==================================================

            if (!name) {

              const defaultName =
                getDefaultRoomName(
                  member.user.username
                );

              console.log(
                `🔄 Reset room name: ${defaultName}`
              );

              // ------------------------------------------------
              // เปลี่ยนชื่อห้องก่อน
              // ------------------------------------------------

              try {

                await channel.setName(
                  defaultName,
                  "Reset room name"
                );

              } catch (error) {

                console.error(
                  "Reset room name error:",
                  error
                );

                return interaction.editReply({

                  content:
                    `❌ ไม่สามารถรีเซ็ตชื่อห้องได้\n${getErrorMessage(error)}`

                });

              }

              // ------------------------------------------------
              // ลบชื่อที่บันทึกไว้ของเจ้าของใหม่
              // ------------------------------------------------

              savedRoomNames.delete(
                member.id
              );

              return interaction.editReply({

                content:
                  `🔄 รีเซ็ตชื่อห้องเป็น **${defaultName}** เรียบร้อยแล้ว`

              });

            }

            // ==================================================
            // ✏️ เปลี่ยนชื่อห้อง
            // ==================================================

            try {

              await channel.setName(
                name,
                "Room owner changed room name"
              );

            } catch (error) {

              console.error(
                "Change room name error:",
                error
              );

              return interaction.editReply({

                content:
                  `❌ ไม่สามารถเปลี่ยนชื่อห้องได้\n${getErrorMessage(error)}`

              });

            }

            // ------------------------------------------------
            // บันทึกชื่อหลังเปลี่ยนสำเร็จ
            // ------------------------------------------------

            savedRoomNames.set(
              member.id,
              name
            );

            console.log(
              `✅ เปลี่ยนชื่อห้องสำเร็จ: ${name}`
            );

            return interaction.editReply({

              content:
                `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`

            });

          } catch (error) {

            console.error(
              "❌ Rename Modal Error:",
              error
            );

            return interaction.editReply({

              content:
                `❌ เกิดข้อผิดพลาด\n${getErrorMessage(error)}`

            }).catch(() => {});

          }

        }

        // ==================================================
        // 🎯 LIMIT ROOM
        // ==================================================

        if (
          interaction.customId === "limit_room"
        ) {

          await interaction.deferReply({
            ephemeral: true
          });

          try {

            const member =
              interaction.member;

            const channel =
              member?.voice?.channel;

            if (!channel) {

              return interaction.editReply({

                content:
                  "❌ คุณต้องอยู่ในห้องเสียงก่อน"

              });

            }

            const data =
              tempChannels.get(
                channel.id
              );

            if (
              !data ||
              data.owner !== member.id
            ) {

              return interaction.editReply({

                content:
                  "❌ คุณไม่ใช่เจ้าของห้องนี้"

              });

            }

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

              return interaction.editReply({

                content:
                  "❌ โปรดใส่หมายเลขที่ถูกต้องระหว่าง 0 - 99"

              });

            }

            await channel.setUserLimit(
              limit
            );

            return interaction.editReply({

              content:
                `🎯 ตั้งจำนวนสมาชิกเป็น **${
                  limit === 0
                    ? "ไม่จำกัด"
                    : limit + " คน"
                }** เรียบร้อยแล้ว`

            });

          } catch (error) {

            console.error(
              "❌ Limit Modal Error:",
              error
            );

            return interaction.editReply({

              content:
                `❌ เกิดข้อผิดพลาด\n${getErrorMessage(error)}`

            }).catch(() => {});

          }

        }

      }

    } catch (err) {

      console.error(
        "❌ Interaction Error:",
        err
      );

      try {

        if (
          interaction.replied ||
          interaction.deferred
        ) {

          await interaction.editReply({

            content:
              `❌ เกิดข้อผิดพลาด\n${getErrorMessage(err)}`

          }).catch(() => {});

        } else {

          await interaction.reply({

            content:
              `❌ เกิดข้อผิดพลาด\n${getErrorMessage(err)}`,

            ephemeral: true

          }).catch(() => {});

        }

      } catch (replyError) {

        console.error(
          "❌ Reply Error:",
          replyError
        );

      }

    }

  }
);

// ======================================================
// 🚀 Login
// ======================================================

client.login(token);
