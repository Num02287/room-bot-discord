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

// ===== ระบบสร้างห้องอัตโนมัติ =====
client.on("voiceStateUpdate", async (oldState, newState) => {
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
      channel.delete().catch(()=>{});
      tempChannels.delete(oldState.channelId);
      return;
    }

    if (oldState.member.id === data.owner) {
      if (channel.members.size === 1) return;
      const newOwner = channel.members.first();
      data.owner = newOwner.id;
      channel.setName(`📍・ห้องส่วนตัวของ ${newOwner.user.username}`).catch(()=>{});
    }
  }
});

// ===== ระบบ Interaction (ตอบทันที / เลือกได้หลายคน / มองเห็นห้องทั้งคู่) =====
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      if (!interaction.member.permissions.has("Administrator")) {
        return interaction.reply({ content: "❌ สำหรับแอดมินเท่านั้น", ephemeral: true });
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

      await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
      return interaction.reply({ content: "✅ ติดตั้งเมนูควบคุมเรียบร้อย", ephemeral: true });
    }

    if (interaction.isButton()) {
      const channel = interaction.member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องเสียงก่อน", ephemeral: true });

      const data = tempChannels.get(channel.id);
      if (interaction.customId === "owner") {
        return interaction.reply({ content: `👑 เจ้าของห้องคือ: <@${data?.owner || 'ไม่พบข้อมูล'}>`, ephemeral: true });
      }

      if (!data || data.owner !== interaction.member.id) {
        return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของห้อง", ephemeral: true });
      }

      if (interaction.customId === "name") {
        const modal = new ModalBuilder().setCustomId("rename_room").setTitle("เปลี่ยนชื่อห้อง");
        const input = new TextInputBuilder().setCustomId("room_name").setLabel("ชื่อใหม่").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("limit_room").setTitle("ตั้งจำนวนคน");
        const input = new TextInputBuilder().setCustomId("limit_input").setLabel("ใส่จำนวน (0 = ไม่จำกัด)").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const isTransfer = interaction.customId === "transfer";
        const menu = new UserSelectMenuBuilder()
          .setCustomId(`select_${interaction.customId}`)
          .setPlaceholder(isTransfer ? "เลือกสมาชิก 1 คนเพื่อโอนห้อง" : "เลือกสมาชิก (เลือกได้หลายคน)")
          .setMinValues(1)
          .setMaxValues(isTransfer ? 1 : 10); // อนุญาต/บล็อก เลือกได้สูงสุด 10 คน

        return interaction.reply({ 
          content: "👤 โปรดเลือกสมาชิกที่ต้องการ", 
          components: [new ActionRowBuilder().addComponents(menu)], 
          ephemeral: true 
        });
      }

      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        return interaction.reply({ content: "🔒 ล็อกห้องแล้ว (ยังมองเห็นแต่เข้าไม่ได้)", ephemeral: true });
      }
      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        return interaction.reply({ content: "🔓 ปลดล็อกห้องแล้ว", ephemeral: true });
      }
      if (interaction.customId === "hide") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        return interaction.reply({ content: "🙈 ซ่อนห้องจากทุกคนแล้ว", ephemeral: true });
      }
      if (interaction.customId === "show") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
        return interaction.reply({ content: "👁 แสดงห้องให้ทุกคนเห็นแล้ว", ephemeral: true });
      }
    }

    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      const targetIds = interaction.values;

      if (interaction.customId === "select_allow") {
        for (const id of targetIds) {
          await channel.permissionOverwrites.edit(id, { ViewChannel: true, Connect: true });
        }
        return interaction.reply({ content: `✅ อนุญาตสมาชิก (${targetIds.length} คน) เรียบร้อย`, ephemeral: true });
      }

      if (interaction.customId === "select_deny") {
        for (const id of targetIds) {
          await channel.permissionOverwrites.edit(id, { ViewChannel: true, Connect: false });
          const targetMember = channel.members.get(id);
          if (targetMember) targetMember.voice.disconnect().catch(()=>{});
        }
        return interaction.reply({ content: `🚫 บล็อกสมาชิก (${targetIds.length} คน) เรียบร้อย (ยังมองเห็นห้องอยู่)`, ephemeral: true });
      }

      if (interaction.customId === "select_transfer") {
        const targetId = targetIds[0];
        const data = tempChannels.get(channel.id);
        data.owner = targetId;
        const user = await client.users.fetch(targetId);
        await channel.setName(`📍・ห้องส่วนตัวของ ${user.username}`);
        return interaction.reply({ content: `🔁 โอนเจ้าของห้องให้ <@${targetId}> แล้ว`, ephemeral: true });
      }
    }

    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      if (interaction.customId === "rename_room") {
        const name = interaction.fields.getTextInputValue("room_name");
        await channel.setName(`📍・${name}`);
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อเป็น **${name}** แล้ว`, ephemeral: true });
      }
      if (interaction.customId === "limit_room") {
        const limit = parseInt(interaction.fields.getTextInputValue("limit_input"));
        await channel.setUserLimit(isNaN(limit) ? 0 : limit);
        return interaction.reply({ content: `🎯 จำกัดคนเป็น **${limit || 'ไม่จำกัด'}** คน`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) interaction.reply({ content: "❌ เกิดข้อผิดพลาด", ephemeral: true }).catch(()=>{});
  }
});

client.login(token);
