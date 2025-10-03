// ESM webhook для Telegram. Защищён от падений.
// Работает даже если хранилище Blobs недоступно (просто не включает админа, но отвечает).

let store = null;
async function ensureStore() {
  if (store) return store;
  try {
    const mod = await import('@netlify/blobs');
    store = mod.getStore({ name: 'admins' });
  } catch (e) {
    console.error('Blobs unavailable:', e);
    store = null; // не падаем, просто нет персист-хранилища
  }
  return store;
}

const BOT_TOKEN     = process.env.BOT_TOKEN;
const WEBAPP_URL    = process.env.WEBAPP_URL;
const ADMIN_SECRET  = process.env.ADMIN_SECRET || ""; // может быть пустым
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || ""; // опционально

function escapeHtml(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
async function tg(method, payload) {
  if (!BOT_TOKEN) return;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(e => ({ ok:false, statusText:String(e) }));
  if (!res?.ok) {
    let t = '';
    try { t = await res.text(); } catch {}
    console.error('TG API error', method, res?.status, t || res?.statusText);
  }
}

async function addAdmin(chatId) {
  const s = await ensureStore();
  if (!s) throw new Error('blobs_unavailable');
  await s.set(String(chatId), '1');
}
async function removeAdmin(chatId) {
  const s = await ensureStore();
  if (!s) throw new Error('blobs_unavailable');
  await s.delete(String(chatId));
}

export async function handler(event) {
  // Telegram шлёт POST; на GET просто ответим ОК (для быстрой проверки в браузере)
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'OK' };

  // Для /start и приёма заявок нужно хотя бы это:
  if (!BOT_TOKEN || !WEBAPP_URL) {
    console.error('Missing BOT_TOKEN or WEBAPP_URL');
    return { statusCode: 200, body: 'OK' }; // не 500, чтобы Telegram не ретраил бесконечно
  }

  let update;
  try { update = JSON.parse(event.body); } catch {
    return { statusCode: 200, body: 'OK' };
  }

  const msg    = update.message;
  const chatId = msg?.chat?.id;
  const from   = msg?.from;

  try {
    // /start — дать кнопку открытия WebApp
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

    // /admin <code> — включить админство по секрету (если секрет настроен)
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
        await tg('sendMessage', { chat_id: chatId, text: 'Не удалось снять права (хранилище недоступно).' });
      }
    }

    // Данные из WebApp (Telegram.WebApp.sendData)
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

  return { statusCode: 200, body: 'OK' };
}
