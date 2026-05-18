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

// ===== Web Server สำหรับรันบน Render =====
const app = express();
app.get('/', (req, res) => res.send('Bot is Online!'));
app.listen(process.env.PORT || 3000, () => console.log('Web Server is ready.'));

// ===== ดึงข้อมูลจาก Environment Variables =====
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

// ===== ลงทะเบียน Slash Commands =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("เปิดแผงควบคุมระบบห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

client.once("ready", async () => {
  console.log(`✅ Login as: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (err) {
    console.error(err);
  }
});

// ===== 1. ระบบสร้างห้องและโอนเจ้าของอัตโนมัติ =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  // สร้างห้องใหม่เมื่อคนเข้าห้องที่กำหนด
  if (newState.channelId === createChannelId) {
    const channel = await newState.guild.channels.create({
      name: `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: categoryId,
      permissionOverwrites: [
        {
          id: newState.member.id,
          allow: [GatewayIntentBits.Connect, GatewayIntentBits.ManageChannels, GatewayIntentBits.MoveMembers, GatewayIntentBits.ViewChannel]
        }
      ]
    });

    await newState.setChannel(channel);
    tempChannels.set(channel.id, { owner: newState.member.id });
  }

  // จัดการเมื่อคนออกจากห้อง
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    const data = tempChannels.get(oldState.channelId);
    if (!channel) return;

    if (channel.members.size === 0) {
      channel.delete().catch(() => {});
      tempChannels.delete(oldState.channelId);
      return;
    }

    // โอนเจ้าของอัตโนมัติ
    if (oldState.member.id === data.owner) {
      const newOwner = channel.members.first();
      data.owner = newOwner.id;
      await channel.setName(`📍・ห้องส่วนตัวของ ${newOwner.user.username}`).catch(() => {});
      await channel.permissionOverwrites.edit(newOwner.id, { Connect: true, ManageChannels: true, MoveMembers: true, ViewChannel: true });
    }
  }
});

// ===== 2. ระบบจัดการ Interaction (Commands, Buttons, Menus, Modals) =====
client.on("interactionCreate", async (interaction) => {
  try {
    // คำสั่ง /room เพื่อส่ง Control Panel
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
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

      await interaction.reply({ content: "ส่งแผงควบคุมแล้ว", ephemeral: true });
      return await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
    }

    // จัดการปุ่มกด
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

      if (!data || data.owner !== member.id) return interaction.reply({ content: "❌ เฉพาะเจ้าของห้องเท่านั้น", ephemeral: true });

      if (interaction.customId === "name") {
        const modal = new ModalBuilder().setCustomId("rename_room").setTitle("เปลี่ยนชื่อห้อง");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("room_name").setLabel("ชื่อใหม่").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }

      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("limit_room").setTitle("ตั้งจำนวนคน");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("limit_input").setLabel("จำนวน (0 = ไม่จำกัด)").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }

      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`select_${interaction.customId}`).setPlaceholder("เลือกสมาชิก...");
        return interaction.reply({ content: "โปรดเลือกสมาชิก", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      if (interaction.customId === "lock") await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
      if (interaction.customId === "unlock") await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
      if (interaction.customId === "hide") await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
      if (interaction.customId === "show") await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
      return interaction.editReply("✅ ดำเนินการสำเร็จ");
    }

    // จัดการ Select Menu
    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      const targetId = interaction.values[0];
      const data = tempChannels.get(channel?.id);

      if (interaction.customId === "select_allow") await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
      if (interaction.customId === "select_deny") await channel.permissionOverwrites.edit(targetId, { Connect: false });
      if (interaction.customId === "select_transfer") {
        data.owner = targetId;
        const targetMember = await interaction.guild.members.fetch(targetId);
        await channel.setName(`📍・ห้องส่วนตัวของ ${targetMember.user.username}`);
      }
      return interaction.reply({ content: "✅ อัปเดตข้อมูลแล้ว", ephemeral: true });
    }

    // จัดการ Modal Submit
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      if (interaction.customId === "rename_room") {
        const name = interaction.fields.getTextInputValue("room_name");
        await channel.setName(`📍・${name}`);
        return interaction.reply({ content: "✏️ เปลี่ยนชื่อเรียบร้อย", ephemeral: true });
      }
      if (interaction.customId === "limit_room") {
        const limit = parseInt(interaction.fields.getTextInputValue("limit_input"));
        await channel.setUserLimit(isNaN(limit) ? 0 : limit);
        return interaction.reply({ content: "🎯 ตั้งค่าจำนวนเรียบร้อย", ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) interaction.reply({ content: "❌ เกิดข้อผิดพลาด", ephemeral: true }).catch(() => {});
  }
});

client.login(token);
