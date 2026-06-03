import { requireAdmin, hashPassword, json } from '../_lib/auth.js';

const USER_KEY = (u) => `user:${u}`;
const VALID_USERNAME = /^[A-Za-z0-9_.\-]{1,32}$/;

async function listAllUsers(env) {
  const out = [];
  let cursor;
  do {
    const res = await env.INVEST_USERS_KV.list({ prefix: 'user:', cursor });
    for (const k of res.keys) {
      const username = k.name.slice('user:'.length);
      const raw = await env.INVEST_USERS_KV.get(k.name);
      let role = 'user';
      try { const r = JSON.parse(raw); if (r?.role === 'admin') role = 'admin'; } catch {}
      out.push({ username, role });
    }
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
  out.sort((a, b) => a.username.localeCompare(b.username));
  return out;
}

export async function onRequest({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (auth.error === 'unauth') return json({ error: '未登录' }, { status: 401 });
  if (auth.error === 'forbidden') return json({ error: '需要管理员权限' }, { status: 403 });

  const method = request.method;

  if (method === 'GET') {
    const users = await listAllUsers(env);
    return json({ users, currentUser: auth.user });
  }

  if (method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!body) return json({ error: '请求格式错误' }, { status: 400 });
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const role = body.role === 'admin' ? 'admin' : 'user';
    if (!VALID_USERNAME.test(username)) {
      return json({ error: '用户名不合法（仅字母数字 _ . -，长度 ≤ 32）' }, { status: 400 });
    }
    if (password.length < 4) return json({ error: '密码长度不能少于 4 位' }, { status: 400 });
    const exists = await env.INVEST_USERS_KV.get(USER_KEY(username));
    if (exists) return json({ error: '用户已存在' }, { status: 409 });

    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = [...saltBytes].map(b => b.toString(16).padStart(2, '0')).join('');
    const hash = await hashPassword(password, salt);
    await env.INVEST_USERS_KV.put(USER_KEY(username), JSON.stringify({ salt, hash, role }));
    return json({ ok: true });
  }

  if (method === 'DELETE') {
    const url = new URL(request.url);
    const username = url.searchParams.get('username');
    if (!username) return json({ error: '缺少 username' }, { status: 400 });
    if (username === auth.user) return json({ error: '不能删除当前登录用户' }, { status: 400 });
    const raw = await env.INVEST_USERS_KV.get(USER_KEY(username));
    if (!raw) return json({ error: '用户不存在' }, { status: 404 });
    await env.INVEST_USERS_KV.delete(USER_KEY(username));
    return json({ ok: true });
  }

  return json({ error: 'Method Not Allowed' }, { status: 405 });
}
