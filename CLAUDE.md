# CLAUDE.md

本文件为 AI 编码助手在本仓库工作时的项目上下文与约定。

## 项目概览
轻量投资管理工具，部署于 **Cloudflare Pages + Pages Functions + KV**，无外部数据库。
- 前端：纯静态页面（`public/`）。
- 后端：Pages Functions（`functions/api/*.js`），运行在 Workers Runtime。
- 存储：Cloudflare KV，四个 namespace：`INVEST_USERS_KV`、`INVEST_DATA_KV`、`INVEST_RECORDS_KV`、`INVEST_TOOLS_KV`。
- 不支持注册，用户由管理员手动写入 KV。

## 目录结构
```
public/                    # 静态前端（登录页 + dashboard）
functions/
  _lib/auth.js             # 共享：密码哈希、HMAC session、Cookie
  api/
    login.js  logout.js  me.js
    change-password.js
    investments.js         # CRUD 投资记录
    records.js             # CRUD 资产详细记录（时间/金额/产品/当前市值）
    users.js               # 列表/添加/删除用户（仅管理员）
    tools.js               # 实用工具长文本
scripts/hash-password.mjs  # 生成 {salt, hash}
```

## 运行 / 部署
- 本地：`npm run dev`（`wrangler pages dev public`，默认 http://127.0.0.1:8788）
- 部署：`npm run deploy` 或通过 Cloudflare Pages 连接 GitHub 自动部署
- KV 绑定与 `SESSION_SECRET` 在 Cloudflare Dashboard 配置（仓库中**不再保留** `wrangler.toml`，见 commit `dcbff57`）
- 本地开发需 `.dev.vars` 提供 `SESSION_SECRET`

## 关键约定
- **数据隔离**：所有用户数据按用户名做 key 前缀
  - 用户：`user:<username>` → `INVEST_USERS_KV`
  - 投资：`investments:<username>` → `INVEST_DATA_KV`（单 value 存全部条目的 JSON 数组）
  - 资产详细记录：`records:<username>` → `INVEST_RECORDS_KV`
  - 工具文本：`tools:<username>` → `INVEST_TOOLS_KV`
- **鉴权**：HMAC-SHA256 签名 Cookie（HttpOnly + Secure + SameSite=Lax），所有受保护接口通过 `requireUser(request, env)` 校验，未登录返回 401。管理员接口通过 `requireAdmin` 校验，非管理员返回 403。
- **角色**：用户记录形如 `{ salt, hash, role }`，`role` 为 `"admin"` 或 `"user"`，缺省视为普通用户。**首个管理员**只能通过 KV 手动写入；后续用户可在网页"管理用户"中由管理员增删。session payload 不包含 role，每次需要时通过 `getUserRecord` 实时读 KV，避免角色变更后 session 仍然过授权。
- **密码**：`sha256(salt + ":" + password)`，常量时间比较（见 `functions/_lib/auth.js`）。
- **响应**：统一使用 `json(data, init)` 辅助函数。

## 投资记录字段
`{ id, code, name, type, amount, platform }`
- `type` 枚举：`灵活资产` / `稳健投资` / `混合基金` / `风险投资`（`functions/api/investments.js:20`）
- `amount` 必须为有限数字
- 修改 type 枚举时同步更新前端 `public/js/dashboard.js`

## API 一览
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/login` | `{ username, password, remember }` |
| POST | `/api/logout` | 清除 session |
| GET  | `/api/me` | 当前用户名 |
| POST | `/api/change-password` | 修改密码 |
| GET/POST/DELETE | `/api/users` | 列出/添加/删除用户（仅管理员） |
| GET/POST/PUT/DELETE | `/api/investments` | 投资 CRUD（DELETE 用 `?id=`） |
| GET/POST/PUT/DELETE | `/api/records` | 资产详细记录 CRUD（字段：date/amount/product/currentValue；currentValue 留空默认等于 amount） |
| GET/PUT | `/api/tools` | 工具长文本读写 |

## 编码注意
- Workers Runtime：仅可用 Web 标准 API（`crypto.subtle`、`fetch`、`TextEncoder` 等），**不要**引入 Node 专属模块。
- 写入 KV 是最终一致的；本应用按单人使用设计，避免做"读-改-写"并发假设。
- 新增 API 时放到 `functions/api/`，导出 `onRequest` 或 `onRequestX`（method-specific），并使用 `requireUser`。
- 不要在仓库中引入 `wrangler.toml`，绑定一律由 Pages Dashboard 管理（参见提交历史中的明确决定）。

## 用户管理
```bash
node scripts/hash-password.mjs '密码'
npx wrangler kv key put --binding=INVEST_USERS_KV "user:alice" '{"salt":"...","hash":"..."}'
```
