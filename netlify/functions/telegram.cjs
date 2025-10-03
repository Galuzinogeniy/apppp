// netlify/functions/telegram.cjs
'use strict';

const { getStore } = require('@netlify/blobs');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || ''; // можно пустым
const WEBAPP_URL = process.env.WEBAPP_URL;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

function escapeHtml(s) {
  s = s || '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function tg(method, payload) {
  const url = 'https://api.telegram.org/bot' + BOT_TOKEN + '/' + method;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// --- Хранилище админов в Netlify Blobs ---
async function addAdmin(id) {
  const store = getStore({ name: 'admins' });
  await store.set(String(id), '1');
}
async function removeAdmin(id) {
  const store = getStore({ name: 'admins' });
  await store.delete(String(id));
}
async function isAdmin(id) {
  const store = getStore({ name: 'admins' });
  const val = await store.get(String(id));
  return !!val;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, body: 'OK' };
  }

  if (!BOT_TOKEN || !WEBAPP_URL || !ADMIN_SECRET) {
    console.error('Missing env BOT_TOKEN/WEBAPP_URL/ADMIN_SECRET');
    return { statusCode: 500, body: 'Missing env' };
  }

  let update;
  try {
    update = JSON.parse(event.body);
  } catch (e) {
    console.error('Bad JSON', e);
    return { statusCode: 200, body: 'no json' };
  }

  const msg = update && update.message;
  const chatId = msg && msg.chat && msg.chat.id;

  try {
    // /start — присылаем кнопку для открытия WebApp
    if (msg && msg.text === '/start') {
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

    // /admin <код> — выдаём права, если код верный
    if (msg && typeof msg.text === 'string' && msg.text.indexOf('/admin') === 0) {
      const parts = msg.text.trim().split(/\s+/);
      const code = parts[1];
      if (!code) {
        await tg('sendMessage', { chat_id: chatId, text: 'Укажите код: /admin <код>' });
      } else if (code === ADMIN_SECRET) {
        await addAdmin(chatId);
        await tg('sendMessage', { chat_id: chatId, text: 'Готово. Админ-режим включён ✅ Откройте WebApp заново.' });
        if (ADMIN_CHAT_ID) {
          await tg('sendMessage', { chat_id: ADMIN_CHAT_ID, text: '🛡 Выдал админа для ' + chatId });
        }
      } else {
        await tg('sendMessage', { chat_id: chatId, text: 'Неверный код ❌' });
      }
    }

    // /revoke — снять права у себя
    if (msg && msg.text === '/revoke') {
      await removeAdmin(chatId);
      await tg('sendMessage', { chat_id: chatId, text: 'Админ-режим отключён.' });
    }

    // Данные из WebApp (Telegram.WebApp.sendData)
    const wad = msg && msg.web_app_data;
    if (wad && wad.data) {
      let payload;
      try { payload = JSON.parse(wad.data); } catch (e) { payload = { raw: wad.data }; }

      // Уведомление админу (если указан)
      if (ADMIN_CHAT_ID) {
        const who = (msg.from && msg.from.username) ? '@' + msg.from.username : '—';
        const uid = (msg.from && msg.from.id) ? String(msg.from.id) : '—';
        const body =
          '<b>WebApp данные</b>\n' +
          'От: ' + who + ' (id ' + uid + ')\n\n' +
          '<pre>' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>';

        await tg('sendMessage', {
          chat_id: ADMIN_CHAT_ID,
          parse_mode: 'HTML',
          text: body
        });
      }

      await tg('sendMessage', { chat_id: chatId, text: 'Данные получены ✅ Спасибо!' });
    }
  } catch (e) {
    console.error('Handler error', e);
  }

  return { statusCode: 200, body: 'OK' };
};
