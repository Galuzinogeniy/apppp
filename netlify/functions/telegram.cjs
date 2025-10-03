const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const WEBAPP_URL = process.env.WEBAPP_URL; // адрес твоего сайта на Netlify

function escapeHtml(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function tg(method, payload) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'OK' };
  }

  if (!BOT_TOKEN || !ADMIN_CHAT_ID || !WEBAPP_URL) {
    console.error('Missing env vars');
    return { statusCode: 500, body: 'Missing env' };
  }

  let update;
  try { update = JSON.parse(event.body); } catch (e) {
    console.error('Bad JSON', e);
    return { statusCode: 200, body: 'no json' };
  }

  const msg = update.message;
  const chatId = msg?.chat?.id;

  try {
    // 1) /start -> присылаем кнопку «Открыть кружки»
    if (msg?.text === '/start') {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Открой приложение кружков:',
        reply_markup: {
          keyboard: [[{ text: 'Открыть кружки', web_app: { url: WEBAPP_URL } }]],
          resize_keyboard: true,
          is_persistent: true
        }
      });
    }

    // 2) Пришли данные из WebApp (sendData)
    const wad = msg?.web_app_data;
    if (wad?.data) {
      let payload;
      try { payload = JSON.parse(wad.data); } catch { payload = { raw: wad.data }; }

      // Шлём админу
      await tg('sendMessage', {
        chat_id: ADMIN_CHAT_ID,
        parse_mode: 'HTML',
        text:
          `<b>WebApp данные</b>\n` +
          `От: @${msg.from?.username || '—'} (id ${msg.from?.id})\n\n` +
          `<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`
      });

      // Отвечаем отправителю
      await tg('sendMessage', { chat_id: chatId, text: 'Данные получены ✅ Спасибо!' });
    }
  } catch (e) {
    console.error('Handler error', e);
  }

  // Всегда быстро возвращаем 200, чтобы Telegram был доволен
  return { statusCode: 200, body: 'OK' };
};

