import { verifyPassword, signSession, buildSessionCookie, json, getSecret } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, { status: 400 }); }
  const { username, password, remember } = body || {};
  if (!username || !password) return json({ error: '用户名/密码不能为空' }, { status: 400 });

  const raw = await env.INVEST_USERS_KV.get(`user:${username}`);
  if (!raw) return json({ error: '用户名或密码错误' }, { status: 401 });

  let record;
  try { record = JSON.parse(raw); } catch { return json({ error: '账号数据异常' }, { status: 500 }); }

  if (!(await verifyPassword(password, record))) {
    return json({ error: '用户名或密码错误' }, { status: 401 });
  }

  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8; // 30 天 or 8 小时
  const exp = Date.now() + maxAge * 1000;
  const token = await signSession({ u: username, exp }, getSecret(env));

  return json({ ok: true, username }, {
    headers: { 'Set-Cookie': buildSessionCookie(token, maxAge) },
  });
}
