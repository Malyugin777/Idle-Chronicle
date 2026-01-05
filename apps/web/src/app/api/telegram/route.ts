import { NextRequest, NextResponse } from 'next/server';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const WEBAPP_URL = process.env.WEBAPP_URL || '';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
  };
}

async function sendMessage(chatId: number, text: string, replyMarkup?: object) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const update: TelegramUpdate = await req.json();
    const message = update.message;

    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text;
    const firstName = message.from.first_name;

    // Handle commands
    if (text === '/start' || text === '/play') {
      await sendMessage(
        chatId,
        `Hey ${firstName}! Welcome to <b>Tap Raid</b>!\n\n` +
        `Join players worldwide to defeat World Bosses!\n\n` +
        `Tap the button below to start playing:`,
        {
          inline_keyboard: [
            [{ text: '⚔️ Play Now', web_app: { url: WEBAPP_URL } }],
          ],
        }
      );
    } else if (text === '/stats') {
      await sendMessage(
        chatId,
        `📊 <b>Your Stats</b>\n\n` +
        `Open the game to view your full stats!`,
        {
          inline_keyboard: [
            [{ text: '📊 View Stats', web_app: { url: WEBAPP_URL } }],
          ],
        }
      );
    } else if (text === '/top') {
      await sendMessage(
        chatId,
        `🏆 <b>Leaderboard</b>\n\n` +
        `See who's dealing the most damage!`,
        {
          inline_keyboard: [
            [{ text: '🏆 View Leaderboard', web_app: { url: WEBAPP_URL } }],
          ],
        }
      );
    } else if (text === '/help') {
      await sendMessage(
        chatId,
        `<b>Tap Raid - Help</b>\n\n` +
        `<b>How to play:</b>\n` +
        `• Tap the boss to deal damage\n` +
        `• Upgrade STR, DEX, LUCK stats\n` +
        `• Buy soulshots for more damage\n` +
        `• Use buffs for temporary boosts\n` +
        `• Climb the leaderboard!\n\n` +
        `<b>Commands:</b>\n` +
        `/start - Start the game\n` +
        `/play - Open the game\n` +
        `/stats - View your stats\n` +
        `/top - View leaderboard`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// Verify webhook (optional)
export async function GET() {
  return NextResponse.json({ status: 'Telegram webhook endpoint' });
}
