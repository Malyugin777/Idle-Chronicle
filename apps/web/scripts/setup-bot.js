/**
 * Setup Telegram Bot Menu Button
 *
 * Run this script after deploying to set up the WebApp button:
 * node scripts/setup-bot.js
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://your-app.onrender.com';

async function setupBot() {
  if (!BOT_TOKEN) {
    console.error('Error: TELEGRAM_BOT_TOKEN is not set');
    process.exit(1);
  }

  const baseUrl = `https://api.telegram.org/bot${BOT_TOKEN}`;

  try {
    // 1. Set bot commands
    console.log('Setting bot commands...');
    const commandsRes = await fetch(`${baseUrl}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Start the game' },
          { command: 'play', description: 'Open the game' },
          { command: 'stats', description: 'View your stats' },
          { command: 'top', description: 'View leaderboard' },
        ],
      }),
    });
    console.log('Commands:', await commandsRes.json());

    // 2. Set Menu Button (WebApp)
    console.log('Setting menu button...');
    const menuRes = await fetch(`${baseUrl}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: 'web_app',
          text: 'Play Game',
          web_app: { url: WEBAPP_URL },
        },
      }),
    });
    console.log('Menu Button:', await menuRes.json());

    // 3. Get bot info
    console.log('Getting bot info...');
    const infoRes = await fetch(`${baseUrl}/getMe`);
    const info = await infoRes.json();
    console.log('Bot Info:', info);

    if (info.ok) {
      console.log('\n=================================');
      console.log('Bot setup complete!');
      console.log(`Bot: @${info.result.username}`);
      console.log(`WebApp URL: ${WEBAPP_URL}`);
      console.log('=================================\n');
    }

  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

setupBot();
