# Provider Gateway

StarSyun 的公开数据查询现在可以通过 Vercel Serverless Functions 走服务端 Provider Gateway：

- `POST /api/stac/search`：查询已登记的 STAC 集合
- `GET /api/stac/item/:id`：读取单个公开产品，支持详情页刷新
- `POST /api/inquiries`：提交客户询价；配置 Supabase 后持久化
- `GET /api/inquiries`：读取询价列表，仅限管理员会话
- `PATCH /api/inquiries/:id`：更新询价状态，仅限管理员会话
- `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/auth/session`：后台会话管理
- `POST /api/quotes` / `PATCH /api/quotes/:id`：管理员创建报价版本并发布
- `GET /api/quotes/mine` / `POST /api/quotes/:id/accept`：客户读取并接受自己的有效报价
- `GET /api/orders/mine`：客户读取由已接受报价生成的订单

当前登记的集合是 Earth Search 的 `sentinel-2-l2a`。网关对集合、bbox、日期、云量和 limit 做白名单校验，不接受任意上游 URL，因此不会成为开放代理。

## 部署

在 Vercel 项目环境变量中设置：

```text
VITE_STAC_GATEWAY_URL=/api/stac
VITE_INQUIRY_API_URL=/api/inquiries
ALLOWED_ORIGINS=https://starsyun.com,https://www.starsyun.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=replace-with-server-only-secret-key
SUPABASE_PUBLISHABLE_KEY=replace-with-supabase-publishable-key-for-customer-auth
ADMIN_EMAILS=ops@starsyun.com
ADMIN_PASSWORD_SHA256=replace-with-sha256-of-admin-password
AUTH_SESSION_SECRET=replace-with-a-random-32-byte-secret
```

`VITE_STAC_GATEWAY_URL` 会被编译进前端，只填写站内路径或受信任的 API 域名。`ALLOWED_ORIGINS` 是服务端变量，不能使用 `VITE_` 前缀，也不能把供应商密钥放入前端变量。

询价表定义在 `supabase/migrations/001_create_inquiries.sql`。先在目标 Supabase 项目执行迁移，再把 `SUPABASE_URL` 与 `SUPABASE_SECRET_KEY` 配置到服务端。Secret key 只允许存在于服务端环境变量，绝不能放入 GitHub Pages、`.env.production` 或任意 `VITE_*` 变量。

报价表定义在 `supabase/migrations/002_create_quotes.sql`，执行迁移时需要先完成询价表迁移。报价按 `inquiry_id + version` 唯一，只有 `sent` 和 `accepted` 状态会出现在客户侧；接受报价后，下一阶段再生成订单和支付意图。

订单表定义在 `supabase/migrations/003_create_orders.sql`。接受报价会幂等生成一笔 `pending_payment` 订单，订单冻结报价金额和交付周期；当前不会伪造支付成功，支付接入后再由 webhook 推进 `payment_status` 与订单状态。

管理端通过 `POST /api/auth/login` 建立 8 小时的 HttpOnly 会话，随后才可读取或更新服务端询价。设置管理员环境变量时，`ADMIN_EMAILS` 是逗号分隔的运营邮箱白名单；`ADMIN_PASSWORD_SHA256` 可由 `printf %s 'your-password' | shasum -a 256` 生成；`AUTH_SESSION_SECRET` 应使用 `openssl rand -hex 32` 生成。三者均为服务端密钥，不能放入前端变量或提交到仓库。

普通客户登录和注册也通过 `/api/auth/login`、`/api/auth/register` 进入 Supabase Auth。需要把 `SUPABASE_PUBLISHABLE_KEY` 配置在服务端环境中；它不是高权限密钥，但本项目仍统一通过服务端使用，不写入 `VITE_*` 变量。开启邮箱确认时，注册接口会返回 `202`，用户完成邮箱确认后再登录。

这是一层用于首个运营后台的部署边界。正式规模化上线前，应替换为企业 SSO 或 Supabase Auth，并在管理操作中写入操作者审计日志。

GitHub Pages 和本地 Vite 预览未配置网关时，前端继续直连公开 Earth Search；网关不可用时，检索页继续显示现有示例数据并提示回退状态。

本地预览或未配置询价数据库时，提交页会保留本地缓存回退，并明确提示“保存到当前设备”。这仅用于连续的演示体验，不是服务端持久化，也不会在用户设备间同步。

## 运行边界

网关当前使用进程内 60 秒缓存和每 IP 每分钟 60 次的基础限流。Serverless 实例重启后缓存会清空，因此上线后应迁移到 Redis/KV，并补充请求日志、指标、供应商配额和持久化审计。

后续 Provider 适配器应沿用同一边界：前端只看到统一产品协议，供应商密钥、报价、订单、交付和授权条款全部留在服务端。
