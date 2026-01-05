/**
 * Set Telegram Webhook
 *
 * Run after deploying:
 * TELEGRAM_BOT_TOKEN=xxx WEBAPP_URL=https://your-app.onrender.com node scripts/set-webhook.js
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;

async function setWebhook() {
  if (!BOT_TOKEN || !WEBAPP_URL) {
    console.error('Error: Set TELEGRAM_BOT_TOKEN and WEBAPP_URL');
    process.exit(1);
  }

  const webhookUrl = `${WEBAPP_URL}/api/telegram`;

  try {
    // Set webhook
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message'],
        }),
      }
    );

    const result = await res.json();
    console.log('Webhook result:', result);

    // Get webhook info
    const infoRes = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
    );
    const info = await infoRes.json();
    console.log('Webhook info:', info);

    if (result.ok) {
      console.log('\n=================================');
      console.log('Webhook set successfully!');
      console.log(`URL: ${webhookUrl}`);
      console.log('=================================\n');
    }

  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
}

setWebhook();
