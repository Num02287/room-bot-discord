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
app.get('/', (req, res) => res.send('Voice System Online'));
app.listen(process.env.PORT || 3000);

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

client.once("ready", async () => {
  console.log(`✅ ระบบห้องอัตโนมัติออนไลน์: ${client.user.tag}`);
  const commands = [new SlashCommandBuilder().setName("room").setDescription("แผงควบคุมห้องส่วนตัว")].map(c => c.toJSON());
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

// --- ระบบสร้างและลบห้องอัตโนมัติ ---
client.on("voiceStateUpdate", async (oldState, newState) => {
  
  // 1. สร้างห้องเมื่อคนกดเข้าห้องหลัก
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
              PermissionFlagsBits.ViewChannel
            ] 
          }
        ]
      });

      await newState.setChannel(channel);
      tempChannels.set(channel.id, { owner: newState.member.id });
    } catch (e) {
      console.error("สร้างห้องไม่สำเร็จ:", e);
    }
  }

  // 2. ลบห้องทันทีเมื่อ "ไม่มีคนอยู่ในห้องแล้ว"
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    
    // ถ้าห้องว่าง (members.size เป็น 0) ให้ลบทันที
    if (channel && channel.members.size === 0) {
      tempChannels.delete(oldState.channelId);
      return channel.delete().catch(() => {});
    }
  }
});

// --- ระบบปุ่มควบคุม (ตอบสนองทันที) ---
client.on("interactionCreate", async (i) => {
  try {
    if (i.isChatInputCommand() && i.commandName === "room") {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) return i.reply({ content: "❌ เฉพาะแอดมิน", ephemeral: true });
      
      const embed = new EmbedBuilder()
        .setTitle("🏠 Voice Control Panel")
        .setDescription("ใช้ปุ่มด้านล่างเพื่อจัดการห้องเสียงของคุณ")
        .setColor(0x2b2d31);

      const r1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("n").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("l").setEmoji("🔒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("u").setEmoji("🔓").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("li").setEmoji("🎯").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("o").setEmoji("👑").setStyle(ButtonStyle.Secondary)
      );
      const r2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("h").setEmoji("🙈").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("s").setEmoji("👁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("t").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("a").setEmoji("🧑‍🤝‍🧑").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("d").setEmoji("🚫").setStyle(ButtonStyle.Secondary)
      );

      await i.reply({ content: "✅ ติดตั้งแผงควบคุมแล้ว", ephemeral: true });
      return i.channel.send({ embeds: [embed], components: [r1, r2] });
    }

    if (i.isButton()) {
      const channel = i.member.voice.channel;
      if (!channel) return i.reply({ content: "❌ คุณต้องอยู่ในห้องก่อน", ephemeral: true });
      
      const data = tempChannels.get(channel.id);
      if (i.customId === "o") return i.reply({ content: `👑 เจ้าของห้อง: <@${data?.owner}>`, ephemeral: true });
      if (!data || data.owner !== i.member.id) return i.reply({ content: "❌ คุณไม่ใช่เจ้าของห้อง", ephemeral: true });

      // Modal ทันที
      if (i.customId === "n") {
        const m = new ModalBuilder().setCustomId("m_n").setTitle("ชื่อห้อง");
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("in").setLabel("ชื่อใหม่").setStyle(TextInputStyle.Short)));
        return i.showModal(m);
      }
      if (i.customId === "li") {
        const m = new ModalBuilder().setCustomId("m_li").setTitle("จำกัดสมาชิก");
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ili").setLabel("จำนวนคน (0=ไม่จำกัด)").setStyle(TextInputStyle.Short)));
        return i.showModal(m);
      }
      if (["a", "d", "t"].includes(i.customId)) {
        const s = new UserSelectMenuBuilder().setCustomId(`s_${i.customId}`).setPlaceholder("เลือกสมาชิก");
        return i.reply({ content: "จัดการสมาชิก:", components: [new ActionRowBuilder().addComponents(s)], ephemeral: true });
      }

      // คำสั่งล็อก/ซ่อน (ทำงานทันที)
      if (i.customId === "l") {
        await channel.permissionOverwrites.edit(i.guild.id, { Connect: false });
        return i.reply({ content: "🔒 ล็อกห้องแล้ว", ephemeral: true });
      }
      if (i.customId === "u") {
        await channel.permissionOverwrites.edit(i.guild.id, { Connect: true });
        return i.reply({ content: "🔓 ปลดล็อกห้องแล้ว", ephemeral: true });
      }
      if (i.customId === "h") {
        await channel.permissionOverwrites.edit(i.guild.id, { ViewChannel: false });
        return i.reply({ content: "🙈 ซ่อนห้องแล้ว", ephemeral: true });
      }
      if (i.customId === "s") {
        await channel.permissionOverwrites.edit(i.guild.id, { ViewChannel: true });
        return i.reply({ content: "👁 แสดงห้องแล้ว", ephemeral: true });
      }
    }

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
        await channel.permissionOverwrites.edit(target, { ManageChannels: true, MoveMembers: true }).catch(() => {});
      }
      return i.reply({ content: "✅ ดำเนินการสำเร็จ", ephemeral: true });
    }

    if (i.isModalSubmit()) {
      const channel = i.member.voice.channel;
      if (i.customId === "m_n") await channel.setName(`📍 ${i.fields.getTextInputValue("in")}`);
      if (i.customId === "m_li") await channel.setUserLimit(parseInt(i.fields.getTextInputValue("ili")) || 0);
      return i.reply({ content: "✅ อัปเดตแล้ว", ephemeral: true });
    }
  } catch (e) {
    if (!i.replied) i.reply({ content: "❌ มีข้อผิดพลาด", ephemeral: true }).catch(() => {});
  }
});

client.login(token);
