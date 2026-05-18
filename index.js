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

// ===== ตั้งค่า Environment Variables =====
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

// เก็บข้อมูลห้อง: Map<channelId, { owner: userId }>
const tempChannels = new Map();

// ===== ลงทะเบียน Slash Command =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("ส่งแผงควบคุมจัดการห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

client.once("ready", async () => {
  console.log(`✅ Login as: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (err) { console.error(err); }
});

// ===== 1. ระบบ Voice (สร้าง/ลบ) =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  
  // -- สร้างห้องใหม่ (ล็อกสิทธิ์เข้าถึง และใช้ชื่อห้องแบบคงที่) --
  if (newState.channelId === createChannelId) {
    try {
      const channel = await newState.guild.channels.create({
        name: `📍・ห้องส่วนตัว`, // ชื่อห้องจะไม่เปลี่ยนตามชื่อคนกด
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [
          {
            // ปิดกั้นทุกคน (Role @everyone) ไม่ให้เชื่อมต่อ
            id: newState.guild.id,
            deny: [PermissionFlagsBits.Connect], 
            allow: [PermissionFlagsBits.ViewChannel]
          },
          {
            // เปิดสิทธิ์พิเศษให้เจ้าของห้องคนเดียว
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
    } catch (e) { console.error("Create Room Error:", e); }
  }

  // -- ลบห้องเฉพาะเมื่อห้องว่าง (Size = 0) --
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (!channel) {
      tempChannels.delete(oldState.channelId);
      return;
    }

    if (channel.members.size === 0) {
      tempChannels.delete(oldState.channelId);
      return channel.delete().catch(() => {});
    }
    
    // บอทจะไม่ทำการโอนเจ้าของ และไม่เปลี่ยนชื่อห้องใดๆ เมื่อมีคนออก
  }
});

// ===== 2. ระบบจัดการแผงควบคุม (Interaction) =====
client.on("interactionCreate", async (interaction) => {
  try {
    // คำสั่งเรียกแผงควบคุม
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      const embed = new EmbedBuilder()
        .setTitle("🏠 Voice Control Panel")
        .setDescription("ใช้ปุ่มด้านล่างเพื่อจัดการห้องของคุณ\n*(ห้องถูกล็อกเป็นค่าเริ่มต้นเพื่อให้เป็นส่วนตัว)*")
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

    const member = interaction.member;
    const channel = member.voice.channel;
    const data = tempChannels.get(channel?.id);

    // ปุ่มเช็คเจ้าของ (ใครกดดูก็ได้)
    if (interaction.isButton() && interaction.customId === "owner") {
      return interaction.reply({ content: `👑 เจ้าของห้องปัจจุบันคือ: <@${data?.owner || "ไม่พบข้อมูล"}>`, ephemeral: true });
    }

    // ตรวจสอบสิทธิ์ (ต้องเป็นเจ้าของและอยู่ในห้อง)
    if (!channel || !data || data.owner !== member.id) {
      if (interaction.isButton() || interaction.isUserSelectMenu()) {
        return interaction.reply({ content: "❌ เฉพาะเจ้าของห้องเท่านั้นที่ควบคุมได้", ephemeral: true });
      }
      return;
    }

    // --- จัดการปุ่มกด ---
    if (interaction.isButton()) {
      if (interaction.customId === "name") {
        const modal = new ModalBuilder().setCustomId("m_name").setTitle("เปลี่ยนชื่อห้อง");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("i_name").setLabel("ระบุชื่อใหม่").setStyle(TextInputStyle.Short).setMaxLength(20)));
        return interaction.showModal(modal);
      }
      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("m_limit").setTitle("จำกัดจำนวนคน");
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

    // --- จัดการการเลือกสมาชิก ---
    if (interaction.isUserSelectMenu()) {
      const targetId = interaction.values[0];
      await interaction.deferReply({ ephemeral: true });
      if (interaction.customId === "s_allow") await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
      if (interaction.customId === "s_deny") await channel.permissionOverwrites.edit(targetId, { Connect: false });
      if (interaction.customId === "s_transfer") {
        data.owner = targetId; // เปลี่ยนเจ้าของในระบบ
        // ไม่มีการใช้ setName ที่นี่ เพื่อให้ชื่อห้องคงเดิม
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ManageChannels: true, MoveMembers: true, ViewChannel: true });
      }
      return interaction.editReply("✅ อัปเดตเรียบร้อย");
    }

    // --- จัดการ Modal ---
    if (interaction.isModalSubmit()) {
      await interaction.deferReply({ ephemeral: true });
      if (interaction.customId === "m_name") {
        const newName = interaction.fields.getTextInputValue("i_name");
        await channel.setName(`📍・${newName}`);
      }
      if (interaction.customId === "m_limit") {
        const val = parseInt(interaction.fields.getTextInputValue("i_limit"));
        await channel.setUserLimit(isNaN(val) ? 0 : val);
      }
      return interaction.editReply("✅ บันทึกการตั้งค่าแล้ว");
    }

  } catch (err) {
    console.error(err);
  }
});

client.login(token);
