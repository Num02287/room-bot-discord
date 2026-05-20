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

const { token, createChannelId, categoryId, allowRoleId } = require("./config.json");

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
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการลงทะเบียนคำสั่ง:", error);
  }
});

// ===== สร้างห้อง =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
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
        channel.delete().catch(() => {});
        tempChannels.delete(oldState.channelId);
        return;
      }

      if (oldState.member.id === data.owner) {
        if (channel.members.size === 1) return;

        const newOwner = channel.members.first();
        data.owner = newOwner.id;
        await channel.setName(`📍・ห้องส่วนตัวของ ${newOwner.user.username}`).catch(() => {});
        
        // อัปเดตสิทธิ์ให้เจ้าของคนใหม่ด้วย เผื่อกรณีห้องล็อกอยู่
        await channel.permissionOverwrites.edit(newOwner.id, {
          Connect: true,
          ViewChannel: true
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error(err);
  }
});

// ===== Interaction =====
client.on("interactionCreate", async (interaction) => {
  try {
    // ===== /room =====
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "room") {
        if (!interaction.member.permissions.has("Administrator")) {
          return interaction.reply({
            content: "❌ คำสั่งนี้สำหรับแอดมินเท่านั้น",
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
          .setDescription(
            "🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n" +
            "🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ"
          )
          .setImage("https://i.ibb.co/Kjbw5BGb/image.png")
          .setFooter({
            text: "📌 กดปุ่มด้านล่างเพื่อจัดการห้องของคุณ"
          })
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
        await interaction.channel.send({
          embeds: [embed],
          components: [row1, row2],
        });
        await interaction.deleteReply();
      }
    }

    // ===== BUTTON =====
    if (interaction.isButton()) {
      const member = interaction.member;
      const channel = member.voice.channel;

      if (!channel) {
        return interaction.reply({ content: "❌ ต้องอยู่ในห้อง", ephemeral: true });
      }

      const data = tempChannels.get(channel.id);

      // 👑 ดูเจ้าของ (ทุกคนกดได้)
      if (interaction.customId === "owner") {
        if (!data) {
          return interaction.reply({ content: "❌ ห้องนี้ไม่ได้อยู่ในระบบ", ephemeral: true });
        }

        const ownerMember = interaction.guild.members.cache.get(data.owner);
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("👑 เจ้าของห้อง")
              .setDescription(`เจ้าของห้องคือ: <@${data.owner}>`)
              .setColor(0xFFD700)
              .setThumbnail(ownerMember ? ownerMember.user.displayAvatarURL() : null)
          ],
          ephemeral: true
        });
      }

      // 🔒 เช็คเจ้าของห้อง
      if (!data || data.owner !== member.id) {
        return interaction.reply({ content: "❌ ไม่ใช่เจ้าของ", ephemeral: true });
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

      if (interaction.customId === "allow") {
        const menu = new UserSelectMenuBuilder().setCustomId("select_allow");
        return interaction.reply({
          content: "เลือกคนที่จะอนุญาต",
          components: [new ActionRowBuilder().addComponents(menu)],
          ephemeral: true
        });
      }

      if (interaction.customId === "deny") {
        const menu = new UserSelectMenuBuilder().setCustomId("select_deny");
        return interaction.reply({
          content: "🚫 เลือกคนที่ห้ามเข้า",
          components: [new ActionRowBuilder().addComponents(menu)],
          ephemeral: true
        });
      }

      if (interaction.customId === "transfer") {
        const menu = new UserSelectMenuBuilder().setCustomId("select_transfer");
        return interaction.reply({
          content: "เลือกคนที่จะโอนห้อง",
          components: [new ActionRowBuilder().addComponents(menu)],
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: true }).catch(() => {});
        return interaction.editReply({ content: "🔓 ปลดล็อกห้องแล้ว" });
      }

      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: false }).catch(() => {});
        await channel.permissionOverwrites.edit(data.owner, { Connect: true, ViewChannel: true });
        return interaction.editReply({ content: "🔒 ล็อกห้องแล้ว" });
      }

