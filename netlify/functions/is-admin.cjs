// netlify/functions/is-admin.cjs
exports.handler = async (event) => {
  const userId = event.queryStringParameters?.user_id;
  if (!userId) return { statusCode: 400, body: JSON.stringify({ is_admin: false }) };

  try {
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'admins' });
    const val = await store.get(String(userId));
    return { statusCode: 200, body: JSON.stringify({ is_admin: Boolean(val) }) };
  } catch (e) {
    console.error('is-admin error', e);
    // В случае проблемы — не ломаем фронт
    return { statusCode: 200, body: JSON.stringify({ is_admin: false }) };
  }
};
