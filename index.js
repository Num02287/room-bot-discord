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


// ==================================================
// EXPRESS KEEP ALIVE
// ==================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is Online!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web Server is ready.");
});


// ==================================================
// DISCORD CLIENT
// ==================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});


// ==================================================
// ENV
// ==================================================

const TOKEN = process.env.TOKEN;
const CREATE_CHANNEL_ID = process.env.CREATE_CHANNEL_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;

const ALLOW_ROLE_ID = process.env.ALLOW_ROLE_ID || "";

const allowRoleIds = ALLOW_ROLE_ID
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);


// ==================================================
// ROLE IDS
// ==================================================

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


// ==================================================
// TEMP CHANNEL DATA
// ==================================================

const tempChannels = new Map();


// ==================================================
// READY
// ==================================================

client.once("ready", async () => {

  console.log(`Logged in as ${client.user.tag}`);

  try {

    const rest = new REST({ version: "10" })
      .setToken(TOKEN);

    const command = new SlashCommandBuilder()
      .setName("room")
      .setDescription("ระบบสร้างห้อง");

    await rest.put(
      Routes.applicationCommands(client.user.id),
      {
        body: [command.toJSON()]
      }
    );

    console.log("Slash command /room registered.");

  } catch (error) {

    console.error("Register Command Error:", error);

  }

});


// ==================================================
// CREATE TEMP VOICE ROOM
// ==================================================

client.on("voiceStateUpdate", async (oldState, newState) => {

  try {

    // ----------------------------------------------
    // JOIN CREATE CHANNEL
    // ----------------------------------------------

    if (
      newState.channelId === CREATE_CHANNEL_ID &&
      oldState.channelId !== CREATE_CHANNEL_ID
    ) {

      const guild = newState.guild;
      const ownerId = newState.member.id;

      const roomName =
        `ห้องส่วนตัวของ ${newState.member.user.username}`;

      // --------------------------------------------
      // CREATE CHANNEL
      // --------------------------------------------

      const channel = await guild.channels.create({

        name: roomName,

        type: ChannelType.GuildVoice,

        parent: CATEGORY_ID,

        permissionOverwrites: [

          // EVERYONE
          {
            id: guild.id,

            allow: [
              "ViewChannel"
            ],

            deny: [
              "Connect"
            ]
          },

          // OWNER
          {
            id: ownerId,

            allow: [
              "ViewChannel",
              "Connect"
            ]
          },

          // BOT
          {
            id: client.user.id,

            allow: [
              "ViewChannel",
              "Connect",
              "ManageChannels",
              "MoveMembers"
            ]
          }

        ]

      });


      // --------------------------------------------
      // BIG ROLES
      // --------------------------------------------

      for (const roleId of bigRoleIds) {

        await channel.permissionOverwrites.edit(
          roleId,
          {
            ViewChannel: true,
            Connect: true
          }
        ).catch(() => {});

      }


      // --------------------------------------------
      // ALLOW ROLES
      // --------------------------------------------

      for (const roleId of allowRoleIds) {

        await channel.permissionOverwrites.edit(
          roleId,
          {
            ViewChannel: true,
            Connect: true
          }
        ).catch(() => {});

      }


      // --------------------------------------------
      // SAVE DATA
      // --------------------------------------------

      tempChannels.set(channel.id, {

        owner: ownerId,

        // จำชื่อห้องล่าสุด
        roomName: roomName

      });


      // --------------------------------------------
      // MOVE OWNER
      // --------------------------------------------

      await newState.setChannel(channel).catch(() => {});


      console.log(
        `Created room: ${channel.name} | Owner: ${newState.member.user.username}`
      );

    }


    // ==================================================
    // DELETE EMPTY TEMP ROOM
    // ==================================================

    if (
      oldState.channelId &&
      tempChannels.has(oldState.channelId)
    ) {

      const channel = oldState.channel;

      if (
        channel &&
        channel.members.size === 0
      ) {

        await channel.delete().catch(() => {});

        tempChannels.delete(oldState.channelId);

        console.log(
          `Deleted empty room: ${channel.name}`
        );

      }

    }

  } catch (error) {

    console.error("Voice State Error:", error);

  }

});


// ==================================================
// SLASH COMMAND /ROOM
// ==================================================

