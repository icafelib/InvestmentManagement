import { requireUser, verifyPassword, hashPassword, json } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: '未登录' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, { status: 400 }); }
  const { oldPassword, newPassword } = body || {};
  if (!oldPassword || !newPassword) return json({ error: '旧密码和新密码不能为空' }, { status: 400 });
  if (typeof newPassword !== 'string' || newPassword.length < 4) {
    return json({ error: '新密码长度不能少于 4 位' }, { status: 400 });
  }
  if (oldPassword === newPassword) {
    return json({ error: '新密码不能与旧密码相同' }, { status: 400 });
  }

  const raw = await env.INVEST_USERS_KV.get(`user:${user}`);
  if (!raw) return json({ error: '账号不存在' }, { status: 404 });

  let record;
  try { record = JSON.parse(raw); } catch { return json({ error: '账号数据异常' }, { status: 500 }); }

  if (!(await verifyPassword(oldPassword, record))) {
    return json({ error: '旧密码不正确' }, { status: 401 });
  }

  // 生成新 salt 并写回
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = [...saltBytes].map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = await hashPassword(newPassword, salt);

  const next = { ...record, salt, hash };
  await env.INVEST_USERS_KV.put(`user:${user}`, JSON.stringify(next));

  return json({ ok: true });
}
