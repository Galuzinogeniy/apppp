// netlify/functions/telegram.cjs
const { getStore } = require('@netlify/blobs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // кому слать уведомления
const WEBAPP_URL = process.env.WEBAPP_URL;       // https://<твой>.netlify.app
const ADMIN_SECRET = process.env.ADMIN_SECRET;   // секретный код для выдачи прав

function escapeHtml(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
async function tg(method, payload) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
}

// Простое хранилище админов в Netlify Blobs
async function addAdmin(id) {
  const store = getStore({ name: 'admins' });
  const key = String(id);
  await store.set(key, '1');
}
async function removeAdmin(id) {
  const store = getStore({ name: 'admins' });
  await store.delete(String(id));
}
async function isAdmin(id) {
  const store = getStore({ name: 'admins' });
  const val = await store.get(String(id));
  return Boolean(val);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'OK' };
  if (!BOT_TOKEN || !WEBAPP_URL || !ADMIN_SECRET) return { statusCode: 500, body: 'Missing env' };

  let update;
  try { update = JSON.parse(event.body); } catch { return { statusCode: 200, body: 'no json' }; }
  const msg = update.message;
  const chatId = msg?.chat?.id;

  try {
    // /start — кнопка WebApp
    if (msg?.text === '/start') {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Открой приложение кружков:',
        reply_markup: {
          keyboard: [[{ text: 'Открыть кружки', web_app: { url: WEBAPP_URL } }]],
          resize_keyboard: true, is_persistent: true
        }
      });
    }

    // /admin <code> — выдать права если код верный
    if (msg?.text?.startsWith('/admin')) {
      const parts = msg.text.trim().split(/\s+/);
      const code = parts[1];
      if (!code) {
        await tg('sendMessage', { chat_id: chatId, text: 'Укажите код: /admin <код>' });
      } else if (code === ADMIN_SECRET) {
        await addAdmin(chatId);
        await tg('sendMessage', { chat_id: chatId, text: 'Готово. Админ-режим включён ✅ Откройте WebApp заново.' });
        if (ADMIN_CHAT_ID) {
          await tg('sendMessage', { chat_id: ADMIN_CHAT_ID, text: `🛡 Выдал админа для ${chatId}` });
        }
      } else {
        await tg('sendMessage', { chat_id: chatId, text: 'Неверный код ❌' });
      }
    }

    // /revoke — снять права (для текущего чата)
    if (msg?.text === '/revoke') {
      await removeAdmin(chatId);
      await tg('sendMessage', { chat_id: chatId, text: 'Админ-режим отключён.' });
    }

    // Приём данных из WebApp (sendData)
    const wad = msg?.web_app_data;
    if (wad?.data) {
      let payload;
      try { payload = JSON.parse(wad.data); } catch { payload = { raw: wad.data }; }

      // Шлём админу/в твой чат
      if (ADMIN_CHAT_ID) {
        await tg('sendMessage', {
          chat_id: ADMIN_CHAT_ID,
          parse_mode: 'HTML',
          text: `<b>WebApp данные</b>\nОт: @${msg.from?.username || '—'} (id ${msg.from?.id})\n\n<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`
        });
      }
      await tg('sendMessage', { chat_id: chatId, text: 'Данные получены ✅ Спасибо!' });
    }
  } catch (e) {
    console.error('Handler e
