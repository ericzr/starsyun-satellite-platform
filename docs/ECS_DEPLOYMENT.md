# StarSyun 腾讯云 CVM / 自有服务器部署手册

## 目标架构

```text
Internet
   |
   v
Tencent Cloud Security Group (80/443 only)
   |
   v
Nginx + TLS
   |
   v
StarSyun Node service (127.0.0.1:3000)
   |-- React/Vite static build
   |-- /api/stac
   |-- /api/auth
   |-- /api/inquiries, /api/quotes, /api/orders
   `-- /api/webhooks/stripe
             |
             +-- Supabase Auth/PostgreSQL（当前项目：新加坡）
             +-- Earth Search and satellite providers
             `-- Stripe
```

`server/index.ts` 将原来的 Vercel Functions 处理器适配为标准 Node HTTP 服务，同时提供 SPA 路由回退、静态资源缓存、请求体限制、基础安全头和健康检查。服务器不需要 Vercel CLI，也不应使用 `vite preview` 承载正式流量。

## 已核对的生产服务器现状（2026-09-04）

- 云厂商：腾讯云 CVM，新加坡地域。
- 公网入口：`https://starsyun.com`，Nginx 终止 TLS 并反向代理到 `127.0.0.1:3000`。
- 应用：Ubuntu + Node.js 22 + systemd，运行用户为 `starsyun`。
- 安全组：公网仅开放 80/443；SSH 22 使用管理 IP 白名单；应用、数据库和 Redis 端口不对公网开放。
- 数据底座：Supabase Pro，新加坡 AWS 区域；服务端使用新 API key 模式。
- 发布目录：`/srv/starsyun/releases/<git-sha>`，`/srv/starsyun/current` 为当前版本软链接。
- 线上探针：`/healthz` 与 `/readyz` 已通过；Stripe 尚未启用，属于后续支付主线。

> 本文不记录服务器密码、Supabase 密钥、支付密钥或供应商凭据。运行时秘密只允许出现在服务器的 `/etc/starsyun/starsyun.env`。

## 迁移门禁

在这些条件全部满足前，不切换正式流量：

1. 为系统盘创建快照，确认日志、旧 release 与临时文件不会持续增长。
2. 盘点 Nginx vhost、systemd 服务、监听端口和日志占用，保留现有站点的可回滚备份。
3. 将管理出口 IP 加入 SSH 22 白名单；不要把 22 开放给 `0.0.0.0/0` 或 `::/0`。
4. 确认域名 DNS、TLS、备案和跨境访问合规路径。
5. 在生产 Supabase 项目按顺序执行所有迁移，并完成备份/恢复验证。
6. 配置服务端密钥，并确保真实值只存在 `/etc/starsyun/starsyun.env`。
7. 用测试账号跑通注册/登录、询价、报价、接受报价、订单和支付 webhook 闭环。
8. 接入 COS 后，再把交付文件、签名下载和下载审计加入上线验收。

## 构建发布包

构建发生在 CI 或可控开发机，不要在剩余空间紧张的 ECS 上安装 `node_modules` 和构建。

```bash
npm ci
npm run build:production
tar -czf starsyun-release.tgz dist dist-server package.json scripts supabase/migrations deploy/systemd deploy/nginx
```

发布前可运行 npm run check:release 检查迁移文件和构建产物；在服务器准备好运行时文件后，再用 npm run check:release -- --runtime-env=/etc/starsyun/starsyun.env 检查必需配置、生产 CORS 和 COS 变量（不会打印密钥）。

服务器运行时可执行 `npm run check:supabase`，它只验证 `001` 至 `006` 对应的五张业务表与 `orders` 的支付字段是否可通过 Supabase REST 访问，不会读取或输出业务数据。`004` 是订单表字段迁移，并不创建独立支付表。

构建产物中：

- `dist/`：前端静态产物。
- `dist-server/server.js`：已打包的 Node API/静态服务，运行时无需 `node_modules`。

## 服务器目录

```text
/srv/starsyun/
  releases/
    <git-sha>/
      dist/
      dist-server/
      package.json
  current -> /srv/starsyun/releases/<git-sha>
/etc/starsyun/starsyun.env
/var/log/starsyun/
```

不使用 root 运行应用。初次准备：

```bash
sudo useradd --system --home /srv/starsyun --shell /usr/sbin/nologin starsyun
sudo install -d -o starsyun -g starsyun /srv/starsyun/releases /var/log/starsyun
sudo install -d -m 0750 -o root -g starsyun /etc/starsyun
sudo install -m 0600 -o root -g starsyun deploy/env.runtime.example /etc/starsyun/starsyun.env
```

真实密钥必须手工填入服务器环境文件，不通过 Git、聊天或构建日志传输。

## systemd 与 Nginx

```bash
sudo install -m 0644 deploy/systemd/starsyun.service /etc/systemd/system/starsyun.service
sudo systemctl daemon-reload
sudo systemctl enable starsyun

sudo install -m 0644 deploy/nginx/starsyun.conf /etc/nginx/sites-available/starsyun.conf
sudo ln -s /etc/nginx/sites-available/starsyun.conf /etc/nginx/sites-enabled/starsyun.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d starsyun.com -d www.starsyun.com --redirect
```

Nginx 模板先以 HTTP 启动并提供 ACME 验证路径；确认 DNS 和 80 端口可访问后，由 Certbot 自动生成并维护 443 配置。

## 原子发布与回滚

```bash
release_id=<git-sha>
sudo install -d -o starsyun -g starsyun "/srv/starsyun/releases/$release_id"
sudo tar -xzf starsyun-release.tgz -C "/srv/starsyun/releases/$release_id"
sudo chown -R starsyun:starsyun "/srv/starsyun/releases/$release_id"
sudo ln -sfn "/srv/starsyun/releases/$release_id" /srv/starsyun/current
sudo systemctl restart starsyun
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS http://127.0.0.1:3000/readyz
sudo nginx -t && sudo systemctl reload nginx
```

回滚只需将 `current` 指回上一个 release，然后重启 `starsyun`。不要删除当前版本，至少保留最近两个经验证版本。

## 验收清单

- `GET /healthz` 返回 200。
- `GET /readyz` 仅在 Supabase 和管理员认证均已配置时返回 200；否则返回 503。Stripe 可在支付联调前保持 false。
- `/explore`、`/profile`、`/orders/:id` 直接刷新均返回 SPA，不出现 404。
- `/api/stac/search` 通过服务端返回 Earth Search 真实产品。
- Cookie 具有 `HttpOnly`、`Secure` 和 `SameSite=Lax`。
- 未授权访问管理接口返回 401，不泄露服务端堆栈。
- Nginx access/error log、systemd journal 和磁盘告警可用。
- GitHub Pages 保留为静态演示与应急回退入口，不承载真实订单。
