import { requireUser, json } from '../_lib/auth.js';

const KEY = (user) => `tools:${user}`;

export async function onRequest({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: '未登录' }, { status: 401 });

  if (request.method === 'GET') {
    const text = (await env.TOOLS_KV.get(KEY(user))) || '';
    return json({ text });
  }

  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (typeof body?.text !== 'string') return json({ error: '缺少 text' }, { status: 400 });
    if (body.text.length > 100_000) return json({ error: '内容过长' }, { status: 413 });
    await env.TOOLS_KV.put(KEY(user), body.text);
    return json({ ok: true });
  }

  return json({ error: 'Method Not Allowed' }, { status: 405 });
}
