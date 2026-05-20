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

// ===== ระบบสร้างห้อง (บล็อกคนไม่มียศ แต่เปิดให้คนมียศอื่นเข้าได้) และโอนเจ้าของ =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    // 1. ตอนสร้างห้องใหม่
    if (newState.channelId === createChannelId) {
      const guildId = newState.guild.id;
      const ownerId = newState.member.id;

      const channel = await newState.guild.channels.create({
        name: `📍・ห้องส่วนตัวของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: [
          {
            id: guildId, // ยศ @everyone (คนทั่วไป / คนไม่มียศ)
            deny: ["Connect"], // 🚫 บล็อกไม่ให้กดเข้าห้องตั้งแต่แรกสร้าง
            allow: ["ViewChannel"] // แต่ยังคงให้มองเห็นห้องปกติ
          },
          {
            id: ownerId, // ตัวเจ้าของห้อง
            allow: ["ViewChannel", "Connect"] // เข้าห้องได้ปกติแน่นอน
          },
          {
            id: client.user.id, // ตัวบอทเอง
            allow: ["ViewChannel", "Connect", "ManageChannels", "MoveMembers"]
          }
        ]
      });

      // 🛠 ดึงทุกยศในเซิร์ฟเวอร์มาเปิดสิทธิ์เข้าห้องให้ (ยกเว้นยศบอท และ ยศ @everyone)
      const roles = await newState.guild.roles.fetch().catch(() => []);
      for (const [roleId, role] of roles) {
        if (!role.managed && roleId !== guildId) {
          await channel.permissionOverwrites.edit(roleId, { Connect: true, ViewChannel: true }).catch(() => {});
        }
      }

      // ย้ายคนสร้างเข้าห้องใหม่
      await newState.setChannel(channel);

      // บันทึกเจ้าของห้อง
      tempChannels.set(channel.id, { owner: ownerId });
    }

    // 2. จัดการเมื่อคนออกจากห้อง
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
      const channel = oldState.guild.channels.cache.get(oldState.channelId);
      const data = tempChannels.get(oldState.channelId);

      if (!channel) return;

      // ถ้าไม่มีคนเหลือในห้องเลย -> ลบห้องทิ้ง
      if (channel.members.size === 0) {
        await channel.delete().catch(() => {});
        tempChannels.delete(oldState.channelId);
        return;
      }

      // ระบบโอนเจ้าของอัตโนมัติ
      if (oldState.member.id === data.owner) {
        const newOwner = channel.members.first();
        if (newOwner) {
          data.owner = newOwner.id;
          
          // ตรวจสอบให้แน่ใจว่าเจ้าของใหม่มีสิทธิ์ควบคุมห้องแน่นอน
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
    // 1. แผงควบคุมระบบด้วยคำสั่ง Slash Command (/room)
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "room") {
        const embed = new EmbedBuilder()
          .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
          .setDescription("🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n🔹 **หมายเหตุ:** ห้องสร้างใหม่ทุกคนจะเห็นปกติ กดปุ่ม 🙈 เพื่อซ่อนห้อง")
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

      // ต้องเป็นเจ้าของห้องเท่านั้นถึงจะใช้ปุ่มอื่นได้
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
        const roles = await interaction.guild.roles.fetch().catch(() => []);
        for (const [roleId, role] of roles) {
          if (!role.managed && roleId !== interaction.guild.id) {
            await channel.permissionOverwrites.edit(roleId, { Connect: true }).catch(() => {});
          }
        }
        return interaction.editReply({ content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว คนมียศทุกคนสามารถจอยเข้าห้องได้ปกติ" });
      }
      
      // ปุ่มซ่อนห้อง: กวาดล้างและปิดการมองเห็นทุกยศรวมถึงคนไม่มียศ
      if (interaction.customId === "hide") {
        const roles = await interaction.guild.roles.fetch().catch(() => []);
        for (const [roleId, role] of roles) {
          if (!role.managed && !role.permissions.has("Administrator") && roleId !== interaction.guild.id) {
            await channel.permissionOverwrites.edit(roleId, { ViewChannel: false }).catch(() => {});
          }
        }

        // บังคับปิดตา @everyone (คนทั่วไปรวมถึงคนไม่มีบทบาท)
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false }).catch(() => {});
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { ViewChannel: false }).catch(() => {});
        
        // ล็อกให้เจ้าของห้องและคนที่อยู่เดิมยังมองเห็น
        await channel.permissionOverwrites.edit(data.owner, { ViewChannel: true, Connect: true }).catch(() => {});
        channel.members.forEach(async (roomMember) => {
          await channel.permissionOverwrites.edit(roomMember.id, { ViewChannel: true, Connect: true }).catch(() => {});
        });

        return interaction.editReply({ content: "🙈 ซ่อนห้องเรียบร้อยแล้ว สมาชิกธรรมดาทั้งหมดข้างนอกจะไม่เห็นห้องนี้แล้วครับ" });
      }

      // ปุ่มแสดงห้อง: ล้างค่าซ่อนเพื่อให้ทุกคนกลับมาเห็นตามปกติ
      if (interaction.customId === "show") {
        const currentOverwrites = channel.permissionOverwrites.cache;
        for (const [id, overwrite] of currentOverwrites) {
          if (id !== data.owner && id !== client.user.id && !channel.members.has(id)) {
            await channel.permissionOverwrites.delete(id).catch(() => {});
          }
        }
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true }).catch(() => {});
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { ViewChannel: true }).catch(() => {});
        
        return interaction.editReply({ content: "👁 แสดงห้องเรียบร้อยแล้ว ตอนนี้สมาชิกทุกคนสามารถมองเห็นห้องนี้ได้ตามปกติ" });
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
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true }).catch(() => {});
        return interaction.reply({ content: `✅ อนุญาตให้ <@${targetId}> มองเห็นและเข้าห้องได้แล้วครับ`, ephemeral: true });
      }
      if (interaction.customId === "select_deny") {
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
