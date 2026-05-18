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

const express = require('express');

// ===== Web Server สำหรับ Render =====
const app = express();
app.get('/', (req, res) => res.send('Bot is Online!'));
app.listen(process.env.PORT || 3000, () => console.log('Web Server ready.'));

// ===== Environment Variables =====
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

// ===== ลงทะเบียน Slash Command =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("ระบบจัดการห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

client.once("ready", async () => {
  console.log(`✅ บอทออนไลน์แล้ว: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ ลงทะเบียน Slash Commands สำเร็จ");
  } catch (err) {
    console.error(err);
  }
});

// ===== [ระบบสร้างห้องอัตโนมัติ] =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  
  // กรณีที่ 1: มีคนกดเข้าห้อง "สร้างห้องอัตโนมัติ"
  if (newState.channelId === createChannelId) {
    try {
      console.log(`[System] กำลังสร้างห้องให้คุณ ${newState.member.user.username}...`);
      
      const channel = await newState.guild.channels.create({
        name: `📍・ห้องของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId || null,
        permissionOverwrites: [
          {
            id: newState.guild.id,
            allow: [PermissionFlagsBits.ViewChannel],
            deny: [] // ให้ทุกคนเห็น แต่เข้าได้หรือไม่ขึ้นอยู่กับการล็อก
          },
          {
            id: newState.member.id,
            allow: [
              PermissionFlagsBits.Connect, 
              PermissionFlagsBits.ManageChannels, 
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.ViewChannel
            ]
          }
        ]
      });

      // ย้ายคนกดเข้าห้องไปที่ห้องใหม่ทันที
      await newState.setChannel(channel);
      
      // บันทึกสถานะเจ้าของห้อง
      tempChannels.set(channel.id, { owner: newState.member.id });
      console.log(`✅ สร้างและย้ายสำเร็จ!`);

    } catch (err) {
      console.error("❌ สร้างห้องไม่สำเร็จ สาเหตุ:", err.message);
    }
  }

  // กรณีที่ 2: จัดการเมื่อคนออกจากห้อง หรือห้องร้าง
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    const data = tempChannels.get(oldState.channelId);

    if (!channel) return;

    // ถ้าห้องว่าง (ไม่มีคนอยู่เลย) -> ลบห้องทิ้ง
    if (channel.members.size === 0) {
      tempChannels.delete(oldState.channelId);
      return channel.delete().catch(() => {});
    }

    // ถ้าเจ้าของห้องออก -> โอนเจ้าของให้คนถัดไป
    if (oldState.member.id === data.owner) {
      const nextMember = channel.members.filter(m => !m.user.bot).first();
      if (nextMember) {
        data.owner = nextMember.id;
        await channel.setName(`📍・ห้องของ ${nextMember.user.username}`).catch(() => {});
        // มอบสิทธิ์การจัดการให้เจ้าของใหม่
        await channel.permissionOverwrites.edit(nextMember.id, { 
          Connect: true, 
          ManageChannels: true, 
          ViewChannel: true 
        }).catch(() => {});
      }
    }
  }
});

// ===== [ระบบ Interaction (ปุ่มกด/เมนู)] =====
client.on("interactionCreate", async (interaction) => {
  try {
    // 1. คำสั่ง /room
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ เฉพาะแอดมินเท่านั้นที่ใช้คำสั่งนี้ได้", ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle("🏠 Voice Control Panel")
        .setDescription("จัดการห้องเสียงของคุณได้ง่ายๆ ผ่านปุ่มด้านล่างนี้\n(คุณต้องอยู่ในห้องตัวเองเพื่อใช้งาน)")
        .setColor(0x5865F2)
        .setImage("https://i.ibb.co/Kjbw5BGb/image.png");

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("name").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("lock").setEmoji("🔒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("unlock").setEmoji("🔓").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("limit").setEmoji("🎯").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("owner").setEmoji("👑").setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("hide").setEmoji("🙈").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("show").setEmoji("👁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("transfer").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("allow").setEmoji("🧑‍🤝‍🧑").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("deny").setEmoji("🚫").setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
      return interaction.reply({ content: "ส่งแผงควบคุมแล้ว!", ephemeral: true });
    }

    // 2. จัดการปุ่มกด
    if (interaction.isButton()) {
      const channel = interaction.member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณต้องเข้าห้องเสียงก่อน", ephemeral: true });

      const data = tempChannels.get(channel.id);

      if (interaction.customId === "owner") {
        return interaction.reply({ content: `👑 เจ้าของห้องคือ <@${data?.owner || "ไม่พบข้อมูล"}>`, ephemeral: true });
      }

      if (!data || data.owner !== interaction.member.id) {
        return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของห้องนี้", ephemeral: true });
      }

      // ป๊อปอัปเปลี่ยนชื่อ/จำกัดคน
      if (interaction.customId === "name") {
        const modal = new ModalBuilder().setCustomId("m_name").setTitle("เปลี่ยนชื่อห้อง");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("i_name").setLabel("ชื่อใหม่").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }
      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("m_limit").setTitle("จำกัดจำนวนคน");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("i_limit").setLabel("ระบุจำนวน (0 = ไม่จำกัด)").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }

      // เมนูเลือกสมาชิก
      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`s_${interaction.customId}`).setPlaceholder("เลือกคน...");
        return interaction.reply({ content: "เลือกสมาชิก:", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      // ทำงานตามปุ่ม (Lock / Hide)
      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: false }).catch(() => {});
        await channel.permissionOverwrites.edit(data.owner, { Connect: true });
        return interaction.editReply("🔒 ล็อกห้องแล้ว!");
      }
      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: true }).catch(() => {});
        return interaction.editReply("🔓 ปลดล็อกห้องแล้ว!");
      }
      if (interaction.customId === "hide") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        return interaction.editReply("🙈 ซ่อนห้องแล้ว!");
      }
      if (interaction.customId === "show") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
        return interaction.editReply("👁 แสดงห้องแล้ว!");
      }
    }

    // 3. จัดการ Select Menu และ Modal
    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);
      const target = interaction.values[0];

      if (interaction.customId === "s_allow") {
        await channel.permissionOverwrites.edit(target, { Connect: true, ViewChannel: true });
        return interaction.reply({ content: "✅ อนุญาตสมาชิกแล้ว", ephemeral: true });
      }
      if (interaction.customId === "s_deny") {
        await channel.permissionOverwrites.edit(target, { Connect: false, ViewChannel: false });
        const member = await interaction.guild.members.fetch(target);
        if (member.voice.channelId === channel.id) member.voice.disconnect().catch(() => {});
        return interaction.reply({ content: "🚫 บล็อกสมาชิกแล้ว", ephemeral: true });
      }
      if (interaction.customId === "s_transfer") {
        data.owner = target;
        const user = await client.users.fetch(target);
        await channel.setName(`📍・ห้องของ ${user.username}`).catch(() => {});
        return interaction.reply({ content: "🔁 โอนเจ้าของห้องสำเร็จ", ephemeral: true });
      }
    }

    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      if (interaction.customId === "m_name") {
        const n = interaction.fields.getTextInputValue("i_name");
        await channel.setName(`📍・${n}`);
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อเป็น ${n}`, ephemeral: true });
      }
      if (interaction.customId === "m_limit") {
        const l = parseInt(interaction.fields.getTextInputValue("i_limit"));
        await channel.setUserLimit(isNaN(l) ? 0 : l);
        return interaction.reply({ content: `🎯 ปรับขีดจำกัดคนเรียบร้อย`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error("Interaction Error:", err);
  }
});

client.login(token);
