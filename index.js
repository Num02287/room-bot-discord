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
const app = express();
app.get('/', (req, res) => res.send('Bot is Online!'));
app.listen(process.env.PORT || 3000, () => console.log('Web Server is ready.'));

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

const commands = [
  new SlashCommandBuilder().setName("room").setDescription("ส่งหน้าจอจัดการห้องส่วนตัว")
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

// ===== ระบบสร้างห้องอัตโนมัติ =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  // สร้างห้องใหม่
  if (newState.channelId === createChannelId) {
    try {
      const channel = await newState.guild.channels.create({
        name: `📍・ห้องของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [
           { id: newState.guild.id, allow: [GatewayIntentBits.ViewChannel], deny: [GatewayIntentBits.Connect] },
           { id: newState.member.id, allow: [GatewayIntentBits.Connect, GatewayIntentBits.ManageChannels, GatewayIntentBits.MoveMembers] }
        ]
      });

      await newState.setChannel(channel);
      tempChannels.set(channel.id, { owner: newState.member.id });
    } catch (e) { console.error("Error creating channel:", e); }
  }

  // ลบห้อง/โอนเจ้าของ
  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    const data = tempChannels.get(oldState.channelId);
    if (!channel) return;

    if (channel.members.size === 0) {
      channel.delete().catch(() => {});
      tempChannels.delete(oldState.channelId);
    } else if (oldState.member.id === data.owner) {
      const newOwner = channel.members.first();
      data.owner = newOwner.id;
      channel.setName(`📍・ห้องของ ${newOwner.user.username}`).catch(() => {});
    }
  }
});

// ===== ระบบจัดการ Interaction (Commands, Buttons, Modals) =====
client.on("interactionCreate", async (interaction) => {
  try {
    // 1. คำสั่ง Slash Command /room
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "room") {
        const embed = new EmbedBuilder()
          .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
          .setDescription("🔹 ใช้จัดการช่องเสียงส่วนตัวของคุณ\n🔹 คุณต้องเป็นเจ้าของห้องถึงจะใช้ปุ่มเหล่านี้ได้")
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

        await interaction.reply({ embeds: [embed], components: [row1, row2] });
      }
    }

    // 2. จัดการปุ่มกด
    if (interaction.isButton()) {
      const member = interaction.member;
      const channel = member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องเสียงก่อน", ephemeral: true });

      const data = tempChannels.get(channel.id);
      
      // ดูเจ้าของห้อง (ใครก็ดูได้)
      if (interaction.customId === "owner") {
        if (!data) return interaction.reply({ content: "❌ ห้องนี้ไม่ได้อยู่ในระบบ", ephemeral: true });
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle("👑 เจ้าของห้อง")
            .setDescription(`เจ้าของห้องปัจจุบันคือ: <@${data.owner}>`)
            .setColor(0xFFD700)],
          ephemeral: true
        });
      }

      // ตรวจสอบว่าเป็นเจ้าของหรือไม่
      if (!data || data.owner !== member.id) return interaction.reply({ content: "❌ เฉพาะเจ้าของห้องเท่านั้นที่สั่งได้", ephemeral: true });

      if (interaction.customId === "name") {
        const modal = new ModalBuilder().setCustomId("rename_room").setTitle("เปลี่ยนชื่อห้อง");
        const input = new TextInputBuilder().setCustomId("room_name").setLabel("ระบุชื่อห้องใหม่").setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("limit_room").setTitle("ตั้งจำนวนคน");
        const input = new TextInputBuilder().setCustomId("limit_input").setLabel("ใส่จำนวน (0 = ไม่จำกัด)").setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`select_${interaction.customId}`);
        return interaction.reply({ content: "โปรดเลือกสมาชิกที่ต้องการจัดการ", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      // ปุ่มที่ใช้การจัดการ Permissions
      await interaction.deferReply({ ephemeral: true });
      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        return interaction.editReply({ content: "🔒 ล็อกห้องเรียบร้อย" });
      }
      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        return interaction.editReply({ content: "🔓 ปลดล็อกห้องเรียบร้อย" });
      }
      if (interaction.customId === "hide") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        return interaction.editReply({ content: "🙈 ซ่อนห้องเรียบร้อย" });
      }
      if (interaction.customId === "show") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
        return interaction.editReply({ content: "👁 แสดงห้องเรียบร้อย" });
      }
    }

    // 3. จัดการ User Select Menu
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
        await channel.permissionOverwrites.edit(targetId, { Connect: false });
        return interaction.reply({ content: `🚫 ห้าม <@${targetId}> เข้าห้องแล้ว`, ephemeral: true });
      }
      if (interaction.customId === "select_transfer") {
        data.owner = targetId;
        const targetMember = await interaction.guild.members.fetch(targetId);
        await channel.setName(`📍・ห้องของ ${targetMember.user.username}`);
        return interaction.reply({ content: `🔁 โอนความเป็นเจ้าของให้ <@${targetId}> แล้ว`, ephemeral: true });
      }
    }

    // 4. จัดการ Modal Submit
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
        return interaction.reply({ content: `🎯 ตั้งค่าจำกัดผู้เข้าชมเป็น: ${limit || 'ไม่จำกัด'}`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
       interaction.reply({ content: "❌ เกิดข้อผิดพลาดในการประมวลผล", ephemeral: true }).catch(()=>{});
    }
  }
});

client.login(token);
