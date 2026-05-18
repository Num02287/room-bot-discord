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

// ===== Slash Commands =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("ระบบห้องส่วนตัว")
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

// ===== ระบบสร้างห้องและโอนเจ้าของอัตโนมัติ =====
client.on("voiceStateUpdate", async (oldState, newState) => {

  // 1. ระบบสร้างห้องอัตโนมัติเมื่อกดเข้าห้องที่กำหนด
  if (newState.channelId === createChannelId) {
    try {
      const channel = await newState.guild.channels.create({
        name: `📍・ห้องของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [
          {
            id: newState.guild.id,
            allow: [GatewayIntentBits.ViewChannel],
            deny: [] // ให้ทุกคนเห็นห้องได้ก่อน แต่เข้าไม่ได้ถ้าสั่งล็อก
          },
          {
            id: newState.member.id,
            allow: [GatewayIntentBits.Connect, GatewayIntentBits.ViewChannel, GatewayIntentBits.ManageChannels]
          }
        ]
      });

      // ย้ายผู้ใช้ไปยังห้องที่สร้างใหม่
      await newState.setChannel(channel);

      // บันทึกข้อมูลเจ้าของ
      tempChannels.set(channel.id, {
        owner: newState.member.id
      });
    } catch (err) {
      console.error("❌ สร้างห้องไม่สำเร็จ:", err);
    }
  }

  // 2. จัดการเมื่อคนออกจากห้อง
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    const data = tempChannels.get(oldState.channelId);

    if (!channel) return;

    // ถ้าไม่มีคนเหลือในห้องเลย -> ลบห้องทิ้ง
    if (channel.members.size === 0) {
      tempChannels.delete(oldState.channelId);
      return channel.delete().catch(()=>{});
    }

    // ระบบโอนเจ้าของอัตโนมัติ (ข้ามบอท)
    if (oldState.member.id === data.owner) {
      const nextMember = channel.members.filter(m => !m.user.bot).first();
      if (nextMember) {
        data.owner = nextMember.id;
        await channel.setName(`📍・ห้องของ ${nextMember.user.username}`).catch(()=>{});
        await channel.permissionOverwrites.edit(nextMember.id, { Connect: true, ManageChannels: true, ViewChannel: true }).catch(()=>{});
      }
    }
  }
});

// ===== ระบบ Interaction (Buttons, Menus, Modals) =====
client.on("interactionCreate", async (interaction) => {
  try {
    // ===== /room (สำหรับแอดมิน) =====
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      if (!interaction.member.permissions.has("Administrator")) {
        return interaction.reply({ content: "❌ คำสั่งนี้สำหรับแอดมินเท่านั้น", ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
        .setDescription("🔹 กดปุ่มด้านล่างเพื่อจัดการห้องเสียงของคุณ\n🔹 คุณต้องอยู่ในห้องของตัวเองเพื่อใช้งาน")
        .setImage("https://i.ibb.co/Kjbw5BGb/image.png")
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

      await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
      return interaction.reply({ content: "ส่งแผงควบคุมแล้ว", ephemeral: true });
    }

    // ===== จัดการปุ่มกด (Buttons) =====
    if (interaction.isButton()) {
      const member = interaction.member;
      const channel = member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องก่อน", ephemeral: true });

      const data = tempChannels.get(channel.id);

      if (interaction.customId === "owner") {
        return interaction.reply({ content: `👑 เจ้าของห้องคือ: <@${data?.owner || "ไม่พบข้อมูล"}>`, ephemeral: true });
      }

      if (!data || data.owner !== member.id) return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของห้องนี้", ephemeral: true });

      if (interaction.customId === "name") {
        const modal = new ModalBuilder().setCustomId("rename_room").setTitle("เปลี่ยนชื่อห้อง");
        const input = new TextInputBuilder().setCustomId("room_name").setLabel("ระบุชื่อใหม่").setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("limit_room").setTitle("ตั้งจำนวนคน");
        const input = new TextInputBuilder().setCustomId("limit_input").setLabel("ระบุจำนวน (0 = ไม่จำกัด)").setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`select_${interaction.customId}`).setPlaceholder("เลือกสมาชิก...");
        return interaction.reply({ content: "เลือกสมาชิกที่ต้องการจัดการ", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      // แก้ไขการ Lock/Unlock ให้ทำงานได้จริง
      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: false }).catch(()=>{});
        await channel.permissionOverwrites.edit(data.owner, { Connect: true, ViewChannel: true });
        return interaction.editReply({ content: "🔒 ล็อกห้องแล้ว คนทั่วไปเข้าไม่ได้" });
      }

      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: true }).catch(()=>{});
        return interaction.editReply({ content: "🔓 ปลดล็อกห้องแล้ว" });
      }

      if (interaction.customId === "hide") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        return interaction.editReply({ content: "🙈 ซ่อนห้องจากคนทั่วไปแล้ว" });
      }

      if (interaction.customId === "show") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
        return interaction.editReply({ content: "👁 แสดงห้องให้ทุกคนเห็นแล้ว" });
      }
    }

    // ===== จัดการ Select Menus =====
    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);
      if (!channel || !data || data.owner !== interaction.member.id) return interaction.reply({ content: "❌ ผิดพลาด", ephemeral: true });

      const targetId = interaction.values[0];

      if (interaction.customId === "select_allow") {
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
        return interaction.reply({ content: `✅ อนุญาต <@${targetId}> แล้ว`, ephemeral: true });
      }
      if (interaction.customId === "select_deny") {
        await channel.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false });
        const targetMember = channel.members.get(targetId);
        if (targetMember) targetMember.voice.disconnect().catch(()=>{});
        return interaction.reply({ content: `🚫 ห้าม <@${targetId}> เข้าห้อง`, ephemeral: true });
      }
      if (interaction.customId === "select_transfer") {
        data.owner = targetId;
        const user = await client.users.fetch(targetId);
        await channel.setName(`📍・ห้องของ ${user.username}`).catch(()=>{});
        return interaction.reply({ content: `🔁 โอนความเป็นเจ้าของห้องเรียบร้อย`, ephemeral: true });
      }
    }

    // ===== จัดการ Modals =====
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      if (interaction.customId === "rename_room") {
        const name = interaction.fields.getTextInputValue("room_name");
        await channel.setName(`📍・${name}`);
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อห้องเป็น: ${name}`, ephemeral: true });
      }
      if (interaction.customId === "limit_room") {
        const limit = parseInt(interaction.fields.getTextInputValue("limit_input"));
        await channel.setUserLimit(limit || 0);
        return interaction.reply({ content: `🎯 ตั้งจำนวนคนเป็น: ${limit || "ไม่จำกัด"}`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
  }
});

client.login(token);
