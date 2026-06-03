import { requireUser, json } from '../_lib/auth.js';

const KEY = (user) => `records:${user}`;

async function readAll(env, user) {
  const raw = await env.INVEST_RECORDS_KV.get(KEY(user));
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
async function writeAll(env, user, items) {
  await env.INVEST_RECORDS_KV.put(KEY(user), JSON.stringify(items));
}

function validate(input, { isUpdate } = {}) {
  if (!input) return '缺少数据';
  if (input.date === undefined || input.date === null || input.date === '') return '缺少字段 date';
  if (input.amount === undefined || input.amount === null || input.amount === '') return '缺少字段 amount';
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) return '投资金额需为数字';
  if (input.currentValue !== undefined && input.currentValue !== null && input.currentValue !== '') {
    const cv = Number(input.currentValue);
    if (!Number.isFinite(cv)) return '当前市值需为数字';
  }
  return null;
}

function normalize(body) {
  const amount = Number(body.amount);
  const cvRaw = body.currentValue;
  const currentValue = (cvRaw === undefined || cvRaw === null || cvRaw === '')
    ? amount
    : Number(cvRaw);
  return {
    date: String(body.date),
    amount,
    product: body.product == null ? '' : String(body.product),
    currentValue,
  };
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
    items.push({ id, ...normalize(body) });
    await writeAll(env, user, items);
    return json({ ok: true, id });
  }

  if (method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body?.id) return json({ error: '缺少 id' }, { status: 400 });
    const err = validate(body, { isUpdate: true });
    if (err) return json({ error: err }, { status: 400 });
    const items = await readAll(env, user);
    const idx = items.findIndex(x => x.id === body.id);
    if (idx < 0) return json({ error: '记录不存在' }, { status: 404 });
    items[idx] = { id: body.id, ...normalize(body) };
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