client.on("interactionCreate", async interaction => {

  try {

    // ==================================================
    // /ROOM
    // ==================================================

    if (interaction.isChatInputCommand()) {

      if (interaction.commandName !== "room") return;

      const embed = new EmbedBuilder()

        .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")

        .setDescription(
          "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
          "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n" +
          "🔹 **หมายเหตุ :** สมาชิกที่มียศพิเศษจะสามารถเข้าห้องนี้ได้ทันที"
        )

        .setImage(
          "https://i.ibb.co/Kjbw5BGb/image.png"
        )

        .setFooter({
          text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
        })

        .setColor(0x2b2d31);


      // ----------------------------------------------
      // ROW 1
      // ----------------------------------------------

      const row1 = new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId("name")
            .setLabel("เปลี่ยนชื่อ")
            .setEmoji("✏️")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("lock")
            .setLabel("ล็อกห้อง")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("unlock")
            .setLabel("ปลดล็อก")
            .setEmoji("🔓")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("limit")
            .setLabel("จำกัดจำนวน")
            .setEmoji("🎯")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("owner")
            .setLabel("เจ้าของห้อง")
            .setEmoji("👑")
            .setStyle(ButtonStyle.Secondary)

        );


      // ----------------------------------------------
      // ROW 2
      // ----------------------------------------------

      const row2 = new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId("hide")
            .setLabel("ซ่อนห้อง")
            .setEmoji("🙈")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("show")
            .setLabel("แสดงห้อง")
            .setEmoji("👁")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("transfer")
            .setLabel("โอนเจ้าของ")
            .setEmoji("🔁")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("allow")
            .setLabel("อนุญาตสมาชิก")
            .setEmoji("🧑‍🤝‍🧑")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("deny")
            .setLabel("ไม่อนุญาต")
            .setEmoji("🚫")
            .setStyle(ButtonStyle.Danger)

        );


      await interaction.reply({

        embeds: [embed],

        components: [
          row1,
          row2
        ]

      });

      return;

    }


    // ==================================================
    // BUTTON
    // ==================================================

    if (!interaction.isButton()) return;


    // ----------------------------------------------
    // MEMBER MUST BE IN VOICE
    // ----------------------------------------------

    const member = interaction.member;

    if (!member.voice.channel) {

      return interaction.reply({

        content: "❌ กรุณาเข้าห้องเสียงก่อน",

        ephemeral: true

      });

    }


    const channel = member.voice.channel;


    // ----------------------------------------------
    // MUST BE TEMP ROOM
    // ----------------------------------------------

    const data = tempChannels.get(channel.id);

    if (!data) {

      return interaction.reply({

        content: "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",

        ephemeral: true

      });

    }


    // ==================================================
    // OWNER INFO
    // ==================================================

    if (interaction.customId === "owner") {

      return interaction.reply({

        embeds: [

          new EmbedBuilder()

            .setTitle("👑 เจ้าของห้อง")

            .setDescription(
              `เจ้าของห้องคือ <@${data.owner}>`
            )

            .setColor(0x2b2d31)

        ],

        ephemeral: true

      });

    }


    // ==================================================
    // CHECK OWNER
    // ==================================================

    if (data.owner !== member.id) {

      return interaction.reply({

        content: "❌ เฉพาะเจ้าของห้องเท่านั้นที่สามารถใช้คำสั่งนี้ได้",

        ephemeral: true

      });

    }


    // ==================================================
    // RENAME
    // ==================================================

    if (interaction.customId === "name") {

      const modal = new ModalBuilder()

        .setCustomId("rename_room")

        .setTitle("✏️ เปลี่ยนชื่อห้อง");


      const input = new TextInputBuilder()

        .setCustomId("room_name")

        .setLabel("ชื่อห้องใหม่")

        .setPlaceholder(
          data.roomName || "กรอกชื่อห้องใหม่"
        )

        .setStyle(TextInputStyle.Short)

        .setRequired(true)

        .setMaxLength(100);


      modal.addComponents(

        new ActionRowBuilder()
          .addComponents(input)

      );


      return interaction.showModal(modal);

    }


    // ==================================================
    // LOCK
    // ==================================================

    if (interaction.customId === "lock") {

      await interaction.deferReply({
        ephemeral: true
      });


      await channel.permissionOverwrites.edit(

        interaction.guild.id,

        {
          ViewChannel: true,
          Connect: false
        }

      ).catch(() => {});


      for (const roleId of allowRoleIds) {

        await channel.permissionOverwrites.edit(

          roleId,

          {
            ViewChannel: true,
            Connect: false
          }

        ).catch(() => {});

      }


      return interaction.editReply({

        content: "🔒 ล็อกห้องเรียบร้อยแล้ว"

      });

    }


    // ==================================================
    // UNLOCK
    // ==================================================

    if (interaction.customId === "unlock") {

      await interaction.deferReply({
        ephemeral: true
      });


      await channel.permissionOverwrites.edit(

        interaction.guild.id,

        {
          ViewChannel: true,
          Connect: false
        }

      ).catch(() => {});


      for (const roleId of allowRoleIds) {

        await channel.permissionOverwrites.edit(

          roleId,

          {
            ViewChannel: true,
            Connect: true
          }

        ).catch(() => {});

      }


      return interaction.editReply({

        content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว"

      });

    }


    // ==================================================
    // HIDE
    // ==================================================

    if (interaction.customId === "hide") {

      await interaction.deferReply({
        ephemeral: true
      });


      // จำ permission เดิม
      data.savedPermissions =
        channel.permissionOverwrites.cache.map(p => ({

          id: p.id,

          type: p.type,

          allow: p.allow.bitfield.toString(),

          deny: p.deny.bitfield.toString()

        }));


      await channel.permissionOverwrites.edit(

        interaction.guild.id,

        {
          ViewChannel: false,
          Connect: false
        }

      ).catch(() => {});


      await channel.permissionOverwrites.edit(

        client.user.id,

        {
          ViewChannel: true,
          Connect: true,
          ManageChannels: true,
          MoveMembers: true
        }

      ).catch(() => {});


      await channel.permissionOverwrites.edit(

        data.owner,

        {
          ViewChannel: true,
          Connect: true
        }

      ).catch(() => {});


      return interaction.editReply({

        content: "🙈 ซ่อนห้องเรียบร้อยแล้ว"

      });

    }


    // ==================================================
    // SHOW
    // ==================================================

    if (interaction.customId === "show") {

      await interaction.deferReply({
        ephemeral: true
      });


      if (data.savedPermissions) {

        try {

          await channel.permissionOverwrites.set(

            data.savedPermissions.map(p => ({

              id: p.id,

              type: p.type,

              allow: BigInt(p.allow),

              deny: BigInt(p.deny)

            }))

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

        content: "👁️ แสดงห้องเรียบร้อยแล้ว"

      });

    }


    // ==================================================
    // LIMIT
    // ==================================================

    if (interaction.customId === "limit") {

      const modal = new ModalBuilder()

        .setCustomId("limit_room")

        .setTitle("🎯 จำกัดจำนวนสมาชิก");


      const input = new TextInputBuilder()

        .setCustomId("room_limit")

        .setLabel("จำนวนสมาชิก")

        .setPlaceholder("ใส่ตัวเลข 0 - 99")

        .setStyle(TextInputStyle.Short)

        .setRequired(true)

        .setMaxLength(2);


      modal.addComponents(

        new ActionRowBuilder()
          .addComponents(input)

      );


      return interaction.showModal(modal);

    }


    // ==================================================
    // ALLOW
    // ==================================================

    if (interaction.customId === "allow") {

      const menu = new UserSelectMenuBuilder()

        .setCustomId("select_allow")

        .setPlaceholder("เลือกสมาชิกที่อนุญาตให้เข้าห้อง")

        .setMinValues(1)

        .setMaxValues(1);


      return interaction.reply({

        components: [

          new ActionRowBuilder()
            .addComponents(menu)

        ],

        ephemeral: true

      });

    }


    // ==================================================
    // DENY
    // ==================================================

    if (interaction.customId === "deny") {

      const menu = new UserSelectMenuBuilder()

        .setCustomId("select_deny")

        .setPlaceholder("เลือกสมาชิกที่ไม่อนุญาตให้เข้าห้อง")

        .setMinValues(1)

        .setMaxValues(1);


      return interaction.reply({

        components: [

          new ActionRowBuilder()
            .addComponents(menu)

        ],

        ephemeral: true

      });

    }


    // ==================================================
    // TRANSFER
    // ==================================================

    if (interaction.customId === "transfer") {

      const menu = new UserSelectMenuBuilder()

        .setCustomId("select_transfer")

        .setPlaceholder("เลือกสมาชิกที่จะเป็นเจ้าของใหม่")

        .setMinValues(1)

        .setMaxValues(1);


      return interaction.reply({

        components: [

          new ActionRowBuilder()
            .addComponents(menu)

        ],

        ephemeral: true

      });

    }


  } catch (error) {

    console.error(
      "Button Error:",
      error
    );

  }

});


