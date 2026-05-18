// ===== ส่วนที่ปรับปรุง: วางทับ interactionCreate เดิมได้เลย (โครงสร้างเดิมแต่ตอบไวขึ้น) =====
client.on("interactionCreate", async (interaction) => {
  try {
    // 1. /room สำหรับแอดมิน - ตอบรับทันที
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

      // แก้ไข: ใช้ reply ทันที แทนการ defer แล้ว delete (ทำให้บอทดูตอบสนองไวขึ้น 100%)
      await interaction.reply({ content: "✅ ติดตั้งระบบเรียบร้อย", ephemeral: true });
      return interaction.channel.send({ embeds: [embed], components: [row1, row2] });
    }

    // 2. จัดการปุ่มกด (Buttons)
    if (interaction.isButton()) {
      const member = interaction.member;
      const channel = member.voice.channel;
      if (!channel) return interaction.reply({ content: "❌ ต้องอยู่ในห้อง", ephemeral: true });

      const data = tempChannels.get(channel.id);

      if (interaction.customId === "owner") {
        if (!data) return interaction.reply({ content: "❌ ห้องนี้ไม่ได้อยู่ในระบบ", ephemeral: true });
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle("👑 เจ้าของห้อง")
            .setDescription(`เจ้าของห้องคือ: <@${data.owner}>`)
            .setColor(0xFFD700)],
          ephemeral: true
        });
      }

      if (!data || data.owner !== member.id) return interaction.reply({ content: "❌ ไม่ใช่เจ้าของ", ephemeral: true });

      // Action ที่แสดง Modal (ไม่ต้อง Defer)
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

      if (["allow", "deny", "transfer"].includes(interaction.customId)) {
        const menu = new UserSelectMenuBuilder().setCustomId(`select_${interaction.customId}`);
        return interaction.reply({ content: "โปรดเลือกสมาชิก", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      // สำหรับ Action จัดการสิทธิ์ - ใช้ reply ทันทีเพื่อความเร็ว
      if (interaction.customId === "lock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        return interaction.reply({ content: "🔒 ล็อกห้องแล้ว", ephemeral: true });
      }

      if (interaction.customId === "unlock") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        return interaction.reply({ content: "🔓 ปลดล็อกห้องแล้ว", ephemeral: true });
      }

      if (interaction.customId === "hide") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
        return interaction.reply({ content: "🙈 ซ่อนห้องแล้ว", ephemeral: true });
      }

      if (interaction.customId === "show") {
        await channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true });
        return interaction.reply({ content: "👁 แสดงห้องแล้ว", ephemeral: true });
      }
    }

    // 3. จัดการเมนูเลือกสมาชิก
    if (interaction.isUserSelectMenu()) {
      const channel = interaction.member.voice.channel;
      const targetId = interaction.values[0];

      if (interaction.customId === "select_allow") {
        await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
        return interaction.reply({ content: `✅ อนุญาต <@${targetId}>`, ephemeral: true });
      }
      if (interaction.customId === "select_deny") {
        await channel.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false });
        return interaction.reply({ content: `🚫 ห้าม <@${targetId}>`, ephemeral: true });
      }
      if (interaction.customId === "select_transfer") {
        const data = tempChannels.get(channel.id);
        data.owner = targetId;
        await channel.setName(`📍・ห้องส่วนตัวของ ${interaction.guild.members.cache.get(targetId).user.username}`);
        return interaction.reply({ content: `🔁 โอนห้องแล้ว`, ephemeral: true });
      }
    }

    // 4. จัดการ Modal Submit
    if (interaction.isModalSubmit()) {
      const channel = interaction.member.voice.channel;
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
    console.error(err);
  }
});
