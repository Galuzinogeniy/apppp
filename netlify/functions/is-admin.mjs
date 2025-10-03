// ESM-версия: проверка админа
import { getStore } from '@netlify/blobs';

const store = getStore({ name: 'admins' });

export async function handler(event) {
  const userId = event.queryStringParameters?.user_id;
  if (!userId) return { statusCode: 400, body: JSON.stringify({ is_admin: false }) };

  try {
    const val = await store.get(String(userId));
    return { statusCode: 200, body: JSON.stringify({ is_admin: Boolean(val) }) };
  } catch (e) {
    console.error('is-admin error', e);
    return { statusCode: 200, body: JSON.stringify({ is_admin: false }) };
  }
}
