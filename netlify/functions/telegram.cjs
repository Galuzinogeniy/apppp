// netlify/functions/telegram.cjs
let _blobs; // ленивый импорт, чтобы не падать на require/esm
async function blobs() {
  if (_blobs) return _blobs;
  _blobs = await import('@netlify/blobs');
  return _blobs;
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // куда слать уведомления
const WEBAPP_URL = process.env.WEBAPP_URL;       // https://<твой>.netlify.app
const ADMIN_SECRET = process.env.ADMIN_SECRET;   // секретный код

function escapeHtml(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
async function tg(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  // проглотаем ошибки, но залогируем
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('TG API error', method, res.status, txt);
  }
}

// helpers: хранение админов в Blobs
async function addAdmin(id) {
  const { getStore } = await blobs();
  const store = getStore({ name: 'admins' });
  await store.set(String(id), '1');
}
async function removeAdmin(id) {
  const { getStore } = await blobs();
  const store = getStore({ name: 'admins' });
  await store.delete(String(id));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'OK' };
  if (!BOT_TOKEN || !WEBAPP_URL || !ADMIN_SECRET) return { statusCode: 500, body: 'Missing env' };

  let update;
  try { update = JSON.parse(event.body); } catch { return { statusCode: 200, body: 'no json' }; }
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const from = msg?.from;

  try {
    // /start — показать кнопку открытия WebApp
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

    // /admin <code> — включить админство по секрету
    if (msg?.text?.startsWith('/admin')) {
      const parts = msg.text.trim().split(/\s+/);
      const code = parts[1];
      if (!code) {
        await tg('sendMessage', { chat_id: chatId, text: 'Укажите код: /admin <код>' });
      } else if (code === ADMIN_SECRET) {
        // 1) Сразу ответ — чтобы пользователь не видел тишину
        await tg('sendMessage', { chat_id: chatId, text: 'Код верный ✅ Включаю админ-режим…' });
        // 2) Пробуем записать
        try {
          await addAdmin(chatId);
          await tg('sendMessage', { chat_id: chatId, text: 'Готово. Админ-режим включён ✅ Откройте WebApp заново.' });
          if (ADMIN_CHAT_ID) {
            await tg('sendMessage', { chat_id: ADMIN_CHAT_ID, text: `🛡 Выдан админ для ${chatId} (@${from?.username||'—'})` });
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
        await tg('sendMessage', { chat_id: chatId, text: 'Не удалось снять права. Сообщите администратору.' });
      }
    }

    // Данные из WebApp
    const wad = msg?.web_app_data;
    if (wad?.data) {
      let payload;
      try { payload = JSON.parse(wad.data); } catch { payload = { raw: wad.data }; }

      if (ADMIN_CHAT_ID) {
        await tg('sendMessage', {
          chat_id: ADMIN_CHAT_ID,
          parse_mode: 'HTML',
          text: `<b>WebApp данные</b>\nОт: @${from?.username || '—'} (id ${from?.id})\n\n<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`
        });
      }
      await tg('sendMessage', { chat_id: chatId, text: 'Данные получены ✅ Спасибо!' });
    }
  } catch (e) {
    console.error('Handler error', e);
  }
  return { statusCode: 200, body: 'OK' };
};
