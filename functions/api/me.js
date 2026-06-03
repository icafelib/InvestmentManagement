import { requireUser, getUserRecord, json } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: '未登录' }, { status: 401 });
  const record = await getUserRecord(env, user);
  const role = record?.role === 'admin' ? 'admin' : 'user';
  return json({ username: user, role });
}
