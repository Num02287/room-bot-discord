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
  Events
} = require("discord.js");

const express = require('express');

// ===== KEEP ALIVE FOR RENDER =====
const app = express();
app.get('/', (req, res) => res.send('Bot is Online!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web Server started on port ${PORT}`));

// ===== CONFIGURATION (ดึงจาก Environment Variables ของ Render) =====
const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers // ต้องเปิดใน Discord Developer Portal ด้วย
  ]
});

const tempChannels = new Map();

// ===== Slash Commands Registration =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("ระบบห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

// แก้ไขจาก 'ready' เป็น Events.ClientReady ตามคำแนะนำใน Log
client.once(Events.ClientReady, async () => {
  console.log(`✅ Login as: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Successfully registered slash commands.');
  } catch (error) {
    console.error(error);
  }
});

// ===== ระบบสร้างห้องอัตโนมัติ =====
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  if (newState.channelId === createChannelId) {
    const channel = await newState.guild.channels.create({
      name: `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: categoryId
    });

    await newState.setChannel(channel);
    tempChannels.set(channel.id, { owner: newState.member.id });
  }

  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    const data = tempChannels.get(oldState.channelId);

    if (!channel) return;

    if (channel.members.size === 0) {
      channel.delete().catch(() => {});
      tempChannels.delete(oldState.channelId);
      return;
    }

    if (oldState.member.id === data.owner) {
      if (channel.members.size === 1) return;
      const newOwner = channel.members.first();
      data.owner = newOwner.id;
      channel.setName(`📍・ห้องส่วนตัวของ ${newOwner.user.username}`).catch(() => {});
    }
  }
});

// ===== ระบบ Interaction (Buttons, Menus, Modals) =====
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash Command: /room
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      if (!interaction.member.permissions.has("Administrator")) {
        return interaction.reply({ content: "❌ คำสั่งนี้สำหรับแอดมินเท่านั้น", ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
        .setDescription("🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ")
        .setImage("https://i.ibb.co/Kjbw5BGb/image.png")
        .setFooter({ text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ" })
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

      await interaction.deferReply({ ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
      await interaction.deleteReply();
    }

    // Button Handling
    if (interaction.isButton()) {
      const member = interaction.member;
      const channel = member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องเสียงก่อน", ephemeral: true });

      const data = tempChannels.get(channel.id);

      if (interaction.customId === "owner") {
        if (!data) return interaction.reply({ content: "❌ ห้องนี้ไม่ได้อยู่ในระบบ", ephemeral: true });
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle("👑 เจ้าของห้อง")
            .setDescription(`เจ้าของห้องคือ: <@${data.owner}>`)
            .setColor(0xFFD700)],
          ephemeral: true
        });
      }

      if (!data || data.owner !== member.id) return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของห้อง", ephemeral: true });

      if (interaction.customId === "name") {
        const modal = new ModalBuilder().setCustomId("rename_room").setTitle("เปลี่ยนชื่อห้อง");
        const input = new TextInputBuilder().setCustomId("room_name").setLabel("ชื่อใหม่").setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("limit_room").setTitle("ตั้งจำนวนคน");
        const input = new TextInputBuilder().setCustomId("limit_input").setLabel("ใส่จำนวน (0 = ไม่จำกัด)").setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      // Action: Lock/Unlock/Hide/Show
      await interaction.deferReply({ ephemeral: true });
      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        await interaction.editReply({ content: "🔒 ล็อกห้องเรียบร้อยแล้ว" });
      } else if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        await interaction.editReply({ content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว" });
      }
      // เพิ่มฟังก์ชันอื่นๆ ตามโครงสร้างเดิมของคุณได้ที่นี่...
    }

    // Modal Handling
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel.id);
      if (interaction.customId === "rename_room") {
        const name = interaction.fields.getTextInputValue("room_name");
        await channel.setName(`📍・${name}`);
        await interaction.reply({ content: `✏️ เปลี่ยนชื่อเป็น: ${name} แล้ว`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: "❌ เกิดข้อผิดพลาดบางอย่าง", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);
