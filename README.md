# 投资管理网站（Cloudflare Pages + KV）

一个部署在 Cloudflare Pages 上的轻量投资管理工具。前端为静态页面，后端使用 Pages Functions，数据存储在 Cloudflare KV，不使用任何外部数据库。

## 功能
1. 登录页（用户名/密码 + 记住我），不支持注册；账号只能在 KV 后台手动增删。
2. 主页投资清单：分页（每页 10 行）、新增、编辑、删除；字段含编号、产品名、类型（灵活资产 / 稳健投资 / 风险投资）、金额、平台。
3. 顶部按"产品名"展示金额分布饼图。
4. 底部"实用工具"长文本，按用户隔离保存到 KV。
5. 不同用户的数据完全隔离（KV key 形如 `investments:<username>`、`tools:<username>`）。

## 目录结构
```
public/                 # 静态前端
  index.html            # 登录页
  dashboard.html        # 主页
  css/style.css
  js/login.js
  js/dashboard.js
functions/              # Cloudflare Pages Functions（后端 API）
  _lib/auth.js          # 鉴权/哈希/Cookie 工具
  api/login.js
  api/logout.js
  api/me.js
  api/investments.js
  api/tools.js
scripts/hash-password.mjs  # 生成 KV 用户记录（含 salt+hash）
wrangler.toml
```

## 安全设计
- 密码使用 SHA-256 + 随机 salt 哈希后存储（`{ "salt": "...", "hash": "..." }`）。
- Session 使用 HMAC-SHA256 签名的 Cookie（HttpOnly + Secure + SameSite=Lax）。
- HMAC 密钥通过 `SESSION_SECRET` secret 注入，不写入仓库。
- 用户数据按用户名作为 KV key 前缀隔离。

## 一、本地准备
```bash
npm install
# 安装 wrangler 后用浏览器登录
npx wrangler login
```

## 二、创建 KV 命名空间
```bash
npx wrangler kv namespace create USERS_KV
npx wrangler kv namespace create DATA_KV
npx wrangler kv namespace create TOOLS_KV
```
把每个命令输出的 `id` 填入 `wrangler.toml` 对应位置。

## 三、添加用户（手动写入 KV）
1. 生成密码记录：
   ```bash
   node scripts/hash-password.mjs '你的密码'
   # => {"salt":"...","hash":"..."}
   ```
2. 写入 KV（key 格式：`user:<username>`）：
   ```bash
   npx wrangler kv key put --binding=USERS_KV "user:alice" '{"salt":"...","hash":"..."}'
   ```
3. 删除用户：
   ```bash
   npx wrangler kv key delete --binding=USERS_KV "user:alice"
   ```
> 也可在 Cloudflare Dashboard → Workers & Pages → KV 中直接编辑。

## 四、配置 Session 密钥
生成一段足够长的随机字符串（≥32 字节）：
```bash
# 部署到 Pages 后，写入 secret：
npx wrangler pages secret put SESSION_SECRET
# 本地开发时，新建 .dev.vars：
echo 'SESSION_SECRET="一段长随机字符串"' > .dev.vars
```

## 五、本地运行
```bash
npm run dev
# 默认 http://127.0.0.1:8788
```

## 六、部署
推荐通过 GitHub 仓库连接 Cloudflare Pages：
1. 把代码推到 GitHub。
2. Cloudflare Dashboard → Pages → Create project → Connect to Git，选择该仓库。
3. 构建设置：
   - Build command：留空
   - Build output directory：`public`
4. Settings → Functions → KV namespace bindings 中绑定：
   - `USERS_KV`、`DATA_KV`、`TOOLS_KV`（与 `wrangler.toml` 中名称一致）
5. Settings → Environment variables → Production → Add secret：
   - `SESSION_SECRET`
6. 触发部署。

或直接命令行部署：
```bash
npm run deploy
```

## API 速览
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/login` | `{ username, password, remember }` |
| POST | `/api/logout` | 清除 session cookie |
| GET  | `/api/me` | 当前登录用户名 |
| GET  | `/api/investments` | 列出当前用户全部投资 |
| POST | `/api/investments` | 新增 |
| PUT  | `/api/investments` | 修改（需带 id） |
| DELETE | `/api/investments?id=...` | 删除 |
| GET  | `/api/tools` | 读取实用工具文本 |
| PUT  | `/api/tools` | 保存实用工具文本 |

## 备注
- 投资数据规模较小时，将单用户全部条目放在一个 KV value 是合理的（KV value 最大 25MB，远超本场景需求）。
- KV 写入有最终一致性，多端同时编辑可能互相覆盖，单人使用无影响。
