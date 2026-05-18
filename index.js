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

// ===== Web Server ป้องกันบอทหลับบน Render =====
const app = express();
app.get('/', (req, res) => res.send('Bot is Running!'));
app.listen(process.env.PORT || 3000, () => console.log('✅ Web Server พร้อมใช้งาน'));

// ===== ตั้งค่าตัวแปรจาก Environment =====
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

// ===== ลงทะเบียน Slash Command =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("เรียกแผงควบคุมจัดการห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

client.once("ready", async () => {
  console.log(`🚀 บอทออนไลน์ในชื่อ: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ ลงทะเบียนคำสั่ง /room สำเร็จ");
  } catch (err) {
    console.error(err);
  }
});

// ===== [ระบบสร้าง/ลบ ห้องอัตโนมัติ] =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  // สร้างห้องใหม่
  if (newState.channelId === createChannelId) {
    try {
      const channel = await newState.guild.channels.create({
        name: `📍・ห้องของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId || null,
        permissionOverwrites: [
          { id: newState.guild.id, allow: [PermissionFlagsBits.ViewChannel] },
          { 
            id: newState.member.id, 
            allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] 
          }
        ]
      });

      await newState.setChannel(channel);
      tempChannels.set(channel.id, { owner: newState.member.id });
    } catch (err) {
      console.error("❌ สร้างห้องไม่สำเร็จ:", err.message);
    }
  }

  // ลบห้องเมื่อไม่มีคนอยู่
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (channel && channel.members.size === 0) {
      tempChannels.delete(oldState.channelId);
      return channel.delete().catch(() => {});
    }

    // โอนเจ้าของห้องถ้าเจ้าของตัวจริงออก
    const data = tempChannels.get(oldState.channelId);
    if (oldState.member.id === data.owner && channel) {
      const nextMember = channel.members.filter(m => !m.user.bot).first();
      if (nextMember) {
        data.owner = nextMember.id;
        await channel.setName(`📍・ห้องของ ${nextMember.user.username}`).catch(() => {});
        await channel.permissionOverwrites.edit(nextMember.id, { ManageChannels: true, Connect: true }).catch(() => {});
      }
    }
  }
});

// ===== [ระบบจัดการผ่านปุ่มและเมนู] =====
client.on("interactionCreate", async (interaction) => {
  try {
    // 1. คำสั่ง /room
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ เฉพาะแอดมินเท่านั้น", ephemeral: true });
      }
      
      const embed = new EmbedBuilder()
        .setTitle("🏠 Voice Control Panel")
        .setDescription("กดปุ่มด้านล่างเพื่อตั้งค่าห้องเสียงของคุณ\n*(คุณต้องเป็นเจ้าของห้องเท่านั้น)*")
        .setImage("https://i.ibb.co/Kjbw5BGb/image.png")
        .setColor(0x2b2d31);

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("btn_name").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("btn_lock").setEmoji("🔒").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("btn_unlock").setEmoji("🔓").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("btn_limit").setEmoji("🎯").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("btn_owner").setEmoji("👑").setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("btn_hide").setEmoji("🙈").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("btn_show").setEmoji("👁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("btn_transfer").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("btn_allow").setEmoji("🧑‍🤝‍🧑").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("btn_deny").setEmoji("🚫").setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ content: "สร้างแผงควบคุมสำเร็จ!", ephemeral: true });
      return interaction.channel.send({ embeds: [embed], components: [row1, row2] });
    }

    // 2. จัดการปุ่มกด
    if (interaction.isButton()) {
      const channel = interaction.member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องเสียงก่อน", ephemeral: true });

      const data = tempChannels.get(channel.id);
      
      // ดูชื่อเจ้าของ (ใครก็ดูได้)
      if (interaction.customId === "btn_owner") {
        return interaction.reply({ content: `👑 เจ้าของห้องนี้คือ: <@${data?.owner || "ไม่ทราบชื่อ"}>`, ephemeral: true });
      }

      // เช็คว่าเป็นเจ้าของห้องไหม
      if (!data || data.owner !== interaction.member.id) {
        return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของห้องนี้!", ephemeral: true });
      }

      // ปุ่มที่ต้องเปิด Modal (ไม่ต้อง defer)
      if (interaction.customId === "btn_name") {
        const modal = new ModalBuilder().setCustomId("m_name").setTitle("เปลี่ยนชื่อห้อง");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("i_name").setLabel("ระบุชื่อห้องใหม่").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }
      if (interaction.customId === "btn_limit") {
        const modal = new ModalBuilder().setCustomId("m_limit").setTitle("จำกัดจำนวนสมาชิก");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("i_limit").setLabel("ใส่ตัวเลข (0 = ไม่จำกัด)").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }

      // ปุ่มที่ต้องเลือกคน (ไม่ต้อง defer)
      if (["btn_allow", "btn_deny", "btn_transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`s_${interaction.customId.split('_')[1]}`).setPlaceholder("เลือกสมาชิกที่ต้องการ...");
        return interaction.reply({ content: "เลือกสมาชิก:", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      // ปุ่มที่ทำงานทันที (ต้องใช้ deferReply เพื่อความไว)
      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === "btn_lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: false }).catch(()=>{});
        await channel.permissionOverwrites.edit(data.owner, { Connect: true });
        return interaction.editReply("🔒 ล็อกห้องเรียบร้อย!");
      }
      if (interaction.customId === "btn_unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: true }).catch(()=>{});
        return interaction.editReply("🔓 ปลดล็อกห้องแล้ว!");
      }
      if (interaction.customId === "btn_hide") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        return interaction.editReply("🙈 ซ่อนห้องจากทุกคนแล้ว!");
      }
      if (interaction.customId === "btn_show") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
        return interaction.editReply("👁 แสดงห้องให้ทุกคนเห็นแล้ว!");
      }
    }

    // 3. จัดการการเลือกสมาชิก (Select Menu)
    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);
      const targetId = interaction.values[0];

      if (interaction.customId === "s_allow") {
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
        return interaction.reply({ content: `✅ อนุญาต <@${targetId}> เรียบร้อย`, ephemeral: true });
      }
      if (interaction.customId === "s_deny") {
        await channel.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false });
        const member = channel.members.get(targetId);
        if (member) member.voice.disconnect().catch(()=>{});
        return interaction.reply({ content: `🚫 บล็อก <@${targetId}> แล้ว`, ephemeral: true });
      }
      if (interaction.customId === "s_transfer") {
        data.owner = targetId;
        const user = await client.users.fetch(targetId);
        await channel.setName(`📍・ห้องของ ${user.username}`).catch(()=>{});
        return interaction.reply({ content: `🔁 โอนเจ้าของห้องให้ <@${targetId}> แล้ว`, ephemeral: true });
      }
    }

    // 4. จัดการ Modal (Submit)
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      if (interaction.customId === "m_name") {
        const name = interaction.fields.getTextInputValue("i_name");
        await channel.setName(`📍・${name}`);
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อห้องเป็น: **${name}**`, ephemeral: true });
      }
      if (interaction.customId === "m_limit") {
        const limit = parseInt(interaction.fields.getTextInputValue("i_limit"));
        await channel.setUserLimit(isNaN(limit) ? 0 : limit);
        return interaction.reply({ content: `🎯 ปรับจำนวนสมาชิกเป็น: **${limit || 'ไม่จำกัด'}**`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error("Interaction Error:", err);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: "❌ เกิดข้อผิดพลาดในการประมวลผล", ephemeral: true }).catch(()=>{});
    }
  }
});

client.login(token);
