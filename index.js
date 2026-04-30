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
// สร้าง Web Server เล็กๆ เพื่อให้ Render ไม่สั่งบอท "หลับ" (Spin down)
const app = express();
app.get('/', (req, res) => res.send('Bot Voice Room is Online!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web Server started on port ${PORT}`));

// ===== CONFIGURATION =====
// ดึงข้อมูลจาก Environment Variables ในหน้า Dashboard ของ Render
const token = process.env.TOKEN;
const createChannelId = process.env.CREATE_CHANNEL_ID;
const categoryId = process.env.CATEGORY_ID;
const allowRoleId = process.env.ALLOW_ROLE_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers // สำคัญ: ต้องเปิดใน Discord Developer Portal ด้วย
  ]
});

const tempChannels = new Map();

// ===== Slash Commands =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("ระบบห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

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
    // ===== /room =====
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

    // ===== BUTTONS =====
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
            .setColor(0xFFD700)
            .setThumbnail(interaction.guild.members.cache.get(data.owner)?.user.displayAvatarURL())],
          ephemeral: true
        });
      }

      if (!data || data.owner !== member.id) return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของห้อง", ephemeral: true });

      // Modal Buttons (Rename / Limit)
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

      // Selection Menus
      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const titles = { allow: "เลือกคนที่จะอนุญาต", deny: "🚫 เลือกคนที่ห้ามเข้า", transfer: "เลือกคนที่จะโอนห้อง" };
        const menu = new UserSelectMenuBuilder().setCustomId(`select_${interaction.customId}`);
        return interaction.reply({ content: titles[interaction.customId], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      // Permission Toggles
      await interaction.deferReply({ ephemeral: true });
      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: false });
        await channel.permissionOverwrites.edit(data.owner, { Connect: true, ViewChannel: true });
        return interaction.editReply({ content: "🔒 ล็อกห้องเรียบร้อยแล้ว" });
      }

      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: true });
        return interaction.editReply({ content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว" });
      }

      if (interaction.customId === "hide") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { ViewChannel: false }).catch(()=>{});
        await channel.permissionOverwrites.edit(member.id, { ViewChannel: true, Connect: true });
        return interaction.editReply({ content: "🙈 ซ่อนห้องแล้ว" });
      }

      if (interaction.customId === "show") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true, Connect: false });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { ViewChannel: true, Connect: false }).catch(()=>{});
        return interaction.editReply({ content: "👁 แสดงห้องแล้ว (สถานะล็อก)" });
      }
    }

    // ===== USER SELECTION HANDLING =====
    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);
      if (!channel || !data || data.owner !== interaction.member.id) return interaction.reply({ content: "❌ ผิดพลาด", ephemeral: true });

      const targetId = interaction.values[0];
      if (interaction.customId === "select_allow") {
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
        return interaction.reply({ content: `✅ อนุญาต <@${targetId}>`, ephemeral: true });
      }
      if (interaction.customId === "select_deny") {
        await channel.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false });
        return interaction.reply({ content: `🚫 ห้าม <@${targetId}> เข้าห้อง`, ephemeral: true });
      }
      if (interaction.customId === "select_transfer") {
        data.owner = targetId;
        const user = await interaction.guild.members.fetch(targetId);
        await channel.setName(`📍・ห้องส่วนตัวของ ${user.user.username}`);
        return interaction.reply({ content: `🔁 โอนห้องให้ <@${targetId}> แล้ว`, ephemeral: true });
      }
    }

    // ===== MODAL SUBMISSION =====
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);
      if (!channel || !data || data.owner !== interaction.member.id) return interaction.reply({ content: "❌ ผิดพลาด", ephemeral: true });

      if (interaction.customId === "rename_room") {
        const name = interaction.fields.getTextInputValue("room_name");
        await channel.setName(`📍・${name}`);
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อห้องเป็น: ${name}`, ephemeral: true });
      }
      if (interaction.customId === "limit_room") {
        const limit = parseInt(interaction.fields.getTextInputValue("limit_input"));
        await channel.setUserLimit(isNaN(limit) ? 0 : limit);
        return interaction.reply({ content: `🎯 ตั้งค่าจำกัดจำนวนคนแล้ว`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: "❌ เกิดข้อผิดพลาดในระบบ", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);