// ==================================================
// MODAL + SELECT MENU
// ==================================================

client.on("interactionCreate", async interaction => {

  try {

    // ==================================================
    // RENAME MODAL
    // ==================================================

    if (
      interaction.isModalSubmit() &&
      interaction.customId === "rename_room"
    ) {

      const member = interaction.member;

      if (!member.voice.channel) {

        return interaction.reply({

          content: "❌ กรุณาเข้าห้องเสียงก่อน",

          ephemeral: true

        });

      }


      const channel = member.voice.channel;

      const data = tempChannels.get(channel.id);


      if (!data) {

        return interaction.reply({

          content: "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",

          ephemeral: true

        });

      }


      if (data.owner !== member.id) {

        return interaction.reply({

          content: "❌ เฉพาะเจ้าของห้องเท่านั้น",

          ephemeral: true

        });

      }


      const name = interaction.fields
        .getTextInputValue("room_name")
        .trim();


      if (!name) {

        return interaction.reply({

          content: "❌ กรุณาระบุชื่อห้อง",

          ephemeral: true

        });

      }


      // เปลี่ยนชื่อจริง
      await channel.setName(name).catch(() => {});


      // จำชื่อใหม่ไว้
      data.roomName = name;


      return interaction.reply({

        content:
          `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`,

        ephemeral: true

      });

    }


    // ==================================================
    // LIMIT MODAL
    // ==================================================

    if (
      interaction.isModalSubmit() &&
      interaction.customId === "limit_room"
    ) {

      const member = interaction.member;

      if (!member.voice.channel) {

        return interaction.reply({

          content: "❌ กรุณาเข้าห้องเสียงก่อน",

          ephemeral: true

        });

      }


      const channel = member.voice.channel;

      const data = tempChannels.get(channel.id);


      if (!data) {

        return interaction.reply({

          content: "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",

          ephemeral: true

        });

      }


      if (data.owner !== member.id) {

        return interaction.reply({

          content: "❌ เฉพาะเจ้าของห้องเท่านั้น",

          ephemeral: true

        });

      }


      const value = Number(

        interaction.fields
          .getTextInputValue("room_limit")
          .trim()

      );


      if (
        Number.isNaN(value) ||
        value < 0 ||
        value > 99
      ) {

        return interaction.reply({

          content: "❌ กรุณาใส่ตัวเลขระหว่าง 0 - 99",

          ephemeral: true

        });

      }


      await channel.setUserLimit(value).catch(() => {});


      return interaction.reply({

        content:
          `🎯 ตั้งจำนวนสมาชิกสูงสุดเป็น **${value === 0 ? "ไม่จำกัด" : value + " คน"}** แล้ว`,

        ephemeral: true

      });

    }


    // ==================================================
    // USER SELECT
    // ==================================================

    if (!interaction.isUserSelectMenu()) return;


    const member = interaction.member;

    if (!member.voice.channel) {

      return interaction.reply({

        content: "❌ กรุณาเข้าห้องเสียงก่อน",

        ephemeral: true

      });

    }


    const channel = member.voice.channel;

    const data = tempChannels.get(channel.id);


    if (!data) {

      return interaction.reply({

        content: "❌ ห้องนี้ไม่ใช่ห้องส่วนตัว",

        ephemeral: true

      });

    }


    if (data.owner !== member.id) {

      return interaction.reply({

        content: "❌ เฉพาะเจ้าของห้องเท่านั้น",

        ephemeral: true

      });

    }


    const targetId = interaction.values[0];


    // ==================================================
    // ALLOW USER
    // ==================================================

    if (interaction.customId === "select_allow") {

      await channel.permissionOverwrites.edit(

        targetId,

        {
          ViewChannel: true,
          Connect: true
        }

      ).catch(() => {});


      return interaction.update({

        content:
          `🧑‍🤝‍🧑 อนุญาต <@${targetId}> ให้เข้าห้องเรียบร้อยแล้ว`,

        components: []

      });

    }


    // ==================================================
    // DENY USER
    // ==================================================

    if (interaction.customId === "select_deny") {

      await channel.permissionOverwrites.edit(

        targetId,

        {
          ViewChannel: true,
          Connect: false
        }

      ).catch(() => {});


      return interaction.update({

        content:
          `🚫 ไม่อนุญาต <@${targetId}> ให้เข้าห้องเรียบร้อยแล้ว`,

        components: []

      });

    }


    // ==================================================
    // TRANSFER OWNER
    // ==================================================

    if (interaction.customId === "select_transfer") {

      const oldOwnerId = data.owner;

      const newOwnerId = targetId;


      // ลบสิทธิ์เจ้าของเดิม
      await channel.permissionOverwrites
        .delete(oldOwnerId)
        .catch(() => {});


      // เปลี่ยนเจ้าของ
      data.owner = newOwnerId;


      // ให้สิทธิ์เจ้าของใหม่เหมือนตอนสร้างห้อง
      await channel.permissionOverwrites.edit(

        newOwnerId,

        {
          ViewChannel: true,
          Connect: true
        }

      ).catch(() => {});


      // ตั้งชื่อห้องตามเจ้าของใหม่
      const targetUser =
        await client.users.fetch(newOwnerId)
          .catch(() => null);


      if (targetUser) {

        const newRoomName =
          `ห้องส่วนตัวของ ${targetUser.username}`;

        await channel.setName(
          newRoomName
        ).catch(() => {});

        // จำชื่อใหม่
        data.roomName = newRoomName;

      }


      return interaction.update({

        content:
          `🔁 โอนความเป็นเจ้าของห้องให้ <@${newOwnerId}> เรียบร้อยแล้ว`,

        components: []

      });

    }

  } catch (error) {

    console.error(
      "Modal / Select Error:",
      error
    );

  }

});


// ==================================================
// LOGIN
// ==================================================

client.login(TOKEN);
