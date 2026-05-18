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
app.listen(process.env.PORT || 3000);

// ===== Configuration =====
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
  new SlashCommandBuilder().setName("room").setDescription("เปิดแผงควบคุมห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

client.once("ready", async () => {
  console.log(`✅ บอทออนไลน์แล้ว: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (err) {
    console.error(err);
  }
});

// ===== ระบบสร้าง/ลบห้อง =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (newState.channelId === createChannelId) {
    const channel = await newState.guild.channels.create({
      name: `📍・${newState.member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: categoryId
    });
    await newState.setChannel(channel);
    tempChannels.set(channel.id, { owner: newState.member.id });
  }

  if (oldState.channelId && tempChannels.has(oldState.channelId)) {
    const channel = oldState.guild.channels.cache.get(oldState.channelId);
    if (channel && channel.members.size === 0) {
      await channel.delete().catch(() => {});
      tempChannels.delete(oldState.channelId);
    }
  }
});

// ===== ระบบจัดการปุ่มและคำสั่ง =====
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบจัดการห้องส่วนตัว")
        .setDescription("กดปุ่มด้านล่างเพื่อตั้งค่าห้องของคุณ")
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
        new ButtonBuilder().setCustomId("show").setEmoji("👁️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("transfer").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("allow").setEmoji("🧑‍🤝‍🧑").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("deny").setEmoji("🚫").setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row1, row2] });
    }

    if (interaction.isButton()) {
      const member = interaction.member;
      const channel = member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องเสียง", ephemeral: true });

      const data = tempChannels.get(channel.id);
      if (interaction.customId === "owner") {
        return interaction.reply({ content: `👑 เจ้าของห้อง: <@${data?.owner}>`, ephemeral: true });
      }

      if (!data || data.owner !== member.id) return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของห้อง", ephemeral: true });

      // Modal Buttons
      if (interaction.customId === "name") {
        const modal = new ModalBuilder().setCustomId("rename_room").setTitle("เปลี่ยนชื่อห้อง");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("room_name").setLabel("ชื่อใหม่").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }
      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("limit_room").setTitle("ตั้งจำนวนคน");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("limit_input").setLabel("ใส่จำนวน (0=ไม่จำกัด)").setStyle(TextInputStyle.Short)));
        return interaction.showModal(modal);
      }
      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`select_${interaction.customId}`);
        return interaction.reply({ content: "เลือกสมาชิก:", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      // Action Buttons
      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === "hide") {
        await channel.permissionOverwrites.set([
          { id: interaction.guild.id, deny: ["ViewChannel"] },
          { id: member.id, allow: ["ViewChannel", "Connect"] }
        ]);
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { ViewChannel: false }).catch(()=>{});
        return interaction.editReply("🙈 ซ่อนห้องแล้ว");
      }

      if (interaction.customId === "show") {
        // แก้ไข: บังคับให้ทุกคนกลับมาเห็นห้อง
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { ViewChannel: true }).catch(()=>{});
        return interaction.editReply("👁️ แสดงห้องแล้ว");
      }

      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        return interaction.editReply("🔒 ล็อกห้องแล้ว");
      }

      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        return interaction.editReply("🔓 ปลดล็อกห้องแล้ว");
      }
    }

    // Select Menus
    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);
      if (!channel || data?.owner !== interaction.member.id) return;

      const targetId = interaction.values[0];
      await interaction.deferUpdate();

      if (interaction.customId === "select_allow") {
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
      } else if (interaction.customId === "select_deny") {
        await channel.permissionOverwrites.edit(targetId, { Connect: false });
      } else if (interaction.customId === "select_transfer") {
        data.owner = targetId;
        const targetMember = await interaction.guild.members.fetch(targetId);
        await channel.setName(`📍・${targetMember.user.username}`);
      }
      return interaction.followUp({ content: "✅ ดำเนินการสำเร็จ", ephemeral: true });
    }

    // Modal Submit
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      if (!channel) return;
      if (interaction.customId === "rename_room") {
        await channel.setName(`📍・${interaction.fields.getTextInputValue("room_name")}`);
      } else if (interaction.customId === "limit_room") {
        const val = parseInt(interaction.fields.getTextInputValue("limit_input"));
        await channel.setUserLimit(isNaN(val) ? 0 : val);
      }
      return interaction.reply({ content: "✅ อัปเดตสำเร็จ", ephemeral: true });
    }

  } catch (err) {
    console.error(err);
  }
});

client.login(token);
