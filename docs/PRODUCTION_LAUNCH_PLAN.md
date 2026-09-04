# StarSyun 正式上线主线任务

> 目标：在不牺牲中国用户访问体验的前提下，建立面向全球用户的可交易、可交付、可审计卫星数据平台。
>
> 本文是当前服务器上线后的单一任务清单。任务状态以代码仓库和线上探针为准，不以演示页面的假数据为准。

## 当前基线（已完成）

- 腾讯云新加坡 Node/Nginx 服务已运行，正式域名 HTTPS 可访问。
- Supabase Pro 新加坡项目已连接，生产迁移 `001` 至 `004` 已执行。
- 客户注册、登录、会话和管理员登录已走服务端网关。
- `/healthz` 返回 200，`/readyz` 已达到 ready；Stripe 尚未启用属于预期状态。
- 服务器运行时密钥只放在 `/etc/starsyun/starsyun.env`，没有提交到 Git。
- GitHub Pages 保留为静态演示；真实业务流量走腾讯云服务器。

## P0：真实交易上线前必须完成

### 1. 真实数据产品目录

- [ ] 把演示 `PRODUCTS` 与真实产品目录分开，页面必须标记“示例”或“可购买”。
- [ ] 建立统一产品字段：供应商、产品 ID、采集时间、几何范围、分辨率、云量、传感器、处理级别、授权、币种、价格模式和交付 SLA。
- [ ] 首批保持开放数据：Earth Search、Copernicus、NASA/USGS；供应商 API 失败时显示降级状态，不伪造库存。
- [ ] 为每个供应商增加配额、超时、重试、原始响应留存和服务条款记录。

### 2. 询价、报价、订单闭环

- [ ] 管理员可以从询价创建、发送、撤回和过期报价。
- [ ] 接受报价必须冻结金额、币种、税费、交付天数和条款版本。
- [ ] 订单状态严格经过 `pending_payment → paid → fulfillment → delivered`，取消和失败状态可审计。
- [ ] 所有写操作增加 request id、幂等键和操作者记录，避免重复报价、重复订单和重复支付。
- [ ] 先采用“报价后人工确认/对公转账”也可以上线；Stripe 仅在 webhook、退款和对账验收后开放。

### 3. 文件交付与存储分层

- [ ] 执行 `supabase/migrations/005_create_delivery_assets.sql` 与 `006_create_delivery_downloads.sql`，建立交付对象和下载审计元数据表。
- [ ] 腾讯 COS 建立 `preview`、`delivery`、`archive` 三个私有桶或等价前缀。
- [ ] Supabase 只保存文件元数据、COS Object Key、校验值、授权和下载审计，不保存卫星原始影像。
- [ ] 管理员交付文件后，客户详情页只显示短时签名下载 URL；Node 不中转大文件。
- [ ] 交付 URL 必须绑定用户、订单、文件版本和过期时间，支持撤销和重新签发。
- [ ] COS 配置版本控制、生命周期和跨区域备份；预览资源才允许 CDN 缓存。

当前代码已提供交付闭环的服务端接口：管理员可查询订单、登记或撤销交付文件并标记订单为已交付；客户只能在本人订单进入 `delivered` 后读取文件元数据，下载时由服务端签发短时 COS URL，并写入 `delivery_downloads` 审计记录。上线前仍需执行 006 迁移、配置私有 COS Bucket，并用真实对象完成一次下载/撤销验收。

### 4. 安全门禁

- [ ] 安全组只暴露 80/443；SSH 22 仅固定管理 IP，禁止 3000、5432、6379 公网访问。
- [ ] 关闭密码 SSH，使用密钥登录；定期轮换服务器密码、Supabase Secret Key、会话密钥和供应商凭据。
- [ ] `ALLOWED_ORIGINS` 只允许正式域名；生产禁止 `VITE_ENABLE_MOCK_DATA=true`。
- [ ] 管理员会话使用 HttpOnly、Secure、SameSite Cookie；所有管理接口继续服务端鉴权。
- [ ] 补充 CSP、HSTS、审计日志、异常告警和登录失败限流。

## P1：Beta 稳定性

### 性能与中国用户访问

- [ ] 前端静态资源、地球纹理和预览图放 COS/CDN，设置 immutable 长缓存。
- [ ] STAC、行政区和产品目录请求统一经过腾讯云 API，增加 5–15 分钟服务端缓存。
- [ ] 第一阶段使用新加坡源站和境外全球加速；完成 ICP 备案后再开启中国大陆 EdgeOne 节点。
- [ ] 用中国三网、东南亚、欧洲和北美各一个探针持续记录首字节时间、瓦片成功率和 API P95。
- [ ] 当前单机使用进程内缓存；出现多实例、共享限流或长任务后再购买 Redis 和独立 Worker。

### 可观测性与恢复

- [ ] 结构化记录 request id、路由、耗时、上游供应商、状态码和错误类别，禁止记录密钥和用户密码。
- [ ] 监控 `/healthz`、`/readyz`、Nginx 5xx、Node 重启、磁盘使用率、Supabase 错误率和 COS 失败率。
- [ ] 汇总 Node `http_request` 结构化日志中的 `requestId`、路由、状态码和耗时，禁止记录请求体、Cookie 和任何密钥。
- [ ] Supabase Pro 每日备份仅保留 7 天；另行执行逻辑备份到加密 COS，并每月恢复演练。
- [ ] 服务器发布保留最近两个可回滚 release，发布前执行 type-check、lint、build、smoke 和数据库迁移检查。

### 质量门禁

- [ ] E2E 覆盖登录、坐标定位、行政区级联、AOI 面积、图层切换、KML/KMZ、询价、报价和订单。
- [ ] 桌面/移动端验证中文、英文、阿拉伯语，暗亮主题和地图瓦片失败回退。
- [ ] 修复现有严格 lint 警告，逐步打开 TypeScript `strict`，移除生产路径上的 localStorage mock 依赖。

## P2：规模化业务

- [ ] 接入统一供应商 Adapter：`search / getProduct / quote / createOrder / status / cancel / delivery`。
- [ ] 首个商业聚合入口从 UP42、SkyWatch 或 Sentinel Hub 中选择一个，完成 sandbox 到生产切换。
- [ ] 再接入 Planet、Airbus；SAR 选择 ICEYE 或 Capella 作为首个适配器。
- [ ] 将长时间供应商任务、影像处理和大文件同步拆到 Worker/队列，不阻塞 Web 进程。
- [ ] 订单增加授权条款、税费、地区限制、最小起订面积、有效期和 SLA 版本。
- [ ] 根据真实负载再引入 Supabase Read Replica、Redis、第二台 API 节点和灾备区域。

## 目前主线推进顺序

```text
COS 存储与交付元数据
  → 管理员交付操作与签名下载
  → 真实目录与供应商 Adapter
  → 支付/对公收款与 webhook 对账
  → E2E、监控、备份恢复演练
  → ICP 备案后的中国大陆 CDN/EdgeOne
```

### 明确不做的事情

- 不在当前阶段拆成多个微服务。
- 不把海量卫星影像放进 Supabase 数据库或作为 Web 服务器本地文件。
- 不把供应商密钥、支付密钥或 Supabase Secret Key 放进 `VITE_*` 或 GitHub Pages。
- 不把演示价格、演示产品或公开 STAC 结果直接标记为可成交库存。
