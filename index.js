require('dotenv').config({ path: './bot.env' });
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

// --- 1. CONFIGURATION ---
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers    
    ]
});

// --- 2. DATABASE PERSISTENCE LOGIC ---
const defaultDB = { users: {}, shop: [] }; // Shop data is loaded from JSON file
let db = defaultDB;

const loadDB = () => {
    if (fs.existsSync('./database.json')) {
        try {
            const data = fs.readFileSync('./database.json', 'utf8');
            if (data.trim().length > 0) {
                db = JSON.parse(data);
            }
        } catch (e) { console.error("Error loading DB, using defaults."); }
    }
};
loadDB();
const saveDB = () => fs.writeFileSync('./database.json', JSON.stringify(db, null, 4));

// --- 3. COMMAND REGISTRATION ---
const commands = [
    new SlashCommandBuilder().setName('profile').setDescription('View your rank and balance card'),
    new SlashCommandBuilder().setName('daily').setDescription('Claim your daily 500 coins reward'),
    new SlashCommandBuilder().setName('shop').setDescription('Browse the permanent title shop'),
    new SlashCommandBuilder().setName('buy').setDescription('Purchase a specific title')
        .addStringOption(o => o.setName('id').setDescription('The ID of the title').setRequired(true)),
    new SlashCommandBuilder().setName('transfer').setDescription('Send coins to another member')
        .addUserOption(o => o.setName('target').setDescription('The recipient').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount to transfer').setRequired(true)),
    new SlashCommandBuilder().setName('clear').setDescription('Admin: Delete messages')
        .addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true)),
].map(c => c.toJSON());

// --- 4. BOT EVENTS ---
client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log(`✅ ${client.user.tag} is Online & Global Commands Registered!`);
    } catch (e) { console.error(e); }
});

// Persistence & XP System
client.on('messageCreate', async m => {
    if (m.author.bot || !m.guild) return;
    
    if (!db.users[m.author.id]) db.users[m.author.id] = { balance: 0, lastDaily: 0, level: 1, xp: 0, currentTitle: '' };
    const u = db.users[m.author.id];
    
    // Persistence Logic: Restore title if user changed their name
    if (u.currentTitle && !m.member.displayName.startsWith(`[${u.currentTitle}]`)) {
        try { await m.member.setNickname(`[${u.currentTitle}] ${m.author.username}`); } catch(e) {}
    }

    u.xp += 10;
    if (u.xp >= u.level * 100) { 
        u.level++; u.xp = 0; 
        m.reply(`🆙 **Level Up!** You reached **Level ${u.level}**!`); 
    }
    saveDB();
});

// --- 5. INTERACTIONS ---
client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return; // Corrected function
    
    const userId = i.user.id;
    if (!db.users[userId]) db.users[userId] = { balance: 0, lastDaily: 0, level: 1, xp: 0, currentTitle: '' };
    const user = db.users[userId];

    // --- Profile Command ---
    if (i.commandName === 'profile') {
        await i.deferReply();
        const canvas = createCanvas(700, 250);
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 700, 0);
        grad.addColorStop(0, '#1a1a2e'); grad.addColorStop(1, '#16213e');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 700, 250);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fillRect(200, 30, 470, 190);

        try {
            const avatar = await loadImage(i.user.displayAvatarURL({ extension: 'jpg' }));
            ctx.save(); ctx.beginPath(); ctx.arc(100, 125, 75, 0, Math.PI * 2, true); ctx.clip();
            ctx.drawImage(avatar, 25, 50, 150, 150); ctx.restore();
        } catch(e){}

        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px sans-serif';
        ctx.fillText(i.user.username, 220, 80);
        ctx.font = '22px sans-serif'; ctx.fillStyle = '#e94560';
        ctx.fillText(user.currentTitle ? `Title: [${user.currentTitle}]` : 'Title: None', 220, 120);
        ctx.fillStyle = '#f1c40f'; ctx.fillText(`Coins: 💰 ${user.balance}`, 220, 160);
        ctx.fillStyle = '#3498db'; ctx.fillText(`Level: ${user.level}`, 220, 200);

        i.editReply({ files: [new AttachmentBuilder(canvas.toBuffer(), { name: 'profile.png' })] });
    }

    // --- Daily Command ---
    if (i.commandName === 'daily') {
        const cooldown = 86400000;
        const timeLeft = cooldown - (Date.now() - user.lastDaily);
        if (timeLeft > 0) {
            const h = Math.floor(timeLeft / 3600000);
            const m = Math.floor((timeLeft % 3600000) / 60000);
            return i.reply(`⏳ Wait **${h}h ${m}m** to claim again.`);
        }
        user.balance += 500; user.lastDaily = Date.now(); saveDB();
        i.reply('💰 **+500 coins** added to your balance!');
    }

    // --- Shop System ---
    if (i.commandName === 'shop') {
        const emb = new EmbedBuilder().setTitle('🛒 Permanent Title Shop').setColor('Blue')
            .setDescription(db.shop.map(s => `ID: \`${s.id}\` | [**${s.title}**] - 💰 ${s.price}`).join('\n'));
        i.reply({ embeds: [emb] });
    }

    if (i.commandName === 'buy') {
        const item = db.shop.find(s => s.id === i.options.getString('id'));
        if (!item || user.balance < item.price) return i.reply('❌ Insufficient balance or invalid ID.');
        user.currentTitle = item.title;
        user.balance -= item.price;
        saveDB();
        try {
            await i.member.setNickname(`[${item.title}] ${i.user.username}`);
            i.reply(`✅ Title updated to **[${item.title}]**!`);
        } catch(e) { i.reply('✅ Title saved, but I lack permissions to change your nickname.'); }
    }

    // --- Transfer & Clear ---
    if (i.commandName === 'transfer') {
        const target = i.options.getUser('target');
        const amount = i.options.getInteger('amount');
        if (target.id === i.user.id || amount <= 0 || user.balance < amount) return i.reply('❌ Invalid Transfer.');
        if (!db.users[target.id]) db.users[target.id] = { balance: 0, lastDaily: 0, level: 1, xp: 0, currentTitle: '' };
        user.balance -= amount; db.users[target.id].balance += amount; saveDB();
        i.reply(`💸 Sent 💰 ${amount} to **${target.username}**.`);
    }

    if (i.commandName === 'clear') {
        if (!i.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return i.reply('❌ No permissions.');
        const amount = i.options.getInteger('amount');
        await i.channel.bulkDelete(Math.min(amount, 100));
        i.reply({ content: `🧹 Deleted ${amount} messages.`, ephemeral: true });
    }
});

client.login(TOKEN);