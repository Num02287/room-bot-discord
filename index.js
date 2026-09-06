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
// WEB SERVER สำหรับ Render / Cloud
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
// เก็บข้อมูลห้องชั่วคราว
// =====================================================

const tempChannels = new Map();

// =====================================================
// SLASH COMMAND
// =====================================================

const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("เปิดแผงควบคุมห้องส่วนตัว")
    .setDMPermission(false)
].map(command => command.toJSON());

const rest = new REST({
  version: "10"
}).setToken(token);

// =====================================================
// BOT READY
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
      "❌ ติดตั้ง Slash Command ไม่สำเร็จ:",
      error
    );

  }

});

// =====================================================
// ระบบสร้างห้องอัตโนมัติ
// =====================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // =================================================
    // สมาชิกเข้าช่องสร้างห้อง
    // =================================================

    if (newState.channelId === createChannelId) {

      const guild = newState.guild;
      const member = newState.member;

      if (!member) return;

      const ownerId = member.id;

      // =================================================
      // ตรวจสอบ Category
      // =================================================

      const category =
        guild.channels.cache.get(categoryId);

      if (!category) {

        console.error(
          "❌ ไม่พบ CATEGORY_ID"
        );

        return;
      }

      // =================================================
      // Permission
      //
      // @everyone = ทุกคนสามารถเข้าห้องได้
      // =================================================

      const permissionOverwrites = [

        {
          id: guild.id,

          allow: [
            "ViewChannel",
            "Connect",
            "Speak"
          ]
        },

        // เจ้าของห้อง
        {
          id: ownerId,

          allow: [
            "ViewChannel",
            "Connect",
            "Speak"
          ]
        },

        // Bot
        {
          id: client.user.id,

          allow: [
            "ViewChannel",
            "Connect",
            "Speak",
            "ManageChannels",
            "MoveMembers"
          ]
        }

      ];

      // =================================================
      // ALLOW ROLE
      // =================================================

      if (allowRoleId) {

        permissionOverwrites.push({

          id: allowRoleId,

          allow: [
            "ViewChannel",
            "Connect",
            "Speak"
          ]

        });

      }

      // =================================================
      // สร้างห้อง
      // =================================================

      const channel =
        await guild.channels.create({

          name:
            `🏠・ห้องส่วนตัวของ ${member.user.username}`,

          type:
            ChannelType.GuildVoice,

          parent:
            categoryId,

          permissionOverwrites:
            permissionOverwrites

        });

      // =================================================
      // บันทึกเจ้าของ
      // =================================================

      tempChannels.set(
        channel.id,
        {
          owner: ownerId
        }
      );

      // =================================================
      // ย้ายคนสร้างเข้าห้อง
      // =================================================

      await newState
        .setChannel(channel)
        .catch(() => {});

      console.log(
        `🏠 สร้างห้อง ${channel.name}`
      );

      return;
    }

    // =================================================
    // ตรวจสอบห้องชั่วคราว
    // ถ้าห้องไม่มีคน = ลบ
    // =================================================

    if (
      oldState.channelId &&
      tempChannels.has(oldState.channelId)
    ) {

      const channel =
        await oldState.guild.channels
          .fetch(oldState.channelId)
          .catch(() => null);

      // ห้องถูกลบไปแล้ว
      if (!channel) {

        tempChannels.delete(
          oldState.channelId
        );

        return;
      }

      // ห้องไม่มีคน
      if (channel.members.size === 0) {

        await channel
          .delete()
          .catch(() => {});

        tempChannels.delete(
          oldState.channelId
        );

        console.log(
          `🗑️ ลบห้อง ${channel.name}`
        );

        return;
      }

    }

  } catch (error) {

    console.error(
      "❌ Error in voiceStateUpdate:",
      error
    );

  }

});

// =====================================================
// INTERACTION CREATE
// =====================================================

