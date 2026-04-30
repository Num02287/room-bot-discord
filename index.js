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
  PermissionsBitField
} = require("discord.js");

const {
  createChannelId,
  categoryId,
  allowRoleId
} = require("./config.json");

// ✅ ใช้ env แทน config
const token = process.env.TOKEN;

console.log("TOKEN:", token);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

const tempChannels = new Map();

// ===== Slash =====
const commands = [
  new SlashCommandBuilder().setName("room").setDescription("ระบบห้องส่วนตัว")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag}`);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

// ===== Voice System =====
client.on("voiceStateUpdate", async (oldState, newState) => {

  if (newState.channelId === createChannelId) {
    const channel = await newState.guild.channels.create({
      name: `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,
      type: ChannelType.GuildVoice,
      parent: categoryId
    });

    await newState.setChannel(channel);

    tempChannels.set(channel.id, {
      owner: newState.member.id
    });
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

// ===== Interaction =====
client.on("interactionCreate", async (interaction) => {

  try {

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "room") {

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return interaction.reply({ content: "❌ แอดมินเท่านั้น", ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle("🏠 ระบบห้องส่วนตัว")
          .setDescription("กดปุ่มเพื่อจัดการห้อง")
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

    if (interaction.isButton()) {

      const member = interaction.member;
      const channel = member.voice.channel;

      if (!channel) return interaction.reply({ content: "❌ ต้องอยู่ในห้อง", ephemeral: true });

      const data = tempChannels.get(channel.id);

      if (interaction.customId === "owner") {
        return interaction.reply({
          content: `👑 เจ้าของ: <@${data?.owner}>`,
          ephemeral: true
        });
      }

      if (!data || data.owner !== member.id) {
        return interaction.reply({ content: "❌ ไม่ใช่เจ้าของ", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        return interaction.editReply({ content: "🔒 ล็อกแล้ว" });
      }

      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        return interaction.editReply({ content: "🔓 ปลดล็อกแล้ว" });
      }

if (interaction.customId === "lock") {
  await channel.permissionOverwrites.edit(interaction.guild.id, {
    Connect: false
  });

  if (allowRoleId) {
    await channel.permissionOverwrites.edit(allowRoleId, {
      Connect: false
    });
  }

  // 🔥 เจ้าของ "ปัจจุบัน" เข้าได้เสมอ
  await channel.permissionOverwrites.edit(data.owner, {
    Connect: true,
    ViewChannel: true
  });

  return interaction.editReply({ content: "🔒 ล็อกห้องแล้ว" });
}

      if (interaction.customId === "hide") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });

        if (allowRoleId) {
          await channel.permissionOverwrites.edit(allowRoleId, { ViewChannel: false }).catch(()=>{});
        }

        await channel.permissionOverwrites.edit(member.id, {
          ViewChannel: true,
          Connect: true
        });

        return interaction.editReply({ content: "🙈 ซ่อนห้องแล้ว" });
      }

if (interaction.customId === "show") {

  // 👁 ให้เห็นห้อง
  await channel.permissionOverwrites.edit(interaction.guild.id, {
    ViewChannel: true,
    Connect: false // 🔒 บังคับล็อกไว้
  });

  if (allowRoleId) {
    await channel.permissionOverwrites.edit(allowRoleId, {
      ViewChannel: true,
      Connect: false // 🔒 เหมือนกัน
    }).catch(()=>{});
  }

  return interaction.editReply({
    content: "👁 แสดงห้องแล้ว "
  });
}
    }

    // ===== SELECT =====
    if (interaction.isUserSelectMenu()) {

      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel.id);

      if (!channel || !data || data.owner !== interaction.member.id) {
        return interaction.reply({ content: "❌ ไม่ใช่เจ้าของ", ephemeral: true });
      }

      const targetId = interaction.values[0];

      if (interaction.customId === "select_allow") {
        await channel.permissionOverwrites.edit(targetId, {
          Connect: true,
          ViewChannel: true
        });

        return interaction.reply({
          content: `✅ อนุญาต <@${targetId}>`,
          ephemeral: true
        });
      }

      if (interaction.customId === "select_deny") {
        await channel.permissionOverwrites.edit(targetId, {
          Connect: false,
          ViewChannel: false
        });

        return interaction.reply({
          content: `🚫 ห้าม <@${targetId}>`,
          ephemeral: true
        });
      }

      if (interaction.customId === "select_transfer") {
        data.owner = targetId;
        const user = channel.members.get(targetId);

        await channel.setName(`📍・ห้องส่วนตัวของ ${user.user.username}`);

        return interaction.reply({
          content: `🔁 โอนห้องแล้ว`,
          ephemeral: true
        });
      }
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit()) {

      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel.id);

      if (!channel || !data || data.owner !== interaction.member.id) {
        return interaction.reply({ content: "❌ ไม่ใช่เจ้าของ", ephemeral: true });
      }

      if (interaction.customId === "rename_room") {
        const name = interaction.fields.getTextInputValue("room_name");
        await channel.setName(`📍・${name}`);
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อแล้ว`, ephemeral: true });
      }

      if (interaction.customId === "limit_room") {
        const limit = parseInt(interaction.fields.getTextInputValue("limit_input"));
        await channel.setUserLimit(limit || 0);
        return interaction.reply({ content: `🎯 ตั้งจำนวนแล้ว`, ephemeral: true });
      }
    }

  } catch (err) {
    console.log(err);
    if (!interaction.replied) {
      return interaction.reply({ content: "❌ error", ephemeral: true });
    }
  }

});

client.login(token);
