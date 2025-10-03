// netlify/functions/is-admin.cjs
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const userId = event.queryStringParameters?.user_id;
  if (!userId) return { statusCode: 400, body: JSON.stringify({ is_admin: false }) };

  const store = getStore({ name: 'admins' });
  const val = await store.get(String(userId));
  return { statusCode: 200, body: JSON.stringify({ is_admin: Boolean(val) }) };
};
