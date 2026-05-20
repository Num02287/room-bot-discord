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

// ===== Web Server สำหรับรันบน Render (เพื่อให้บอทไม่หลับ) =====
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

// ===== ระบบสร้างห้อง (ซ่อนอัตโนมัติ) และโอนเจ้าของ =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    // 1. สร้างห้องใหม่แบบล็อกการมองเห็นตั้งแต่เริ่มต้น
    if (newState.channelId === createChannelId) {
      const guildId = newState.guild.id;
      const ownerId = newState.member.id;

      const channel = await newState.guild.channels.create({
        name: `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        // 🛠 ล็อกไม่ให้คนทั่วไปเห็นห้องตั้งแต่กดสร้าง
        permissionOverwrites: [
          {
            id: guildId, // ยศ @everyone (สมาชิกทุกคน)
            deny: ["ViewChannel"], // 🚫 ปิดตา สมาชิกธรรมดาจะมองไม่เห็นห้องนี้
          },
          {
            id: ownerId, // เจ้าของห้อง
            allow: ["ViewChannel", "Connect"], // ✅ เปิดให้เห็นและเข้าใช้งานได้ปกติ
          },
          {
            id: client.user.id, // ตัวบอทเอง
            allow: ["ViewChannel", "Connect", "ManageChannels", "MoveMembers"], // ✅ สิทธิ์ควบคุมห้องของบอท
          }
        ]
      });

      // ดึงตัวคนสร้างห้องเข้ามาในห้องใหม่ทันที
      await newState.setChannel(channel).catch(() => {});

      // บันทึกความสัมพันธ์ลงในระบบความจำชั่วคราว
      tempChannels.set(channel.id, { owner: ownerId });
      return;
    }

    // 2. จัดการเมื่อคนออกจากห้อง
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
      const channel = oldState.channel; // ดึงข้อมูลจากสถานะเก่าโดยตรงเพื่อความแม่นยำ
      if (!channel) return;

      const data = tempChannels.get(oldState.channelId);

      // ถ้าไม่มีคนเหลือในห้องเลย -> ลบห้องทิ้ง
      if (channel.members.size === 0) {
        tempChannels.delete(oldState.channelId);
        await channel.delete().catch(() => {});
        return;
      }

      // ระบบโอนเจ้าของอัตโนมัติเมื่อเจ้าของห้องตัวจริงกดออก
      if (oldState.member.id === data.owner) {
        const newOwner = channel.members.first();
        if (newOwner) {
          data.owner = newOwner.id;
          
          // เปิดสิทธิ์การมองเห็นและสิทธิ์เข้าห้องให้เจ้าของคนใหม่ เพื่อป้องกันอาการตาบอด
          await channel.permissionOverwrites.edit(newOwner.id, { ViewChannel: true, Connect: true }).catch(() => {});
          await channel.setName(`📍・ห้องส่วนตัวของ ${newOwner.user.username}`).catch(() => {});
        }
      }
    }
  } catch (error) {
    console.error("Error in voiceStateUpdate:", error);
  }
});

// ===== ระบบจัดการปุ่มกด, เมนูเลือกสมาชิก และ โมดอล =====
client.on("interactionCreate", async (interaction) => {
  try {
    // 1. เรียกเปิดแผงควบคุมระบบด้วยคำสั่ง Slash Command (/room)
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "room") {
        const embed = new EmbedBuilder()
          .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
          .setDescription("🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n🔹 **หมายเหตุ:** ห้องที่สร้างใหม่จะถูกซ่อนจากบุคคลภายนอกโดยอัตโนมัติ")
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

        return interaction.reply({ embeds: [embed], components: [row1, row2] });
      }
    }

    // 2. จัดการปุ่มกดต่าง ๆ (Buttons)
    if (interaction.isButton()) {
      const member = interaction.member;
      const channel = member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ", ephemeral: true });

      const data = tempChannels.get(channel.id);

      // ปุ่มตรวจสอบเจ้าของห้อง (ใครกดก็ได้)
      if (interaction.customId === "owner") {
        if (!data) return interaction.reply({ content: "❌ ห้องนี้ไม่ได้อยู่ในระบบห้องชั่วคราว", ephemeral: true });
        const ownerMember = interaction.guild.members.cache.get(data.owner);
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("👑 เจ้าของห้อง")
              .setDescription(`เจ้าของห้องปัจจุบันคือ: <@${data.owner}>`)
              .setColor(0xFFD700)
              .setThumbnail(ownerMember ? ownerMember.user.displayAvatarURL() : null)
          ],
          ephemeral: true
        });
      }

      // ตรวจสอบความถูกต้อง (ต้องเป็นเจ้าของห้องเท่านั้นถึงจะใช้ปุ่มอื่นได้)
      if (!data || data.owner !== member.id) return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ", ephemeral: true });

      if (interaction.customId === "name") {
        const modal = new ModalBuilder().setCustomId("rename_room").setTitle("เปลี่ยนชื่อห้อง");
        const input = new TextInputBuilder().setCustomId("room_name").setLabel("ชื่อห้องใหม่").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (interaction.customId === "limit") {
        const modal = new ModalBuilder().setCustomId("limit_room").setTitle("ตั้งจำนวนคน");
        const input = new TextInputBuilder().setCustomId("limit_input").setLabel("ใส่จำนวนคน (0 = ไม่จำกัด)").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`select_${interaction.customId}`).setPlaceholder("เลือกสมาชิกที่ต้องการ...");
        return interaction.reply({ content: "🎯 โปรดเลือกสมาชิกจากเมนูด้านล่างนี้ครับ", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false }).catch(() => {});
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: false }).catch(() => {});
        await channel.permissionOverwrites.edit(data.owner, { Connect: true, ViewChannel: true }).catch(() => {});
        return interaction.editReply({ content: "🔒 ล็อกห้องเรียบร้อยแล้ว คนอื่นจะไม่สามารถกดจอยเข้ามาได้" });
      }

      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true, ViewChannel: true }).catch(() => {});
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: true, ViewChannel: true }).catch(() => {});
        return interaction.editReply({ content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว คนอื่นสามารถมองเห็นและจอยเข้าห้องได้ปกติ" });
      }
      
      if (interaction.customId === "hide") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false }).catch(() => {});
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { ViewChannel: false }).catch(() => {});
        return interaction.editReply({ content: "🙈 ซ่อนห้องเรียบร้อยแล้ว สมาชิกทั่วไปข้างนอกจะไม่เห็นห้องนี้" });
      }

      if (interaction.customId === "show") {
        // 🛠 แก้ไขจุดนี้: สมาชิกทั่วไปมองเห็นห้องได้ แต่กดเข้าไม่ได้ (ขึ้นรูปกุญแจล็อก)
        await channel.permissionOverwrites.edit(interaction.guild.id, { 
          ViewChannel: true,   // ✅ เปิดให้เห็นชื่อห้อง
          Connect: false       // 🚫 บล็อกไม่ให้กดเข้าห้อง
        }).catch(() => {});

        if (allowRoleId) {
          await channel.permissionOverwrites.edit(allowRoleId, { 
            ViewChannel: true, // ✅ เปิดให้เห็นชื่อห้อง
            Connect: false     // 🚫 บล็อกไม่ให้กดเข้าห้อง
          }).catch(() => {});
        }

        // มั่นใจว่าเจ้าของยังคุยและเห็นห้องได้ปกติ
        await channel.permissionOverwrites.edit(data.owner, { ViewChannel: true, Connect: true }).catch(() => {});

        return interaction.editReply({ content: "👁 แสดงห้องเรียบร้อยแล้ว! ตอนนี้ทุกคนจะเห็นห้องของคุณ แต่จะไม่สามารถกดเข้ามาได้ (ต้องให้คุณอนุญาตก่อน)" });
      }
    }

    // 3. จัดการเมนูเลือกสมาชิก (Select Menus)
    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);
      if (!channel || !data || data.owner !== interaction.member.id) {
        return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของเท่านั้น", ephemeral: true });
      }

      const targetId = interaction.values[0];

      if (interaction.customId === "select_allow") {
        // ดึงเพื่อนเข้าห้อง: เปิดตาและเปิดทางให้เพื่อนคนนี้กดจอยเข้ามาได้
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true }).catch(() => {});
        return interaction.reply({ content: `✅ อนุญาตให้ <@${targetId}> มองเห็นและเข้าห้องได้แล้วครับ`, ephemeral: true });
      }
      if (interaction.customId === "select_deny") {
        // บล็อกและเตะออกจากห้อง
        await channel.permissionOverwrites.edit(targetId, { Connect: false }).catch(() => {});
        const targetMember = channel.members.get(targetId);
        if (targetMember) await targetMember.voice.disconnect().catch(() => {});
        return interaction.reply({ content: `🚫 บล็อก <@${targetId}> ไม่ให้เข้าห้องเรียบร้อยแล้ว`, ephemeral: true });
      }
      if (interaction.customId === "select_transfer") {
        data.owner = targetId;
        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (targetUser) {
          await channel.setName(`📍・ห้องส่วนตัวของ ${targetUser.username}`).catch(() => {});
        }
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true }).catch(() => {});
        return interaction.reply({ content: `🔁 โอนความเป็นเจ้าของห้องให้ <@${targetId}> เรียบร้อยแล้วครับ`, ephemeral: true });
      }
    }

    // 4. จัดการป้อนข้อมูลผ่านหน้าต่างโมดอล (Modal Submissions)
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
      const data = tempChannels.get(channel?.id);
      if (!channel || !data || data.owner !== interaction.member.id) {
        return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องที่คุณเป็นเจ้าของเท่านั้น", ephemeral: true });
      }

      if (interaction.customId === "rename_room") {
        const name = interaction.fields.getTextInputValue("room_name");
        await channel.setName(`📍・${name}`).catch(() => {});
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`, ephemeral: true });
      }
      if (interaction.customId === "limit_room") {
        const limitInput = interaction.fields.getTextInputValue("limit_input");
        const limit = parseInt(limitInput);
        if (isNaN(limit) || limit < 0 || limit > 99) {
          return interaction.reply({ content: "❌ โปรดใส่หมายเลขที่ถูกต้องระหว่าง (0 - 99)", ephemeral: true });
        }
        await channel.setUserLimit(limit).catch(() => {});
        return interaction.reply({ content: `🎯 ตั้งจำกัดจำนวนคนไว้ที่ **${limit === 0 ? "ไม่จำกัด" : limit + " คน"}** เรียบร้อยแล้ว`, ephemeral: true });
      }
    }

  } catch (err) {
    console.error("Interaction Error:", err);
    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({ content: "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง", ephemeral: true }).catch(() => {});
    } else if (interaction.deferred) {
      interaction.editReply({ content: "❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง" }).catch(() => {});
    }
  }
});

client.login(token);
