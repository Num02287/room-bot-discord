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
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000);

const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID; // ID ห้องที่กดเพื่อสร้างห้อง
const categoryId = process.env.CATEGORY_ID;       // ID หมวดหมู่ที่จะให้ห้องไปอยู่

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

const tempChannels = new Map();

client.once("ready", async () => {
  console.log(`🚀 บอทออนไลน์แล้ว: ${client.user.tag}`);
  const commands = [new SlashCommandBuilder().setName("room").setDescription("ส่งแผงควบคุมห้องส่วนตัว")].map(c => c.toJSON());
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

// --- ระบบสร้างห้อง มอบสิทธิ์เจ้าของ และลบเมื่อว่าง ---
client.on("voiceStateUpdate", async (oldState, newState) => {
  // 1. สร้างห้องและมอบสิทธิ์เจ้าของ (Manage Channels/Move Members)
  if (newState.channelId === createChannelId) {
    try {
      const channel = await newState.guild.channels.create({
        name: `📍 ห้องของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId || null,
        permissionOverwrites: [
          { id: newState.guild.id, allow: [PermissionFlagsBits.ViewChannel] },
          { 
            id: newState.member.id, 
            allow: [
              PermissionFlagsBits.Connect, 
              PermissionFlagsBits.ManageChannels, 
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.ViewChannel
            ] 
          }
        ]
      });

      await newState.setChannel(channel);
      tempChannels.set(channel.id, { owner: newState.member.id });
    } catch (e) {
      console.error("เกิดข้อผิดพลาดในการสร้างห้อง:", e);
    }
  }

  // 2. ลบห้องทันทีเมื่อสมาชิกทุกคนออกหมด
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (channel && channel.members.size === 0) {
      tempChannels.delete(oldState.channelId);
      return channel.delete().catch(() => {});
    }
  }
});

// --- ระบบ Interaction (ปุ่มกด และแผงควบคุม) ---
client.on("interactionCreate", async (i) => {
  try {
    if (i.isChatInputCommand() && i.commandName === "room") {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) return i.reply({ content: "❌ เฉพาะแอดมินเท่านั้น", ephemeral: true });
      
      const embed = new EmbedBuilder()
        .setTitle("🏠 Voice Control Panel")
        .setDescription("จัดการห้องของคุณได้ง่ายๆ ผ่านปุ่มด้านล่างนี้")
        .setColor(0x5865F2)
        .setImage("https://i.ibb.co/Kjbw5BGb/image.png");

      const r1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("n").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("l").setEmoji("🔒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("u").setEmoji("🔓").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("li").setEmoji("🎯").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("o").setEmoji("👑").setStyle(ButtonStyle.Secondary)
      );
      const r2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("h").setEmoji("🙈").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("s").setEmoji("👁️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("t").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("a").setEmoji("🧑‍🤝‍🧑").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("d").setEmoji("🚫").setStyle(ButtonStyle.Secondary)
      );

      await i.reply({ content: "✅ ติดตั้งแผงควบคุมเรียบร้อย", ephemeral: true });
      return i.channel.send({ embeds: [embed], components: [r1, r2] });
    }

    if (i.isButton()) {
      const channel = i.member.voice.channel;
      if (!channel) return i.reply({ content: "❌ คุณต้องเข้าห้องเสียงก่อนใช้งานปุ่ม", ephemeral: true });
      
      const data = tempChannels.get(channel.id);
      if (i.customId === "o") return i.reply({ content: `👑 เจ้าของห้องนี้คือ: <@${data?.owner}>`, ephemeral: true });
      
      // ตรวจสอบว่าเป็นเจ้าของห้องหรือไม่
      if (!data || data.owner !== i.member.id) return i.reply({ content: "❌ คุณไม่ใช่เจ้าของห้องนี้!", ephemeral: true });

      // แสดง Modal สำหรับพิมพ์ข้อความ
      if (i.customId === "n") {
        const m = new ModalBuilder().setCustomId("m_n").setTitle("แก้ไขชื่อห้อง");
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("in").setLabel("ชื่อห้องใหม่").setStyle(TextInputStyle.Short)));
        return i.showModal(m);
      }
      if (i.customId === "li") {
        const m = new ModalBuilder().setCustomId("m_li").setTitle("จำกัดจำนวนสมาชิก");
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ili").setLabel("ระบุจำนวน (0 คือไม่จำกัด)").setStyle(TextInputStyle.Short)));
        return i.showModal(m);
      }

      // แสดงเมนูเลือกสมาชิก
      if (["a", "d", "t"].includes(i.customId)) {
        const s = new UserSelectMenuBuilder().setCustomId(`s_${i.customId}`).setPlaceholder("โปรดเลือกสมาชิกที่ต้องการ...");
        return i.reply({ content: "กรุณาเลือกสมาชิกด้านล่าง:", components: [new ActionRowBuilder().addComponents(s)], ephemeral: true });
      }

      // คำสั่งเปลี่ยน Permission ทันที
      if (i.customId === "l") {
        await channel.permissionOverwrites.edit(i.guild.id, { Connect: false });
        await channel.permissionOverwrites.edit(i.member.id, { Connect: true });
        return i.reply({ content: "🔒 ล็อกห้องเรียบร้อย", ephemeral: true });
      }
      if (i.customId === "u") {
        await channel.permissionOverwrites.edit(i.guild.id, { Connect: true });
        return i.reply({ content: "🔓 ปลดล็อกห้องเรียบร้อย", ephemeral: true });
      }
      if (i.customId === "h") {
        await channel.permissionOverwrites.edit(i.guild.id, { ViewChannel: false });
        await channel.permissionOverwrites.edit(i.member.id, { ViewChannel: true });
        return i.reply({ content: "🙈 ซ่อนห้องจากทุกคนเรียบร้อย", ephemeral: true });
      }
      if (i.customId === "s") {
        await channel.permissionOverwrites.edit(i.guild.id, { ViewChannel: true });
        return i.reply({ content: "👁️ แสดงห้องให้ทุกคนเห็นเรียบร้อย", ephemeral: true });
      }
    }

    // จัดการการเลือกสมาชิกจาก Menu
    if (i.isUserSelectMenu()) {
      const channel = i.member.voice.channel;
      const target = i.values[0];
      if (i.customId === "s_a") await channel.permissionOverwrites.edit(target, { Connect: true, ViewChannel: true });
      if (i.customId === "s_d") {
        await channel.permissionOverwrites.edit(target, { Connect: false, ViewChannel: false });
        channel.members.get(target)?.voice.disconnect().catch(() => {});
      }
      if (i.customId === "s_t") {
        tempChannels.get(channel.id).owner = target;
        const u = await client.users.fetch(target);
        await channel.setName(`📍 ห้องของ ${u.username}`).catch(() => {});
        await channel.permissionOverwrites.edit(target, { ManageChannels: true, MoveMembers: true, Connect: true }).catch(() => {});
      }
      return i.reply({ content: "✅ ดำเนินการสำเร็จ", ephemeral: true });
    }

    // จัดการข้อมูลจาก Modal
    if (i.isModalSubmit()) {
      const channel = i.member.voice.channel;
      if (i.customId === "m_n") await channel.setName(`📍 ${i.fields.getTextInputValue("in")}`);
      if (i.customId === "m_li") await channel.setUserLimit(parseInt(i.fields.getTextInputValue("ili")) || 0);
      return i.reply({ content: "✅ อัปเดตข้อมูลห้องแล้ว", ephemeral: true });
    }

  } catch (e) {
    if (!i.replied) i.reply({ content: "❌ เกิดข้อผิดพลาดบางอย่าง", ephemeral: true }).catch(() => {});
  }
});

client.login(token);
