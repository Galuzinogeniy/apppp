// netlify/functions/telegram.mjs
import { getStore } from '@netlify/blobs';

const BOT_TOKEN     = process.env.BOT_TOKEN;
const WEBAPP_URL    = process.env.WEBAPP_URL;
const ADMIN_SECRET  = process.env.ADMIN_SECRET || ""; // может быть пустым
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || ""; // опционально

function escapeHtml(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
async function tg(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('TG API error', method, res.status, t);
  }
}

const store = getStore({ name: 'admins' });
async function addAdmin(id)       { await store.set(String(id), '1'); }
async function removeAdmin(id)    { await store.delete(String(id)); }

export async function handler(event) {
  // Telegram всегда шлёт POST, но если вдруг GET — не ругаемся
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'OK' };

  // Для /start и приёма заявок хватит BOT_TOKEN и WEBAPP_URL
  if (!BOT_TOKEN || !WEBAPP_URL) {
    console.error('Missing BOT_TOKEN or WEBAPP_URL');
    return { statusCode: 500, body: 'Missing env' };
  }

  let update;
  try { update = JSON.parse(event.body); } catch {
    return { statusCode: 200, body: 'no json' };
  }

  const msg    = update.message;
  const chatId = msg?.chat?.id;
  const from   = msg?.from;

  try {
    // /start — присылаем кнопку открытия WebApp
    if (msg?.text === '/start') {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Открой приложение кружков:',
        reply_markup: {
          keyboard: [[{ text: 'Открыть кружки', web_app: { url: WEBAPP_URL } }]],
          resize_keyboard: true,
          is_persistent: true,
        },
      });
    }

    // /admin <code> — выдаём права по секрету (требует ADMIN_SECRET)
    if (msg?.text?.startsWith('/admin')) {
      const parts = msg.text.trim().split(/\s+/);
      const code  = parts[1];

      if (!ADMIN_SECRET) {
        await tg('sendMessage', { chat_id: chatId, text: 'Админ-секрет не настроен на сервере.' });
      } else if (!code) {
        await tg('sendMessage', { chat_id: chatId, text: 'Укажите код: /admin <код>' });
      } else if (code === ADMIN_SECRET) {
        await tg('sendMessage', { chat_id: chatId, text: 'Код верный ✅ Включаю админ-режим…' });
        try {
          await addAdmin(chatId);
          await tg('sendMessage', { chat_id: chatId, text: 'Готово. Админ-режим включён ✅ Откройте WebApp заново.' });
          if (ADMIN_CHAT_ID) {
            await tg('sendMessage', { chat_id: ADMIN_CHAT_ID, text: `🛡 Выдан админ для ${chatId} (@${from?.username || '—'})` });
          }
        } catch (e) {
          console.error('addAdmin error', e);
          await tg('sendMessage', { chat_id: chatId, text: 'Код верный, но не удалось сохранить права 😕 Сообщите администратору.' });
          if (ADMIN_CHAT_ID) {
            await tg('sendMessage', { chat_id: ADMIN_CHAT_ID, text: `❗️Ошибка addAdmin для ${chatId}: ${String(e)}` });
          }
        }
      } else {
        await tg('sendMessage', { chat_id: chatId, text: 'Неверный код ❌' });
      }
    }

    // /revoke — снять права
    if (msg?.text === '/revoke') {
      try {
        await removeAdmin(chatId);
        await tg('sendMessage', { chat_id: chatId, text: 'Админ-режим отключён.' });
      } catch (e) {
        console.error('removeAdmin error', e);
        await tg('sendMessage', { chat_id: chatId, text: 'Не удалось снять права.' });
      }
    }

    // Данные из WebApp (sendData)
    const wad = msg?.web_app_data;
    if (wad?.data) {
      let payload;
      try { payload = JSON.parse(wad.data); } catch { payload = { raw: wad.data }; }

      if (ADMIN_CHAT_ID) {
        await tg('sendMessage', {
          chat_id: ADMIN_CHAT_ID,
          parse_mode: 'HTML',
          text:
            `<b>WebApp данные</b>\n` +
            `От: @${from?.username || '—'} (id ${from?.id})\n\n` +
            `<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`
        });
      }
      await tg('sendMessage', { chat_id: chatId, text: 'Данные получены ✅ Спасибо!' });
    }
  } catch (e) {
    console.error('Handler error', e);
  }

  // Всегда отвечаем 200, чтобы Telegram не ругался
  return { statusCode: 200, body: 'OK' };
}
