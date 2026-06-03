#!/usr/bin/env node
// 生成可写入 INVEST_USERS_KV 的用户记录 JSON
// 用法： node scripts/hash-password.mjs <password>
// 输出： {"salt":"...","hash":"..."}

import { webcrypto } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('用法: node scripts/hash-password.mjs <password>');
  process.exit(1);
}

const saltBytes = webcrypto.getRandomValues(new Uint8Array(16));
const salt = [...saltBytes].map(b => b.toString(16).padStart(2, '0')).join('');

const enc = new TextEncoder();
const buf = await webcrypto.subtle.digest('SHA-256', enc.encode(`${salt}:${password}`));
const hash = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

console.log(JSON.stringify({ salt, hash }));