client.on("interactionCreate", async interaction => {

  try {

    // =================================================
    // /ROOM
    // =================================================

    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "room"
    ) {

      const embed = new EmbedBuilder()

        .setTitle(
          "🏠 ระบบสร้างห้องส่วนตัวประจำโซน"
        )

        .setDescription(
          "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
          "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n" +
          "🔹 สมาชิกทุกยศสามารถเข้าห้องได้\n\n" +

          "📌 **ระบบควบคุมห้อง**\n" +
          "✏️ เปลี่ยนชื่อห้อง\n" +
          "🔒 ล็อกห้อง\n" +
          "🔓 ปลดล็อกห้อง\n" +
          "🎯 จำกัดจำนวนคน\n" +
          "👑 ดูเจ้าของห้อง\n" +
          "🙈 ซ่อนห้อง\n" +
          "👁️ แสดงห้อง\n" +
          "🔁 โอนเจ้าของ\n" +
          "🧑‍🤝‍🧑 อนุญาตสมาชิก\n" +
          "🚫 บล็อกสมาชิก"
        )

        .setImage(
          "https://i.ibb.co/Kjbw5BGb/image.png"
        )

        .setFooter({
          text:
            "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        })

        .setColor(0x2b2d31);

      // =================================================
      // ROW 1
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
      // ROW 2
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
      // ส่ง Embed + ปุ่ม
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

      await interaction.reply({

        content:
          "✅ สร้างแผงควบคุมเรียบร้อยแล้ว",

        ephemeral: true

      });

      await interaction
        .deleteReply()
        .catch(() => {});

      return;
    }

    // =================================================
    // BUTTONS
    // =================================================

    if (interaction.isButton()) {

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
      // ตรวจสอบเจ้าของห้อง
      // =================================================

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

      // =================================================
      // RENAME
      // =================================================

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
      // LIMIT
      // =================================================

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
            "🎯 โปรดเลือกสมาชิกจากเมนูด้านล่าง",

          components: [

            new ActionRowBuilder()
              .addComponents(menu)

          ],

          ephemeral: true

        });

      }

      // =================================================
      // DEFER
      // =================================================

      await interaction.deferReply({
        ephemeral: true
      });

      // =================================================
      // LOCK
      // =================================================

      if (
        interaction.customId ===
        "lock"
      ) {

        // ปิด Connect ของ @everyone
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              Connect: false
            }
          )
          .catch(() => {});

        // ปิด Connect ของ ALLOW ROLE
        if (allowRoleId) {

          await channel.permissionOverwrites
            .edit(
              allowRoleId,
              {
                Connect: false
              }
            )
            .catch(() => {});

        }

        return interaction.editReply({

          content:
            "🔒 ล็อกห้องเรียบร้อยแล้ว\n" +
            "เจ้าของห้องยังสามารถเข้าห้องได้"

        });

      }

      // =================================================
      // UNLOCK
      // =================================================

      if (
        interaction.customId ===
        "unlock"
      ) {

        // เปิดให้ @everyone เข้าห้อง
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: true
            }
          )
          .catch(() => {});

        // ALLOW ROLE
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

        return interaction.editReply({

          content:
            "🔓 ปลดล็อกห้องเรียบร้อยแล้ว\n" +
            "ทุกยศสามารถเข้าห้องได้"

        });

      }

      // =================================================
      // HIDE
      // =================================================

      if (
        interaction.customId ===
        "hide"
      ) {

        const permissions = [

          {
            id: interaction.guild.id,

            deny: [
              "ViewChannel",
              "Connect"
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

          {
            id: data.owner,

            allow: [
              "ViewChannel",
              "Connect"
            ]

          }

        ];

        // ยศใหญ่ที่ยังมองเห็นได้
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

        bigRoleIds.forEach(
          roleId => {

            permissions.push({

              id: roleId,

              allow: [
                "ViewChannel"
              ]

            });

          }
        );

        await channel.permissionOverwrites
          .set(permissions)
          .catch(console.error);

        return interaction.editReply({

          content:
            "🙈 ซ่อนห้องเรียบร้อยแล้ว"

        });

      }

      // =================================================
      // SHOW
      // =================================================

      if (
        interaction.customId ===
        "show"
      ) {

        // เปิดให้ทุกคนเห็นและเข้าได้
        await channel.permissionOverwrites
          .edit(
            interaction.guild.id,
            {
              ViewChannel: true,
              Connect: true
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

        // Allow Role
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

        return interaction.editReply({

          content:
            "👁️ แสดงห้องเรียบร้อยแล้ว\n" +
            "ทุกยศสามารถเข้าห้องได้"

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
            "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของเท่านั้น",

          ephemeral: true

        });

      }

      const targetId =
        interaction.values[0];

      // =================================================
      // ALLOW MEMBER
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
            `✅ อนุญาตให้ <@${targetId}> ` +
            `มองเห็นและเข้าห้องได้แล้วครับ`,

          ephemeral: true

        });

      }

      // =================================================
      // DENY MEMBER
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
            `🚫 บล็อก <@${targetId}> ` +
            `ไม่ให้เข้าห้องเรียบร้อยแล้ว`,

          ephemeral: true

        });

      }

      // =================================================
      // TRANSFER OWNER
      // =================================================

      if (
        interaction.customId ===
        "select_transfer"
      ) {

        data.owner = targetId;

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

        return interaction.reply({

          content:
            `🔁 โอนความเป็นเจ้าของห้องให้ ` +
            `<@${targetId}> เรียบร้อยแล้วครับ`,

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
        data.owner !==
          interaction.member.id
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

        await channel
          .setUserLimit(limit)
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

});

// =====================================================
// LOGIN
// =====================================================

client.login(token);
