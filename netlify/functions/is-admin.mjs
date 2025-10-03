// Проверка админства. Безопасно, не падает, если Blobs недоступно — просто возвращает false.
export async function handler(event) {
  const userId = event.queryStringParameters?.user_id;
  if (!userId) return { statusCode: 200, body: JSON.stringify({ is_admin: false }) };

  try {
    const mod = await import('@netlify/blobs');
    const store = mod.getStore({ name: 'admins' });
    const val = await store.get(String(userId));
    return { statusCode: 200, body: JSON.stringify({ is_admin: Boolean(val) }) };
  } catch (e) {
    console.error('is-admin error', e);
    return { statusCode: 200, body: JSON.stringify({ is_admin: false }) };
  }
}
