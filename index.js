const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const express = require('express');

// --- 1. خادم وهمي لإبقاء البوت مستيقظاً على Render ---
const app = express();
app.get('/', (req, res) => res.send('Pro-Bot is Running 24/7! ✅'));
app.listen(process.env.PORT || 3000, () => console.log('Web Server Ready!'));

// --- 2. إعدادات البوت وقاعدة البيانات ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const DB_FILE = './database.json';
let db = { users: {} };

// تحميل البيانات
if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4));
}

// --- 3. تشغيل البوت ---
client.once('ready', () => {
    console.log(`✅ ${client.user.tag} is Online & Global Commands Registered!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    const userId = message.author.id;

    // التأكد من وجود المستخدم في القاعدة
    if (!db.users[userId]) {
        db.users[userId] = { coins: 1000, title: 'لا يوجد' };
        saveDB();
    }

    // --- أمر الملف الشخصي (/profile) ---
    if (command === '/profile') {
        const user = db.users[userId];
        const embed = new EmbedBuilder()
            .setTitle(`👤 ملف: ${message.author.username}`)
            .addFields(
                { name: '💰 العملات:', value: `${user.coins}`, inline: true },
                { name: '🎖️ اللقب:', value: `[${user.title}]`, inline: true }
            )
            .setColor('Blue');
        message.reply({ embeds: [embed] });
    }

    // --- أمر المتجر لشراء الألقاب ---
    if (command === '/shop') {
        const shopEmbed = new EmbedBuilder()
            .setTitle('🛒 متجر الألقاب (Titles)')
            .setDescription('اشترِ لقبك المفضل الآن:\n\n1️⃣ **[محارب]** - 5000 عملة\n2️⃣ **[أسطورة]** - 10000 عملة')
            .setFooter({ text: 'استخدم /buy [الرقم] للشراء' })
            .setColor('Gold');
        message.reply({ embeds: [shopEmbed] });
    }

    // --- أمر الشراء (/buy) ---
    if (command === '/buy') {
        const item = args[1];
        let price = 0;
        let newTitle = '';

        if (item === '1') { price = 5000; newTitle = 'محارب'; }
        else if (item === '2') { price = 10000; newTitle = 'أسطورة'; }
        else return message.reply('❌ يرجى اختيار رقم صالح من المتجر!');

        if (db.users[userId].coins < price) return message.reply('❌ ليس لديك عملات كافية!');

        db.users[userId].coins -= price;
        db.users[userId].title = newTitle;
        saveDB();
        message.reply(`✅ مبروك! حصلت على لقب **[${newTitle}]**`);
    }
});

// تسجيل الدخول باستخدام التوكن من المتغيرات البيئية
client.login(process.env.DISCORD_TOKEN);