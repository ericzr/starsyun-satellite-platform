# StarSyun 架构梳理与上线路线图

## 第一性原理下的业务闭环

StarSyun 不是“一个有地图的卫星网站”，而是将客户的空间需求转换为可交付数据产品的交易与交付系统。最小真实闭环只有六步：

1. 用户提交 AOI、时间、分辨率、云量和使用场景。
2. 系统检索真实档案或创建任务需求。
3. 平台对供应商产品、授权、覆盖率、价格和 SLA 进行归一化。
4. 客户确认报价并完成支付或企业合同确认。
5. 系统跟踪采购、处理、质检和交付状态。
6. 客户通过受控链接下载产品，平台留存完整授权和审计记录。

所有架构决策都应服务于这个闭环，而不是先拆微服务或堆叠地图图层。

## 当前真实程度

| 能力 | 当前状态 | 上线判定 |
| --- | --- | --- |
| 前端与地图 | 完整可演示，支持 AOI、行政区、KML/KMZ、图层和多语言 | 可用于 beta，需补 E2E 与移动端验收 |
| 公开卫星检索 | Earth Search / Sentinel-2 为真实 STAC 数据 | 可上线，需服务端监控、缓存和配额保护 |
| 产品目录 | 仍以演示产品和静态价格为主 | 不可当作真实库存、授权或成交价 |
| 全球行政区 | 依赖 CountriesNow + Nominatim 公共 API | beta 可用，正式服务需缓存/自建边界数据库并处理合规口径 |
| 认证 | 客户侧已对接 Supabase Auth，管理员为启动密码方案 | beta 需配置真实项目；正式运营应迁移到独立管理员身份/企业 SSO |
| 询价/报价/订单 | API 和数据表已有基础链路 | 需执行迁移、幂等、状态机和审计验收 |
| 支付 | Stripe PaymentIntent/webhook 服务端骨架已有，前端收银台未完成 | 不可收款；先决定 Stripe 或国内支付/对公转账路径 |
| 交付 | 尚无真实文件、质检、签名下载和交付记录 | 不可规模化运营 |

## 推荐架构：模块化单体，不立即拆微服务

当前团队和业务量更适合一个可清晰分层、可单机部署的模块化单体：

```text
Web UI
  -> API/BFF
      -> Identity module
      -> Catalog/Search module
      -> Inquiry/Quote/Order module
      -> Provider adapters
      -> Delivery module
      -> Admin/Audit module
          -> PostgreSQL/Supabase
          -> Redis (cache, rate limit, short jobs)
          -> OSS (deliverables, previews, exports)
          -> Queue/worker (long provider and processing jobs)
```

等到供应商任务、处理作业或交付工作量要求独立扩容，再将 worker/provider 模块拆出。Web 请求进程不承载长时间下载、影像处理或大文件传输。

## 必须优化的技术边界

### P0：迁移与业务上线前

- 处理 ECS 94.91% 磁盘使用率，对现有站点快照和备份。
- 为 StarSyun 创建独立 Linux 用户、端口、systemd 服务、Nginx vhost 和日志路径。
- 配置正式域名、TLS、Supabase、密钥、CORS 与备份。
- 将演示产品标记为示例，不将其伪装为可成交库存。
- 完成客户认证、询价和管理员处理的真实 beta 链路。
- 建立发布工件、健康检查、原子切换和回滚机制。

### P1：beta 稳定性

- 为登录、行政区、坐标、AOI、STAC、询价和管理员流程添加 E2E 测试。
- 将限流和缓存从进程内迁移到 Redis，引入 request id、结构化日志和错误告警。
- 将 MapLibre 运行时脚本、字体和关键静态资源改为自托管，降低 unpkg/Google Fonts 不可用的风险。
- 将全球行政区数据从前端直连公共 API 迁到服务端缓存或可版本化数据集。
- 清理严格 lint 的现有警告，将 TypeScript `strict` 逐步开启。
- 继续拆分首包；当前主包约 733 kB，HeroGlobe 约 537 kB（未 gzip）。

### P2：真实交易与交付

- 为供应商定义统一 Adapter 协议：检索、定价、下单、任务、交付、取消、webhook。
- 建立授权条款、币种、税费、最小起订面积、有效期和 SLA 的版本化价格模型。
- 选定支付通道，完成签名 webhook、幂等、对账、退款和异常订单处理。
- 将交付文件存入 OSS，使用短时签名 URL，记录下载人、订单、版本、时间和授权。

## 本轮已完成的迁移准备

- 增加可自托管的 Node API + SPA 运行入口。
- 增加 `/healthz` 与 `/readyz`。
- 增加 systemd、Nginx、Docker 和运行时环境变量模板。
- 增加 ECS 发布工件 GitHub Actions，不再要求 ECS 安装构建依赖。
- GitHub Pages 和 ECS 使用独立 base path 构建，避免路由/资源地址串环境。
- 将 React Router 升级到已修复安全公告的版本，并升级 Vite/间接开发依赖；`npm audit` 当前为 0 漏洞。

## 需要业务侧确定的四项决策

1. StarSyun 正式域名及其 DNS/备案安排。
2. 这台 ECS 上“中方信数据”的业务归属、可停机窗口与备份责任人。
3. 是否已有生产 Supabase，以及数据库区域和备份策略。
4. 首个 beta 采用在线支付、对公转账还是“确认报价后人工收款”。
