// 共享工具：密码哈希、Session 签发/校验、Cookie 读写
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes) {
  let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 密码格式：sha256(salt + ":" + password)，KV 中存 { salt, hash }
export async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}

export async function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const h = await hashPassword(password, record.salt);
  // 常量时间比较
  if (h.length !== record.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ record.hash.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  );
}

export async function signSession(payload, secret) {
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64urlEncode(sig)}`;
}

export async function verifySession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(body)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers.get('Cookie') || '';
  const out = {};
  for (const part of header.split(/;\s*/)) {
    if (!part) continue;
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx)] = decodeURIComponent(part.slice(idx + 1));
  }
  return out;
}

export function buildSessionCookie(token, maxAgeSec) {
  const parts = [
    `session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  if (maxAgeSec) parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join('; ');
}

export function clearSessionCookie() {
  return 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

export function getSecret(env) {
  const s = env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET not configured');
  return s;
}

export async function requireUser(request, env) {
  const cookies = parseCookies(request);
  const payload = await verifySession(cookies.session, getSecret(env));
  if (!payload || !payload.u) return null;
  return payload.u; // username
}

export async function getUserRecord(env, username) {
  const raw = await env.INVEST_USERS_KV.get(`user:${username}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function isAdmin(record) {
  return !!record && record.role === 'admin';
}

export async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (!user) return { error: 'unauth' };
  const record = await getUserRecord(env, user);
  if (!isAdmin(record)) return { error: 'forbidden', user };
  return { user, record };
}
