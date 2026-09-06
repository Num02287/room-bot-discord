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
  TextInputStyle,
  PermissionFlagsBits
} = require("discord.js");

const express = require("express");

// ===== Web Server สำหรับรันบน Cloud (เช่น Render) =====
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web Server is ready.");
});

// ===== ดึงข้อมูลจาก Environment Variables =====
const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

const tempChannels = new Map();

// =====================================================
// ฟังก์ชันหายศที่มีสิทธิ์เข้า Category
// =====================================================
function getCategoryAllowedRoles(guild, category) {
  const allowedRoles = [];

  if (!category) return allowedRoles;

  for (const role of guild.roles.cache.values()) {
    // ไม่เอา @everyone
    if (role.id === guild.id) continue;

    try {
      const permissions = category.permissionsFor(role);

      if (
        permissions &&
        permissions.has(PermissionFlagsBits.ViewChannel) &&
        permissions.has(PermissionFlagsBits.Connect)
      ) {
        allowedRoles.push(role.id);
      }
    } catch (err) {
      // ข้ามยศที่ตรวจสอบไม่ได้
    }
  }

  return allowedRoles;
}

// =====================================================
// ฟังก์ชันตั้งสิทธิ์ห้อง "กดเข้าห้องนี้"
// @everyone + ทุกยศเข้าไม่ได้
// =====================================================
async function setupCreateChannelPermissions(guild) {
  try {
    const createChannel = await guild.channels
      .fetch(createChannelId)
      .catch(() => null);

    if (!createChannel) {
      console.log("⚠️ ไม่พบ CREATE_CHANNEL_ID");
      return;
    }

    if (createChannel.type !== ChannelType.GuildVoice) {
      console.log("⚠️ CREATE_CHANNEL_ID ไม่ใช่ห้องเสียง");
      return;
    }

    const permissions = [
      {
        id: guild.id,
        deny: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect
        ]
      }
    ];

    // ปิดการเข้าห้องสำหรับทุกยศ
    for (const role of guild.roles.cache.values()) {
      if (role.id === guild.id) continue;

      permissions.push({
        id: role.id,
        deny: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect
        ]
      });
    }

    // บอทต้องมองเห็นและจัดการห้องได้
    permissions.push({
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers
      ]
    });

    await createChannel.permissionOverwrites.set(permissions);

    console.log("🔒 ตั้งค่าห้องกดเข้าห้องนี้เรียบร้อยแล้ว");
  } catch (error) {
    console.error("Create Channel Permission Error:", error);
  }
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

const rest = new REST({ version: "10" }).setToken(token);

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

    console.log("🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!");

    // ตั้งสิทธิ์ห้องกดเข้าห้องนี้
    for (const guild of client.guilds.cache.values()) {
      await setupCreateChannelPermissions(guild);
    }

  } catch (err) {
    console.error(err);
  }
});

