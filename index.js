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
app.get('/', (req, res) => res.send('Bot is ready!'));
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
  console.log(`✅ บอททำงานแล้ว: ${client.user.tag}`);
  try {
    const commands = [new SlashCommandBuilder().setName("room").setDescription("แผงควบคุมห้อง")].map(c => c.toJSON());
    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (e) {}
});

// --- ระบบจัดการห้อง (สร้าง/ลบ/ตั้งเจ้าของ) ---
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (newState.channelId === createChannelId) {
    try {
      const channel = await newState.guild.channels.create({
        name: `📍 ${newState.member.user.username}`,
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
    } catch (e) {}
  }

  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (channel && channel.members.size === 0) {
      tempChannels.delete(oldState.channelId);
      channel.delete().catch(() => {});
    }
  }
});

// --- ระบบปุ่มกดและคำสั่ง (จัดการ Interaction) ---
client.on("interactionCreate", async (i) => {
  try {
    if (i.isChatInputCommand() && i.commandName === "room") {
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      
      const embed = new EmbedBuilder()
        .setTitle("🏠 Voice Control Panel")
        .setDescription("จัดการห้องของคุณที่นี่")
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
        new ButtonBuilder().setCustomId("s").setEmoji("👁️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("t").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("a").setEmoji("🧑‍🤝‍🧑").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("d").setEmoji("🚫").setStyle(ButtonStyle.Secondary)
      );

      await i.reply({ content: "✅ ติดตั้งสำเร็จ", ephemeral: true });
      return i.channel.send({ embeds: [embed], components: [r1, r2] });
    }

    if (i.isButton()) {
      const channel = i.member.voice.channel;
      if (!channel) return i.reply({ content: "⚠️ เข้าห้องก่อนครับ", ephemeral: true });
      
      const data = tempChannels.get(channel.id);
      if (i.customId === "o") return i.reply({ content: `👑 เจ้าของ: <@${data?.owner}>`, ephemeral: true });
      if (!data || data.owner !== i.member.id) return i.reply({ content: "❌ เฉพาะเจ้าของห้อง", ephemeral: true });

      if (i.customId === "n") {
        const m = new ModalBuilder().setCustomId("m_n").setTitle("ชื่อห้อง");
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("in").setLabel("ระบุชื่อ").setStyle(TextInputStyle.Short)));
        return i.showModal(m);
      }
      if (i.customId === "li") {
        const m = new ModalBuilder().setCustomId("m_li").setTitle("จำกัดคน");
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("ili").setLabel("จำนวน").setStyle(TextInputStyle.Short)));
        return i.showModal(m);
      }

      // ระบบจัดการ Permission
      await i.deferReply({ ephemeral: true });
      if (i.customId === "l") await channel.permissionOverwrites.edit(i.guild.id, { Connect: false });
      if (i.customId === "u") await channel.permissionOverwrites.edit(i.guild.id, { Connect: true });
      if (i.customId === "h") await channel.permissionOverwrites.edit(i.guild.id, { ViewChannel: false });
      if (i.customId === "s") await channel.permissionOverwrites.edit(i.guild.id, { ViewChannel: true });
      
      if (["a", "d", "t"].includes(i.customId)) {
        const s = new UserSelectMenuBuilder().setCustomId(`s_${i.customId}`).setPlaceholder("เลือกสมาชิก");
        return i.editReply({ content: "เลือกสมาชิก:", components: [new ActionRowBuilder().addComponents(s)] });
      }
      return i.editReply({ content: "✅ เรียบร้อย" });
    }

    if (i.isUserSelectMenu()) {
      await i.deferReply({ ephemeral: true });
      const channel = i.member.voice.channel;
      const target = i.values[0];
      if (i.customId === "s_a") await channel.permissionOverwrites.edit(target, { Connect: true, ViewChannel: true });
      if (i.customId === "s_d") {
        await channel.permissionOverwrites.edit(target, { Connect: false, ViewChannel: false });
        channel.members.get(target)?.voice.disconnect().catch(() => {});
      }
      if (i.customId === "s_t") {
        tempChannels.get(channel.id).owner = target;
        await channel.permissionOverwrites.edit(target, { ManageChannels: true, MoveMembers: true });
      }
      return i.editReply({ content: "✅ สำเร็จ" });
    }

    if (i.isModalSubmit()) {
      await i.deferReply({ ephemeral: true });
      const channel = i.member.voice.channel;
      if (i.customId === "m_n") await channel.setName(`📍 ${i.fields.getTextInputValue("in")}`);
      if (i.customId === "m_li") await channel.setUserLimit(parseInt(i.fields.getTextInputValue("ili")) || 0);
      return i.editReply({ content: "✅ อัปเดตข้อมูลแล้ว" });
    }
  } catch (e) {
    // ปิดการส่ง Error กลับหน้า Discord
  }
});

client.login(token);
