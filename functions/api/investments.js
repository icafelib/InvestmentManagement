import { requireUser, json } from '../_lib/auth.js';

const KEY = (user) => `investments:${user}`;

async function readAll(env, user) {
  const raw = await env.INVEST_DATA_KV.get(KEY(user));
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
async function writeAll(env, user, items) {
  await env.INVEST_DATA_KV.put(KEY(user), JSON.stringify(items));
}

function validate(input) {
  if (!input) return '缺少数据';
  const required = ['code', 'name', 'type', 'amount', 'platform'];
  for (const k of required) {
    if (input[k] === undefined || input[k] === null || input[k] === '') return `缺少字段 ${k}`;
  }
  if (!['灵活资产', '稳健投资', '风险投资'].includes(input.type)) return '类型不合法';
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) return '金额需为数字';
  return null;
}

export async function onRequest({ request, env }) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: '未登录' }, { status: 401 });

  const method = request.method;

  if (method === 'GET') {
    const items = await readAll(env, user);
    return json({ items });
  }

  if (method === 'POST') {
    const body = await request.json().catch(() => null);
    const err = validate(body);
    if (err) return json({ error: err }, { status: 400 });
    const items = await readAll(env, user);
    const id = crypto.randomUUID();
    items.push({
      id,
      code: String(body.code),
      name: String(body.name),
      type: body.type,
      amount: Number(body.amount),
      platform: String(body.platform),
    });
    await writeAll(env, user, items);
    return json({ ok: true, id });
  }

  if (method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body?.id) return json({ error: '缺少 id' }, { status: 400 });
    const err = validate(body);
    if (err) return json({ error: err }, { status: 400 });
    const items = await readAll(env, user);
    const idx = items.findIndex(x => x.id === body.id);
    if (idx < 0) return json({ error: '记录不存在' }, { status: 404 });
    items[idx] = {
      id: body.id,
      code: String(body.code),
      name: String(body.name),
      type: body.type,
      amount: Number(body.amount),
      platform: String(body.platform),
    };
    await writeAll(env, user, items);
    return json({ ok: true });
  }

  if (method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: '缺少 id' }, { status: 400 });
    const items = await readAll(env, user);
    const next = items.filter(x => x.id !== id);
    await writeAll(env, user, next);
    return json({ ok: true });
  }

  return json({ error: 'Method Not Allowed' }, { status: 405 });
}
