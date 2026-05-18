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

// ===== ระบบ Keep Alive สำหรับการโฮสต์บน Render =====
const app = express();
app.get('/', (req, res) => res.send('Bot is ready!'));
app.listen(process.env.PORT || 3000);

// ===== ตั้งค่าตัวแปรระบบ =====
const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID; // ไอดีห้อง "คลิกเพื่อสร้างห้อง"
const categoryId = process.env.CATEGORY_ID;           // ไอดีหมวดหมู่ที่จะให้สร้างห้อง

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

// Map สำหรับจำว่าห้องไหนใครเป็นเจ้าของ
const tempChannels = new Map();

// ===== ลงทะเบียน Slash Command =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("ส่งแผงควบคุมจัดการห้องเสียงส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

client.once("ready", async () => {
  console.log(`✅ บอทออนไลน์แล้วในชื่อ: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (err) { console.error(err); }
});

// ===== 1. ระบบจัดการ Voice Channel (สร้าง/ลบ) =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  
  // -- ส่วนการสร้างห้องใหม่ --
  if (newState.channelId === createChannelId) {
    try {
      const channel = await newState.guild.channels.create({
        name: `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [
          {
            // ปิดกั้นคนทั่วไป (@everyone) ไม่ให้เชื่อมต่อทันที
            id: newState.guild.id,
            deny: [PermissionFlagsBits.Connect], 
            allow: [PermissionFlagsBits.ViewChannel]
          },
          {
            // ให้สิทธิ์เจ้าของห้องควบคุมทุกอย่าง
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

      // ย้ายผู้ใช้เข้าห้องใหม่
      await newState.setChannel(channel);
      // บันทึกเจ้าของห้องไว้ในหน่วยความจำ
      tempChannels.set(channel.id, { owner: newState.member.id });
    } catch (e) { console.error("Error creating channel:", e); }
  }

  // -- ส่วนการลบห้อง --
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    
    if (channel && channel.members.size === 0) {
      // ลบห้องเฉพาะเมื่อไม่มีคนเหลืออยู่เลย
      tempChannels.delete(oldState.channelId);
      return channel.delete().catch(() => {});
    }
    // เมื่อเจ้าของออก บอทจะไม่ทำอะไร (ไม่โอนเจ้าของ) ตามที่คุณต้องการ
  }
});

// ===== 2. ระบบแผงควบคุมและปุ่มกด =====
client.on("interactionCreate", async (interaction) => {
  try {
    // คำสั่ง /room เพื่อส่ง Embed
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      const embed = new EmbedBuilder()
        .setTitle("🏠 Voice Control Panel")
        .setDescription("จัดการห้องเสียงของคุณได้จากปุ่มด้านล่าง\n\n" +
                        "🔒 **ล็อกห้อง**: ห้ามคนไม่มียศเข้า\n" +
                        "🔓 **ปลดล็อก**: ให้ทุกคนเข้าได้\n" +
                        "🧑‍🤝‍🧑 **อนุญาต**: เลือกเพื่อนเข้าห้องรายบุคคล")
        .setColor(0x5865F2);

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lock").setEmoji("🔒").setLabel("ล็อก").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("unlock").setEmoji("🔓").setLabel("ปลดล็อก").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("limit").setEmoji("🎯").setLabel("จำกัดคน").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("owner").setEmoji("👑").setLabel("เช็คเจ้าของ").setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("allow").setEmoji("🧑‍🤝‍🧑").setLabel("อนุญาตคน").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("deny").setEmoji("🚫").setLabel("บล็อกคน").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("transfer").setEmoji("🔁").setLabel("โอนสิทธิ์").setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row1, row2] });
    }

    // ตรวจสอบข้อมูลห้อง
    const member = interaction.member;
    const channel = member.voice.channel;
    const data = tempChannels.get(channel?.id);

    // ปุ่มเช็คเจ้าของ (ใครกดก็ได้)
    if (interaction.isButton() && interaction.customId === "owner") {
      return interaction.reply({ content: `👑 เจ้าของห้องนี้คือ: <@${data?.owner || "ไม่ทราบข้อมูล"}>`, ephemeral: true });
    }

    // ตรวจสอบว่าผู้ที่กดปุ่มเป็นเจ้าของห้องหรือไม่
    if (!channel || !data || data.owner !== member.id) {
      if (interaction.isButton() || interaction.isUserSelectMenu()) {
        return interaction.reply({ content: "❌ เฉพาะเจ้าของห้องเท่านั้นที่ควบคุมได้ (และคุณต้องอยู่ในห้องตัวเอง)", ephemeral: true });
      }
      return;
    }

    // --- จัดการปุ่มกดต่างๆ ---
    if (interaction.isButton()) {
      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("m_limit").setTitle("จำกัดจำนวนคน");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("i_limit").setLabel("ระบุจำนวน (0 คือไม่จำกัด)").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }
      
      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`s_${interaction.customId}`).setPlaceholder("เลือกสมาชิกที่ต้องการ...");
        return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      if (interaction.customId === "lock") await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
      if (interaction.customId === "unlock") await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
      return interaction.editReply("✅ ดำเนินการสำเร็จ");
    }

    // --- จัดการเมนูเลือกสมาชิก ---
    if (interaction.isUserSelectMenu()) {
      const targetId = interaction.values[0];
      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === "s_allow") await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
      if (interaction.customId === "s_deny") await channel.permissionOverwrites.edit(targetId, { Connect: false });
      if (interaction.customId === "s_transfer") {
        data.owner = targetId; // เปลี่ยนเจ้าของในหน่วยความจำ
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ManageChannels: true, MoveMembers: true });
      }
      return interaction.editReply("✅ อัปเดตข้อมูลเรียบร้อย");
    }

    // --- จัดการหน้าต่างกรอกข้อมูล (Modal) ---
    if (interaction.isModalSubmit()) {
      await interaction.deferReply({ ephemeral: true });
      if (interaction.customId === "m_limit") {
        const val = parseInt(interaction.fields.getTextInputValue("i_limit"));
        await channel.setUserLimit(isNaN(val) ? 0 : val);
      }
      return interaction.editReply("✅ บันทึกการตั้งค่าแล้ว");
    }

  } catch (err) { console.error(err); }
});

client.login(token);
