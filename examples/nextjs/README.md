const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth()
});

const userLinkCount = {}; // Kuhifadhi idadi ya link zilizotumwa na kila mtumiaji

client.on('ready', () => {
    console.log('Bot is ready!');
});

client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();

        // Angalia kama ujumbe umetumwa kwenye group
        if (chat.isGroup) {
            const admins = await chat.getAdmins();
            const me = await client.info.wid;

            // Angalia kama wewe ni admin wa group
            const isAdmin = admins.some(admin => admin.id._serialized === me._serialized);

            if (isAdmin) {
                // Regex ya kutambua link
                const linkRegex = /(https?:\/\/[^\s]+)/g;

                if (linkRegex.test(msg.body)) {
                    const userId = msg.author;

                    // Ongeza idadi ya link zilizotumwa na mtumiaji huyu
                    userLinkCount[userId] = (userLinkCount[userId] || 0) + 1;

                    // Fuatilia link moja kwa moja
                    console.log(`Link iliyotumwa: ${msg.body.match(linkRegex)[0]}`);

                    if (userLinkCount[userId] >= 3) {
                        // Mtoa mtumiaji kwenye group
                        await chat.removeParticipants([userId]);
                        await chat.sendMessage(`🚫 ${userId} ametolewa kwenye group kwa kutuma link mara 3.`);
                        delete userLinkCount[userId]; // Ondoa rekodi ya mtumiaji baada ya kumtoa
                    } else {
                        // Toa onyo
                        await chat.sendMessage(`⚠️ LINK HAZIRUHUSIWI HAPA! ${userId}, kama utatuma link mara 3, utatolewa.`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

client.initialize();
