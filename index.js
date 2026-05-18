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

// ===== Slash Commands Registration =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("ส่งแผงควบคุมระบบห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

client.once("ready", async () => {
  console.log(`✅ Login as: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (err) {
    console.error("Error registering commands:", err);
  }
});

// ===== ระบบสร้างห้องและจัดการสถานะห้อง =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  // 1. สร้างห้องใหม่เมื่อเข้าห้องที่กำหนด
  if (newState.channelId === createChannelId) {
    try {
      const channel = await newState.guild.channels.create({
        name: `📍・ห้องของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [
          { id: newState.guild.id, allow: [GatewayIntentBits.ViewChannel], deny: [] },
          { id: newState.member.id, allow: [GatewayIntentBits.Connect, GatewayIntentBits.ManageChannels, GatewayIntentBits.ViewChannel] }
        ]
      });

      await newState.setChannel(channel);
      tempChannels.set(channel.id, { owner: newState.member.id });
    } catch (err) {
      console.error("Error creating channel:", err);
    }
  }

  // 2. จัดการเมื่อคนออกจากห้อง
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    const data = tempChannels.get(oldState.channelId);

    if (!channel) return;

    // ถ้าไม่มีคนเหลือในห้อง -> ลบห้อง
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
        // อัปเดต Permission ให้เจ้าของใหม่จัดการห้องได้
        await channel.permissionOverwrites.edit(nextMember.id, { Connect: true, ManageChannels: true, ViewChannel: true }).catch(() => {});
      }
    }
  }
});

// ===== ระบบ Interaction =====
client.on("interactionCreate", async (interaction) => {
  try {
    // คำสั่ง /room สำหรับแอดมิน
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      if (!interaction.member.permissions.has("Administrator")) {
        return interaction.reply({ content: "❌ เฉพาะแอดมินเท่านั้น", ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle("🏠 Voice Control Panel")
        .setDescription("จัดการห้องเสียงส่วนตัวของคุณด้วยปุ่มด้านล่าง\n\n✏️ เปลี่ยนชื่อ | 🔒 ล็อก | 🔓 ปลดล็อก\n🎯 จำกัดคน | 🙈 ซ่อน | 👁 แสดง\n👑 เช็กเจ้าของ | 🔁 โอนเจ้าของ\n🧑‍🤝‍🧑 อนุญาตรายคน | 🚫 ห้ามเข้า")
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
      return interaction.reply({ content: "ส่งแผงควบคุมแล้ว", ephemeral: true });
    }

    // จัดการปุ่มกด
    if (interaction.isButton()) {
      const { member, guild, customId } = interaction;
      const channel = member.voice.channel;

      if (!channel) return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องเสียงก่อน", ephemeral: true });
      const data = tempChannels.get(channel.id);

      // ตรวจสอบเจ้าของ (ยกเว้นปุ่มเช็กเจ้าของ)
      if (customId === "owner") {
        return interaction.reply({ content: `👑 เจ้าของห้องนี้คือ <@${data?.owner || "ไม่พบข้อมูล"}>`, ephemeral: true });
      }

      if (!data || data.owner !== member.id) {
        return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของห้องนี้", ephemeral: true });
      }

      // ปฏิบัติการปุ่ม
      if (customId === "name") {
        const modal = new ModalBuilder().setCustomId("modal_name").setTitle("เปลี่ยนชื่อห้อง");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("input_name").setLabel("ระบุชื่อห้องใหม่").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }

      if (customId === "limit") {
        const modal = new ModalBuilder().setCustomId("modal_limit").setTitle("จำกัดจำนวนคน");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("input_limit").setLabel("ใส่ตัวเลข 0-99 (0 คือไม่จำกัด)").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }

      if (["allow", "deny", "transfer"].includes(customId)) {
        const userSelect = new UserSelectMenuBuilder().setCustomId(`select_${customId}`).setPlaceholder("เลือกสมาชิก...");
        return interaction.reply({ content: "โปรดเลือกสมาชิกที่ต้องการจัดการ:", components: [new ActionRowBuilder().addComponents(userSelect)], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      // แก้ไขปัญหาการ Lock/Unlock
      if (customId === "lock") {
        await channel.permissionOverwrites.edit(guild.id, { Connect: false });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: false }).catch(() => {});
        // เจ้าของต้องเข้าได้เสมอ
        await channel.permissionOverwrites.edit(member.id, { Connect: true }); 
        return interaction.editReply("🔒 ล็อกห้องเรียบร้อยแล้ว (เฉพาะคนที่คุณอนุญาตเท่านั้นที่จะเข้าได้)");
      }

      if (customId === "unlock") {
        await channel.permissionOverwrites.edit(guild.id, { Connect: true });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: true }).catch(() => {});
        return interaction.editReply("🔓 ปลดล็อกห้องแล้ว ทุกคนสามารถเข้าได้");
      }

      if (customId === "hide") {
        await channel.permissionOverwrites.edit(guild.id, { ViewChannel: false });
        return interaction.editReply("🙈 ซ่อนห้องจากหน้าเซิร์ฟเวอร์แล้ว");
      }

      if (customId === "show") {
        await channel.permissionOverwrites.edit(guild.id, { ViewChannel: true });
        return interaction.editReply("👁 แสดงห้องให้ทุกคนเห็นแล้ว");
      }
    }

    // จัดการ Select Menu
    if (interaction.isUserSelectMenu()) {
      await interaction.deferUpdate();
      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);
      const targetId = interaction.values[0];

      if (interaction.customId === "select_allow") {
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
        await interaction.followUp({ content: `✅ เพิ่มสิทธิ์ให้ <@${targetId}> เข้าห้องนี้ได้แล้ว`, ephemeral: true });
      } else if (interaction.customId === "select_deny") {
        await channel.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false });
        const targetMember = await interaction.guild.members.fetch(targetId);
        if (targetMember.voice.channelId === channel.id) targetMember.voice.disconnect();
        await interaction.followUp({ content: `🚫 ห้าม <@${targetId}> เข้าห้องนี้`, ephemeral: true });
      } else if (interaction.customId === "select_transfer") {
        data.owner = targetId;
        const targetUser = await client.users.fetch(targetId);
        await channel.setName(`📍・ห้องของ ${targetUser.username}`).catch(() => {});
        await interaction.followUp({ content: `🔁 โอนความเป็นเจ้าของให้ <@${targetId}> แล้ว`, ephemeral: true });
      }
    }

    // จัดการ Modal Submit
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      if (interaction.customId === "modal_name") {
        const newName = interaction.fields.getTextInputValue("input_name");
        await channel.setName(`📍・${newName}`);
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อห้องเป็น: ${newName}`, ephemeral: true });
      }
      if (interaction.customId === "modal_limit") {
        const limit = parseInt(interaction.fields.getTextInputValue("input_limit"));
        if (isNaN(limit) || limit < 0 || limit > 99) return interaction.reply({ content: "❌ กรุณาใส่ตัวเลข 0-99", ephemeral: true });
        await channel.setUserLimit(limit);
        return interaction.reply({ content: `🎯 จำกัดจำนวนคนเป็น: ${limit === 0 ? "ไม่จำกัด" : limit + " คน"}`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: "❌ เกิดข้อผิดพลาดในการดำเนินการ", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);
