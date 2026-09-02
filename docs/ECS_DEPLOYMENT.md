# StarSyun 阿里云 ECS 迁移手册

## 目标架构

```text
Internet
   |
   v
Aliyun Security Group (80/443 only)
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
             +-- Supabase Auth/PostgreSQL
             +-- Earth Search and satellite providers
             `-- Stripe
```

`server/index.ts` 将原来的 Vercel Functions 处理器适配为标准 Node HTTP 服务，同时提供 SPA 路由回退、静态资源缓存、请求体限制、基础安全头和健康检查。服务器不需要 Vercel CLI，也不应使用 `vite preview` 承载正式流量。

## 已核对的 ECS 现状（2026-09-02）

- 实例：`i-uf6e4n1v7umuhql85l8k`，华东 2（上海），运行中。
- 系统：Ubuntu 22.04 64 位，2 vCPU / 4 GiB，公网带宽 5 Mbps。
- 公网 IP：`8.153.173.207`。
- 系统盘：40 GiB ESSD，控制台显示已使用 94.91%，这是当前最高优先级阻断项。
- 已有 Nginx 1.18 监听 80/443，IP 首页正在提供名为“中方信数据”的现有前端，迁移时不得覆盖默认站点或已有资产。
- 安全组已向公网放行 80/443；22 仅对现有 IP 白名单放行，当前工作端无法直连 SSH。
- Node.js 和 Git 扩展已安装，但 Node 实际版本仍需在服务器内确认。本项目生产基线为 Node.js `>=22.13.0`。
- `starsyun.com`、`www.starsyun.com` 和 `api.starsyun.com` 当前未解析到该实例。

## 迁移门禁

在这些条件全部满足前，不切换正式流量：

1. 先为系统盘创建快照，再清理日志、旧构建、包缓存或无用镜像；目标使用率低于 70%。
2. 盘点当前 Nginx vhost、系统服务、进程管理器、监听端口和日志占用，为“中方信数据”留存可回滚备份。
3. 将当前固定出口 IP 加入 SSH 22 白名单，或全程使用 Workbench/云助手；不要将 22 开放给 `0.0.0.0/0`。
4. 确定正式域名、DNS 和备案/合规路径，再申请 TLS 证书。
5. 创建生产 Supabase 项目，执行 `supabase/migrations/001` 至 `004`，完成备份和恢复验证。
6. 配置服务端密钥，并确保真实值只存在 `/etc/starsyun/starsyun.env`。
7. 用测试账号跑通注册/登录、询价、报价、接受报价、订单和支付 webhook 闭环。

## 构建发布包

构建发生在 CI 或可控开发机，不要在剩余空间紧张的 ECS 上安装 `node_modules` 和构建。

```bash
npm ci
npm run build:production
tar -czf starsyun-release.tgz dist dist-server package.json
```

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
```

Nginx 模板假设证书位于 `/etc/letsencrypt/live/starsyun.com/`。在 DNS 生效和证书存在前，不要启用 443 server block。

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
