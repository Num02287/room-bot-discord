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
app.get('/', (req, res) => res.send('Bot is Online!'));
app.listen(process.env.PORT || 3000, () => console.log('Web Server Ready.'));

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

// ===== ระบบสร้างห้อง (ทำงานเบื้องหลัง) =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (newState.channelId === createChannelId) {
    try {
      const channel = await newState.guild.channels.create({
        name: `📍・ห้องของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId || null,
        permissionOverwrites: [
          { id: newState.guild.id, allow: [PermissionFlagsBits.ViewChannel] },
          { id: newState.member.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }
        ]
      });
      await newState.setChannel(channel);
      tempChannels.set(channel.id, { owner: newState.member.id });
    } catch (err) { console.error("Create Error:", err); }
  }

  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (!channel) return;
    if (channel.members.size === 0) {
      tempChannels.delete(oldState.channelId);
      return channel.delete().catch(() => {});
    }
    const data = tempChannels.get(oldState.channelId);
    if (oldState.member.id === data.owner) {
      const nextOwner = channel.members.filter(m => !m.user.bot).first();
      if (nextOwner) {
        data.owner = nextOwner.id;
        channel.setName(`📍・ห้องของ ${nextOwner.user.username}`).catch(() => {});
      }
    }
  }
});

// ===== ระบบ Interaction (เน้นตอบไว) =====
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ เฉพาะแอดมิน", ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setTitle("🏠 Voice Control Panel")
        .setDescription("จัดการห้องของคุณได้ที่นี่")
        .setColor(0x2b2d31);

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

      await interaction.reply({ content: "กำลังส่งแผงควบคุม...", ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
    }

    if (interaction.isButton()) {
      const channel = interaction.member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ เข้าห้องก่อนครับ", ephemeral: true });

      const data = tempChannels.get(channel.id);
      if (interaction.customId === "owner") {
        return interaction.reply({ content: `👑 เจ้าของ: <@${data?.owner}>`, ephemeral: true });
      }

      if (!data || data.owner !== interaction.member.id) {
        return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของ", ephemeral: true });
      }

      // สำหรับปุ่มที่ต้องขึ้น Modal หรือ Select Menu ให้ตอบกลับทันที
      if (["name", "limit", "allow", "deny", "transfer"].includes(interaction.customId)) {
        if (interaction.customId === "name") {
          const modal = new ModalBuilder().setCustomId("m_name").setTitle("เปลี่ยนชื่อห้อง");
          modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("i_name").setLabel("ชื่อใหม่").setStyle(TextInputStyle.Short)));
          return interaction.showModal(modal);
        }
        // ... (ปุ่มอื่นๆ)
        const userSelect = new UserSelectMenuBuilder().setCustomId(`s_${interaction.customId}`).setPlaceholder("เลือกสมาชิก");
        return interaction.reply({ components: [new ActionRowBuilder().addComponents(userSelect)], ephemeral: true });
      }

      // สำหรับปุ่มกดแล้วทำงานเลย (Lock/Hide) ให้ Defer ทันทีป้องกันการค้าง
      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        await channel.permissionOverwrites.edit(data.owner, { Connect: true });
        return interaction.editReply("🔒 ล็อกแล้ว");
      }
      // ... (Unlock/Hide/Show คล้ายกัน)
    }

    // Modal & Menu handling (ประหยัดเวลาด้วยการใช้ deferUpdate)
    if (interaction.isUserSelectMenu()) {
      await interaction.deferUpdate();
      // ... logic ของคุณ
    }

  } catch (err) { console.error(err); }
});

client.login(token);