// =====================================================
// ระบบสร้างห้องและลบห้องอัตโนมัติ
// =====================================================
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {

    // =================================================
    // 1. สมาชิกเข้าห้องสร้างห้อง
    // =================================================
    if (newState.channelId === createChannelId) {

      const guild = newState.guild;
      const guildId = guild.id;
      const ownerId = newState.member.id;

      // หา Category
      const category = await guild.channels
        .fetch(categoryId)
        .catch(() => null);

      // หา Role ที่มีสิทธิ์เข้า Category
      const categoryAllowedRoles = getCategoryAllowedRoles(
        guild,
        category
      );

      // ===============================================
      // Permission ห้องส่วนตัว
      // ===============================================
      const permissionOverwrites = [

        // @everyone เข้าไม่ได้
        {
          id: guildId,
          deny: [
            PermissionFlagsBits.Connect
          ],
          allow: [
            PermissionFlagsBits.ViewChannel
          ]
        },

        // เจ้าของห้อง
        {
          id: ownerId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect
          ]
        },

        // บอท
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers
          ]
        }
      ];

      // ===============================================
      // ให้ยศที่มีสิทธิ์เข้า Category เข้าห้องส่วนตัวได้
      // ===============================================
      for (const roleId of categoryAllowedRoles) {

        // ไม่ใส่ยศของเจ้าของซ้ำ
        if (roleId === ownerId) continue;

        permissionOverwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.Connect
          ]
        });
      }

      // ===============================================
      // allowRoleId เดิม
      // ===============================================
      if (allowRoleId) {

        const alreadyExists =
          permissionOverwrites.some(
            p => p.id === allowRoleId
          );

        if (!alreadyExists) {
          permissionOverwrites.push({
            id: allowRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect
            ]
          });
        }
      }

      // ===============================================
      // สร้างห้อง
      // ===============================================
      const channel = await guild.channels.create({
        name: `ห้องส่วนตัวของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites
      });

      // ย้ายเจ้าของเข้าห้อง
      await newState.setChannel(channel).catch(() => {});

      // บันทึกเจ้าของ
      tempChannels.set(channel.id, {
        owner: ownerId
      });

      console.log(
        `🏠 สร้างห้อง ${channel.name} ให้ ${newState.member.user.username}`
      );

      return;
    }

    // =================================================
    // 2. ขาออกจากห้องชั่วคราว
    // =================================================
    if (
      oldState.channelId &&
      tempChannels.has(oldState.channelId)
    ) {

      const channel = await oldState.guild.channels
        .fetch(oldState.channelId)
        .catch(() => null);

      // ถ้าไม่มีคนอยู่แล้ว ให้ลบห้อง
      if (!channel || channel.members.size === 0) {

        if (channel) {
          await channel.delete().catch(() => {});
        }

        tempChannels.delete(oldState.channelId);

        return;
      }
    }

  } catch (error) {
    console.error(
      "Error in voiceStateUpdate:",
      error
    );
  }
});

// =====================================================
// Interaction Create
// =====================================================
client.on("interactionCreate", async interaction => {

  try {

    // =================================================
    // /room
    // =================================================
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "room"
    ) {

      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
        .setDescription(
          "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
          "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n" +
          "🔹 **หมายเหตุ :** สมาชิกที่มียศพิเศษจะสามารถเข้าห้องนี้ได้ทันที"
        )
        .setImage("https://i.ibb.co/Kjbw5BGb/image.png")
        .setFooter({
          text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        })
        .setColor(0x2b2d31);

      const row1 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("name")
          .setEmoji("✏️")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("lock")
          .setEmoji("🔒")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("unlock")
          .setEmoji("🔓")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("limit")
          .setEmoji("🎯")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("owner")
          .setEmoji("👑")
          .setStyle(ButtonStyle.Secondary)

      );

      const row2 = new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId("hide")
          .setEmoji("🙈")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("show")
          .setEmoji("👁")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("transfer")
          .setEmoji("🔁")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("allow")
          .setEmoji("🧑‍🤝‍🧑")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("deny")
          .setEmoji("🚫")
          .setStyle(ButtonStyle.Secondary)

      );

      // =================================================
      // ตอบ Interaction ก่อน ป้องกัน "บอทกำลังคิด..."
      // =================================================
      await interaction.deferReply({
        ephemeral: true
      });

      // ส่งแผงควบคุม
      await interaction.channel.send({
        embeds: [embed],
        components: [row1, row2]
      });

      // ลบข้อความตอบกลับของบอท
      await interaction.deleteReply().catch(() => {});

      return;
    }

    // =================================================
    // BUTTONS
    // =================================================
    if (interaction.isButton()) {

      const member = interaction.member;
      const channel = member.voice.channel;

      if (!channel) {
        return interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ",
          ephemeral: true
        });
      }

      const data = tempChannels.get(channel.id);

      // =================================================
      // OWNER
      // =================================================
      if (interaction.customId === "owner") {

        if (!data) {
          return interaction.reply({
            content: "❌ ห้องนี้ไม่ได้อยู่ในระบบห้องชั่วคราว",
            ephemeral: true
          });
        }

        const ownerMember =
          interaction.guild.members.cache.get(data.owner);

        return interaction.reply({

          embeds: [
            new EmbedBuilder()
              .setTitle("👑 เจ้าของห้อง")
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

      // =================================================
      // ตรวจสอบเจ้าของ
      // =================================================
      if (!data || data.owner !== member.id) {

        return interaction.reply({
          content:
            "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ ไม่สามารถสั่งการได้",
          ephemeral: true
        });

      }

      // =================================================
      // RENAME
      // =================================================
      if (interaction.customId === "name") {

        const modal = new ModalBuilder()
          .setCustomId("rename_room")
          .setTitle("เปลี่ยนชื่อห้อง");

        const input = new TextInputBuilder()
          .setCustomId("room_name")
          .setLabel("ชื่อห้องใหม่")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // =================================================
      // LIMIT
      // =================================================
      if (interaction.customId === "limit") {

        const modal = new ModalBuilder()
          .setCustomId("limit_room")
          .setTitle("ตั้งจำนวนคน");

        const input = new TextInputBuilder()
          .setCustomId("limit_input")
          .setLabel("ใส่จำนวนคน (0 = ไม่จำกัด)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );

        return interaction.showModal(modal);
      }

      // =================================================
      // USER SELECT
      // =================================================
      if (
        ["allow", "deny", "transfer"].includes(
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
            "🎯 โปรดเลือกสมาชิกจากเมนูด้านล่างนี้ครับ",

          components: [
            new ActionRowBuilder().addComponents(menu)
          ],

          ephemeral: true

        });
      }

      // =================================================
      // DEFER BUTTON
      // =================================================
      await interaction.deferReply({
        ephemeral: true
      });

      // =================================================
      // LOCK
      // =================================================
      if (interaction.customId === "lock") {

        // @everyone เข้าไม่ได้
        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            Connect: false
          }
        ).catch(() => {});

        // ปิดทุก Role ที่มีสิทธิ์เข้า Category
        const category =
          await interaction.guild.channels
            .fetch(categoryId)
            .catch(() => null);

        const roles =
          getCategoryAllowedRoles(
            interaction.guild,
            category
          );

        for (const roleId of roles) {

          await channel.permissionOverwrites.edit(
            roleId,
            {
              Connect: false
            }
          ).catch(() => {});

        }

        // allowRole เดิม
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              Connect: false
            }
          ).catch(() => {});

        }

        return interaction.editReply({
          content:
            "🔒 ล็อกห้องเรียบร้อยแล้ว"
        });
      }

      // =================================================
      // UNLOCK
      // =================================================
      if (interaction.customId === "unlock") {

        const category =
          await interaction.guild.channels
            .fetch(categoryId)
            .catch(() => null);

        const roles =
          getCategoryAllowedRoles(
            interaction.guild,
            category
          );

        // @everyone ยังเข้าไม่ได้
        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            Connect: false,
            ViewChannel: true
          }
        ).catch(() => {});

        // คืนสิทธิ์ให้ยศใน Category
        for (const roleId of roles) {

          await channel.permissionOverwrites.edit(
            roleId,
            {
              ViewChannel: true,
              Connect: true
            }
          ).catch(() => {});

        }

        // คืนสิทธิ์ allowRole
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              ViewChannel: true,
              Connect: true
            }
          ).catch(() => {});

        }

        // เจ้าของต้องเข้าได้
        await channel.permissionOverwrites.edit(
          data.owner,
          {
            ViewChannel: true,
            Connect: true
          }
        ).catch(() => {});

        return interaction.editReply({
          content:
            "🔓 ปลดล็อกห้องเรียบร้อยแล้ว ยศที่มีสิทธิ์ในหมวดนี้สามารถเข้าได้"
        });
      }

      // =================================================
      // HIDE
      // =================================================
      if (interaction.customId === "hide") {

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

        const permissions = [

          {
            id: interaction.guild.id,
            deny: [
              PermissionFlagsBits.ViewChannel
            ]
          },

          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers
            ]
          },

          {
            id: data.owner,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect
            ]
          }

        ];

        bigRoleIds.forEach(roleId => {

          permissions.push({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel
            ]
          });

        });

        await channel.permissionOverwrites
          .set(permissions)
          .catch(console.error);

        return interaction.editReply({
          content: "🙈 ซ่อนเรียบร้อยแล้ว"
        });
      }

      // =================================================
      // SHOW
      // =================================================
      if (interaction.customId === "show") {

        // ทุกคนมองเห็น
        await channel.permissionOverwrites.edit(
          interaction.guild.id,
          {
            ViewChannel: true,
            Connect: false
          }
        ).catch(() => {});

        // คืนสิทธิ์ยศใน Category
        const category =
          await interaction.guild.channels
            .fetch(categoryId)
            .catch(() => null);

        const roles =
          getCategoryAllowedRoles(
            interaction.guild,
            category
          );

        for (const roleId of roles) {

          await channel.permissionOverwrites.edit(
            roleId,
            {
              ViewChannel: true,
              Connect: true
            }
          ).catch(() => {});

        }

        // เจ้าของ
        await channel.permissionOverwrites.edit(
          data.owner,
          {
            ViewChannel: true,
            Connect: true
          }
        ).catch(() => {});

        // allowRole
        if (allowRoleId) {

          await channel.permissionOverwrites.edit(
            allowRoleId,
            {
              ViewChannel: true,
              Connect: true
            }
          ).catch(() => {});

        }

        return interaction.editReply({
          content:
            "👁️ แสดงห้องเรียบร้อยแล้ว"
        });
      }

    }

    // =================================================
    // USER SELECT MENUS
    // =================================================
    if (interaction.isUserSelectMenu()) {

      const channel =
        interaction.member.voice.channel;

      const data =
        tempChannels.get(channel?.id);

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

      // =================================================
      // DENY
      // =================================================
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
          channel.members.get(targetId);

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

      // =================================================
      // TRANSFER
      // =================================================
      if (
        interaction.customId === "select_transfer"
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

        await channel.permissionOverwrites.edit(
          targetId,
          {
            Connect: true,
            ViewChannel: true
          }
        ).catch(() => {});

        return interaction.reply({

          content:
            `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้วครับ`,

          ephemeral: true

        });
      }
    }

    // =================================================
    // MODAL SUBMISSIONS
    // =================================================
    if (interaction.isModalSubmit()) {

      const channel =
        interaction.member.voice.channel;

      const data =
        tempChannels.get(channel?.id);

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
        interaction.customId === "rename_room"
      ) {

        const name =
          interaction.fields
            .getTextInputValue("room_name");

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
        interaction.customId === "limit_room"
      ) {

        const limitInput =
          interaction.fields
            .getTextInputValue("limit_input");

        const limit =
          parseInt(limitInput);

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

        const finalLimit =
          limit === 0 ? 0 : limit;

        await channel
          .setUserLimit(finalLimit)
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

    if (
      !interaction.replied &&
      !interaction.deferred
    ) {

      interaction.reply({
        content:
          "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง",
        ephemeral: true
      }).catch(() => {});

    } else if (interaction.deferred) {

      interaction.editReply({
        content:
          "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง"
      }).catch(() => {});

    }

  }

});

// =====================================================
// LOGIN
// =====================================================
client.login(token);
