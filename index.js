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

// ===== Web Server สำหรับ Render (Keep Alive) =====
const app = express();
app.get('/', (req, res) => res.send('Bot is Online!'));
app.listen(process.env.PORT || 3000, () => console.log('✅ Web Server is ready.'));

// ===== ดึงข้อมูลจาก Environment Variables =====
const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

const tempChannels = new Map();

// ===== ลงทะเบียน Slash Commands =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("เปิดแผงควบคุมห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

client.once("ready", async () => {
  console.log(`✅ Login as: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (err) { console.error(err); }
});

// ===== 1. ระบบสร้างห้อง / โอนเจ้าของ / ลบห้องเมื่อออก =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  
  // --- กรณีที่ 1: เข้าห้อง "กดเพื่อสร้างห้อง" ---
  if (newState.channelId === createChannelId) {
    try {
      const channel = await newState.guild.channels.create({
        name: `📍・ห้องของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [
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

      await newState.setChannel(channel);
      tempChannels.set(channel.id, { owner: newState.member.id });
    } catch (e) { console.error("Error creating channel:", e); }
  }

  // --- กรณีที่ 2: ออกจากห้องส่วนตัว ---
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (!channel) {
      tempChannels.delete(oldState.channelId);
      return;
    }

    const data = tempChannels.get(oldState.channelId);

    // ลบห้องทันทีถ้าไม่มีคนเหลือ
    if (channel.members.size === 0) {
      tempChannels.delete(oldState.channelId);
      return channel.delete().catch(() => {});
    }

    // โอนเจ้าของอัตโนมัติถ้าเจ้าของเดิมออก แต่ยังมีคนอื่นอยู่
    if (oldState.member.id === data.owner) {
      const newOwner = channel.members.first();
      if (newOwner) {
        data.owner = newOwner.id;
        // เปลี่ยนชื่อห้องตามเจ้าของใหม่
        await channel.setName(`📍・ห้องของ ${newOwner.user.username}`).catch(() => {});
        // มอบสิทธิ์การจัดการให้เจ้าของใหม่
        await channel.permissionOverwrites.edit(newOwner.id, {
          Connect: true,
          ManageChannels: true,
          MoveMembers: true,
          ViewChannel: true
        }).catch(() => {});
      }
    }
  }
});

// ===== 2. ระบบจัดการแผงควบคุม (Interaction) =====
client.on("interactionCreate", async (interaction) => {
  try {
    // คำสั่ง /room
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบจัดการห้องส่วนตัว")
        .setDescription("🔹 ใช้ปุ่มด้านล่างเพื่อตั้งค่าห้องเสียงของคุณ\n*(ต้องเป็นเจ้าของห้องเท่านั้นจึงจะใช้งานได้)*")
        .setColor(0x2b2d31)
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

      return interaction.reply({ embeds: [embed], components: [row1, row2] });
    }

    // จัดการ Buttons
    if (interaction.isButton()) {
      const channel = interaction.member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องเสียงก่อน", ephemeral: true });

      const data = tempChannels.get(channel.id);
      if (interaction.customId === "owner") {
        return interaction.reply({ content: `👑 เจ้าของห้องปัจจุบันคือ: <@${data?.owner}>`, ephemeral: true });
      }

      if (!data || data.owner !== interaction.member.id) {
        return interaction.reply({ content: "❌ เฉพาะเจ้าของห้องเท่านั้นที่สั่งงานได้", ephemeral: true });
      }

      if (interaction.customId === "name") {
        const modal = new ModalBuilder().setCustomId("m_name").setTitle("เปลี่ยนชื่อห้อง");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("i_name").setLabel("ชื่อใหม่").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }

      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("m_limit").setTitle("ตั้งค่าจำกัดคน");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("i_limit").setLabel("จำนวน (0 = ไม่จำกัด)").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }

      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`s_${interaction.customId}`).setPlaceholder("เลือกสมาชิก...");
        return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      if (interaction.customId === "lock") await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
      if (interaction.customId === "unlock") await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
      if (interaction.customId === "hide") await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
      if (interaction.customId === "show") await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
      return interaction.editReply("✅ ดำเนินการสำเร็จ");
    }

    // จัดการ User Select
    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      const targetId = interaction.values[0];
      const data = tempChannels.get(channel?.id);

      if (interaction.customId === "s_allow") await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
      if (interaction.customId === "s_deny") await channel.permissionOverwrites.edit(targetId, { Connect: false });
      if (interaction.customId === "s_transfer") {
        data.owner = targetId;
        const target = await interaction.guild.members.fetch(targetId);
        await channel.setName(`📍・ห้องของ ${target.user.username}`);
      }
      return interaction.reply({ content: "✅ อัปเดตเรียบร้อย", ephemeral: true });
    }

    // จัดการ Modal Submit
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      if (interaction.customId === "m_name") {
        const n = interaction.fields.getTextInputValue("i_name");
        await channel.setName(`📍・${n}`);
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อห้องเป็น ${n} แล้ว`, ephemeral: true });
      }
      if (interaction.customId === "m_limit") {
        const l = parseInt(interaction.fields.getTextInputValue("i_limit"));
        await channel.setUserLimit(isNaN(l) ? 0 : l);
        return interaction.reply({ content: `🎯 ตั้งจำนวนคนเป็น ${l || 'ไม่จำกัด'} แล้ว`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) interaction.reply({ content: "❌ เกิดข้อผิดพลาด", ephemeral: true }).catch(() => {});
  }
});

client.login(token);
