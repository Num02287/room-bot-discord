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

// ===== Web Server สำหรับรันบน Cloud (เช่น Render) =====
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

// ===== Slash Commands (ระบบสร้างห้อง) =====
const commands = [
  new SlashCommandBuilder()
    .setName("room")
    .setDescription("ระบบสร้างห้อง")
    .setDMPermission(false) 
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

client.once("ready", async () => {
  console.log(`✅ Login as: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("🚀 รีเฟรชและติดตั้ง Slash Commands เรียบร้อยแล้ว!");
  } catch (err) {
    console.error(err);
  }
});

// ===== ระบบสร้างห้องและลบห้องอัตโนมัติ =====
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    // --- 1. ขาเข้า: สมาชิกกดเข้าช่องสร้างห้องค้างไว้ ---
    if (newState.channelId === createChannelId) {
      const guildId = newState.guild.id;
      const ownerId = newState.member.id;

      const permissionOverwrites = [
        {
          id: guildId, 
          allow: ["ViewChannel"], 
          deny: ["Connect"],     
        },
        {
          id: ownerId, 
          allow: ["ViewChannel", "Connect"], 
        },
        {
          id: client.user.id, 
          allow: ["ViewChannel", "Connect", "ManageChannels", "MoveMembers"], 
        }
      ];

      if (allowRoleId) {
        permissionOverwrites.push({
          id: allowRoleId,
          allow: ["ViewChannel", "Connect"] 
        });
      }

      const channel = await newState.guild.channels.create({
        name: `ห้องส่วนตัวของ ${newState.member.user.username}`,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        permissionOverwrites: permissionOverwrites 
      });

      await newState.setChannel(channel).catch(() => {});
      tempChannels.set(channel.id, { owner: ownerId });
      return;
    }

    // --- 2. ขาออก: สมาชิกย้ายออกหรือกดตัดสายออกจากห้องชั่วคราว ---
    if (oldState.channelId && tempChannels.has(oldState.channelId)) {
      const channel = await oldState.guild.channels.fetch(oldState.channelId).catch(() => null);

      // ถ้าไม่มีคนอยู่ในห้องแล้ว ให้ลบห้องทิ้ง (เจ้าของเดิมยังถือสิทธิ์คุมห้องอยู่จนกว่าห้องจะลบ)
      if (!channel || channel.members.size === 0) {
        if (channel) await channel.delete().catch(() => {});
        tempChannels.delete(oldState.channelId);
        return;
      }
    }
  } catch (error) {
    console.error("Error in voiceStateUpdate:", error);
  }
});

// ===== ระบบจัดการปุ่มกด, เมนูเลือกสมาชิก และ โมดอล =====
client.on("interactionCreate", async (interaction) => {
  try {
    // 1. เรียกแผงควบคุมด้วยคำสั่ง (/room)
    if (interaction.isChatInputCommand() && interaction.commandName === "room") {
      const embed = new EmbedBuilder()
        .setTitle("🏠 ระบบสร้างห้องส่วนตัวประจำโซน")
        .setDescription("🔹 ระบบนี้ใช้สำหรับจัดการช่องเสียงส่วนตัว\n🔹 สามารถสร้างและปรับแต่งห้องได้ตามต้องการ\n🔹 **หมายเหตุ :** สมาชิกที่มียศพิเศษจะสามารถเข้าห้องนี้ได้ทันที")
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

   // 1. เรียกแผงควบคุมด้วยคำสั่ง (/room)
if (interaction.isChatInputCommand() && interaction.commandName === "room") {
    
    // 1. ส่ง Embed และปุ่มเข้าไปในแชทโดยตรง (ใช้ channel.send)
    await interaction.channel.send({ 
        embeds: [embed], 
        components: [row1, row2] 
    });

    // 2. ตอบรับคำสั่งแบบเงียบๆ เพื่อไม่ให้บอทขึ้นว่า "Interaction Failed"
    // แล้วลบคำสั่งที่ผู้ใช้พิมพ์ทิ้งทันที
    await interaction.reply({ content: "กำลังสร้างแผงควบคุม...", ephemeral: true });
    return interaction.deleteReply(); 
}
    }

    // 2. จัดการปุ่มกดต่าง ๆ (Buttons)
    if (interaction.isButton()) {
      const member = interaction.member;
      const channel = member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ คุณต้องอยู่ในห้องเสียงก่อนครับ", ephemeral: true });

      const data = tempChannels.get(channel.id);

      // ปุ่มตรวจสอบเจ้าของห้อง
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

      // 🛡️ ตรวจสอบสิทธิ์ความเป็นเจ้าของห้องสำหรับปุ่มควบคุมอื่น ๆ
      if (!data || data.owner !== member.id) {
        return interaction.reply({ content: "❌ คุณไม่ใช่เจ้าของห้องนี้ครับ ไม่สามารถสั่งการได้", ephemeral: true });
      }

      // เปิดหน้าต่างคีย์ข้อมูล (Modals)
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

      // เปิดเมนูรายชื่อสมาชิก (Select Menus)
      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`select_${interaction.customId}`).setPlaceholder("เลือกสมาชิกที่ต้องการ...");
        return interaction.reply({ content: "🎯 โปรดเลือกสมาชิกจากเมนูด้านล่างนี้ครับ", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      // กลุ่มคำสั่งแก้ไข Permissions ของห้อง
      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false }).catch(() => {});
        if (allowRoleId) await channel.permissionOverwrites.edit(allowRoleId, { Connect: false }).catch(() => {});
        return interaction.editReply({ content: "🔒 ล็อกห้องเรียบร้อยแล้ว" });
      }

      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true, Connect: false }).catch(() => {});
        if (allowRoleId) {
          await channel.permissionOverwrites.edit(allowRoleId, { ViewChannel: true, Connect: true }).catch(() => {});
          return interaction.editReply({ content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว" });
        }
        return interaction.editReply({ content: "🔓 ปลดล็อกห้องเรียบร้อยแล้ว" });
      }
      
if (interaction.customId === "hide") {
        // รายชื่อ ID ยศใหญ่ที่ต้องการให้มองเห็นห้อง
        const bigRoleIds = [
          "1500549655107469535", "1502362111345426432", "1492931714887192739", 
          "1492931717437063342", "1492931719832014978", "1493194473994326019", 
          "1497961308530802691", "1494244850919280724", "1492934494616027197", 
          "1493279265582616721", "1492935140400435265", "1492934562211168349", 
          "1493253810993238169", "1492934660605346050", "1492934842483085536", 
          "1493204336874881147", "1492934922896146537", "1492934607534952559", 
          "1500491781983178825", "1500521553446834290", "1492931721384038480", 
          "1501857544400932904", "1493650662624592032", "1492931723330064425", 
          "1492931725129683124"
        ];

        // สร้างรายการสิทธิ์พื้นฐาน
        const permissions = [
          {
            id: interaction.guild.id, // @everyone
            deny: ['ViewChannel'],    // ซ่อนจากทุกคน
          },
          {
            id: client.user.id,       // บอท
            allow: ['ViewChannel', 'Connect', 'ManageChannels', 'MoveMembers'],
          },
          {
            id: data.owner,           // เจ้าของห้อง
            allow: ['ViewChannel', 'Connect'],
          }
        ];

        // เพิ่มสิทธิ์ให้ยศใหญ่ทุกคนในรายการ
        bigRoleIds.forEach(roleId => {
          permissions.push({
            id: roleId,
            allow: ['ViewChannel'], // ยศใหญ่มองเห็น
          });
        });

        // บังคับเขียนทับสิทธิ์ทั้งหมดในห้องนี้
        await channel.permissionOverwrites.set(permissions).catch(console.error);

        return interaction.editReply({ 
          content: "🙈 ซ่อนเรียบร้อยแล้ว" 
        });
      }

if (interaction.customId === "show") {
    // 1. ให้ทุกคนมองเห็นได้
    await channel.permissionOverwrites.edit(interaction.guild.id, { 
        ViewChannel: true,
        Connect: false // ย้ำว่าคนทั่วไปเข้าไม่ได้
    }).catch(console.error);

    // 2. เจ้าของต้องเข้าได้เสมอ
    await channel.permissionOverwrites.edit(data.owner, { 
        Connect: true 
    }).catch(console.error);

    // 3. ยศพิเศษ (ถ้ามี) ให้เข้าได้
    if (allowRoleId) {
        await channel.permissionOverwrites.edit(allowRoleId, { 
            Connect: true 
        }).catch(console.error);
    }

    return interaction.editReply({ 
        content: "👁️ แสดงห้องเรียบร้อยแล้ว" 
    });
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
        await channel.setName(`${name}`).catch(() => {});
        return interaction.reply({ content: `✏️ เปลี่ยนชื่อห้องเป็น **${name}** เรียบร้อยแล้ว`, ephemeral: true });
      }
      
      if (interaction.customId === "limit_room") { 
        const limitInput = interaction.fields.getTextInputValue("limit_input"); 
        const limit = parseInt(limitInput); 
        
        if (isNaN(limit) || limit < 0 || limit > 99) {
          return interaction.reply({ content: "❌ โปรดใส่หมายเลขที่ถูกต้องระหว่าง (0 - 99)", ephemeral: true }); 
        }

        // ถ้าใส่ 0 คือไม่จำกัด (ใช้ค่า 0) ถ้าใส่เลขอื่นให้ใช้เลขนั้นตามตรง
        const finalLimit = limit === 0 ? 0 : limit;
        
        await channel.setUserLimit(finalLimit).catch(() => {}); 
        return interaction.reply({ 
            content: `🎯 ตั้งจำกัดจำนวนคนรวมเจ้าของไว้ที่ **${limit === 0 ? "ไม่จำกัด" : limit + " คน"}** เรียบร้อยแล้ว`, 
            ephemeral: true 
        }); 
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
