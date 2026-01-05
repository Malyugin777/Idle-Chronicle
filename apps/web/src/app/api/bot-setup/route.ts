import { NextRequest, NextResponse } from 'next/server';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || '';

export async function GET(req: NextRequest) {
  // Security: check for secret key in query
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');

  // Simple protection - change this secret!
  if (secret !== 'setup2024') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 });
  }

  const baseUrl = `https://api.telegram.org/bot${BOT_TOKEN}`;
  const results: Record<string, unknown> = {};

  try {
    // 1. Set bot commands
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
    results.commands = await commandsRes.json();

    // 2. Set Menu Button (WebApp)
    const webappUrl = WEBAPP_URL || `https://${req.headers.get('host')}`;
    const menuRes = await fetch(`${baseUrl}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: 'web_app',
          text: '⚔️ Play',
          web_app: { url: webappUrl },
        },
      }),
    });
    results.menuButton = await menuRes.json();

    // 3. Set Webhook
    const webhookUrl = `${webappUrl}/api/telegram`;
    const webhookRes = await fetch(`${baseUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message'],
      }),
    });
    results.webhook = await webhookRes.json();

    // 4. Get bot info
    const infoRes = await fetch(`${baseUrl}/getMe`);
    results.botInfo = await infoRes.json();

    // 5. Get webhook info
    const whInfoRes = await fetch(`${baseUrl}/getWebhookInfo`);
    results.webhookInfo = await whInfoRes.json();

    return NextResponse.json({
      success: true,
      webappUrl,
      webhookUrl,
      results,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Setup failed',
      details: String(error)
    }, { status: 500 });
  }
}