// 🙈 ซ่อนห้อง (ให้เห็นแค่เจ้าของห้องคนเดียว 100%)
      if (interaction.customId === "hide") {
        // 1. ปิดการมองเห็นและปิดการเชื่อมต่อของทุกคน (@everyone)
        await channel.permissionOverwrites.edit(interaction.guild.id, { 
          ViewChannel: false,
          Connect: false 
        });

        // 2. ปิดการมองเห็นของยศพิเศษประจำโซน (allowRoleId) เพื่อป้องกันสิทธิ์ทับซ้อน
        if (allowRoleId) {
          await channel.permissionOverwrites.edit(allowRoleId, { 
            ViewChannel: false,
            Connect: false
          }).catch(() => {});
        }

        // 3. เปิดสิทธิ์ให้ "เจ้าของห้อง" คนเดียวที่ยังเห็นและเข้าห้องตัวเองได้ปกติ
        await channel.permissionOverwrites.edit(data.owner, { 
          ViewChannel: true, 
          Connect: true 
        });

        return interaction.editReply({ content: "🙈 ซ่อนห้องเรียบร้อยแล้ว" });
      }

      // 👁 แสดงห้อง (เปิดให้ทุกคนกลับมาเห็น)
      if (interaction.customId === "show") {
        // เปิดให้ @everyone กลับมามองเห็นห้อง แต่บังคับล็อก (Connect: false) เอาไว้ก่อน
        await channel.permissionOverwrites.edit(interaction.guild.id, { 
          ViewChannel: true, 
          Connect: false 
        });

        if (allowRoleId) {
          await channel.permissionOverwrites.edit(allowRoleId, { 
            ViewChannel: true, 
            Connect: false 
          }).catch(() => {});
        }

        return interaction.editReply({ content: "👁 แสดงห้องแล้ว" });
      }

    // ===== SELECT =====
    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณไม่ได้อยู่ในห้องเสียง", ephemeral: true });

      const data = tempChannels.get(channel.id);
      if (!data || data.owner !== interaction.member.id) {
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

        // เตะออกจากห้องทันทีหากคนที่โดนแบนแอบนั่งอยู่ในห้องเสียงขณะนั้น
        const targetMember = channel.members.get(targetId);
        if (targetMember) {
          await targetMember.voice.disconnect().catch(() => {});
        }

        return interaction.reply({
          content: `🚫 ห้าม <@${targetId}> เข้าห้องและเตะออกเรียบร้อย`,
          ephemeral: true
        });
      }

      if (interaction.customId === "select_transfer") {
        // แก้ไขดึงข้อมูลข้ามห้องเสียง ป้องกันปัญหาบอทดับ
        const targetUser = interaction.guild.members.cache.get(targetId)?.user;
        if (!targetUser) {
          return interaction.reply({ content: "❌ ไม่พบผู้ใช้นี้ในเซิร์ฟเวอร์", ephemeral: true });
        }

        data.owner = targetId;
        await channel.setName(`📍・ห้องส่วนตัวของ ${targetUser.username}`).catch(() => {});
        
        // มอบสิทธิ์สูงสุดของห้องให้เจ้าของใหม่ทันที
        await channel.permissionOverwrites.edit(targetId, {
          Connect: true,
          ViewChannel: true
        }).catch(() => {});

        return interaction.reply({
          content: `🔁 โอนห้องให้ <@${targetId}> เรียบร้อยแล้ว`,
          ephemeral: true
        });
      }
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณไม่ได้อยู่ในห้องเสียง", ephemeral: true });

      const data = tempChannels.get(channel.id);
      if (!data || data.owner !== interaction.member.id) {
        return interaction.reply({ content: "❌ ไม่ใช่เจ้าของ", ephemeral: true });
      }

      if (interaction.customId === "rename_room") {
        const name = interaction.fields.getTextInputValue("room_name");
        await channel.setName(`📍・${name}`);
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อแล้ว`, ephemeral: true });
      }

      if (interaction.customId === "limit_room") {
        const rawInput = interaction.fields.getTextInputValue("limit_input");
        const limit = parseInt(rawInput);
        
        if (isNaN(limit) || limit < 0 || limit > 99) {
          return interaction.reply({ content: "❌ กรุณากรอกจำนวนเป็นตัวเลขระหว่าง 0 - 99", ephemeral: true });
        }

        await channel.setUserLimit(limit);
        return interaction.reply({ content: `🎯 ตั้งจำนวนคนเป็น ${limit === 0 ? "ไม่จำกัด" : `${limit} คน`} เรียบร้อยแล้ว`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({ content: "❌ เกิดข้อผิดพลาด", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);
