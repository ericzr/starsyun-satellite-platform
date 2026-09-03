# StarSyun 正式部署准备清单

## 当前架构

- 前端：Vite + React，静态产物部署到 GitHub Pages 或 Vercel。
- 地图：MapLibre，Carto / OpenFreeMap / OSM 底图，NASA、Sentinel-2、Esri 等公开影像图层。
- 数据查询：前端可直连 Earth Search；生产环境建议统一走 `/api/stac` 网关。
- 服务端：同一组 API 处理器可运行在 Vercel Functions，也可通过 `server/index.ts` 运行在自有 Node/Nginx 服务器，负责 STAC 查询、询价、报价、订单、认证和 Stripe webhook。
- 持久化：Supabase migrations `001` 至 `004`，保存询价、报价、订单和支付意图。

## 上线前必须完成

1. **环境变量分层**
   - 服务端仅配置服务端密钥：`SUPABASE_SECRET_KEY`、`AUTH_SESSION_SECRET`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`。
   - 前端只配置公开地址和公开地图凭据：`VITE_STAC_GATEWAY_URL`、`VITE_INQUIRY_API_URL`、地图样式和瓦片地址。
   - 生产环境禁止设置 `VITE_ENABLE_MOCK_DATA=true`，并确认管理员密码哈希已替换示例值。

2. **数据库迁移与权限**
   - 在生产 Supabase 项目按顺序执行 `001` 至 `005` 迁移；`005` 仅保存 COS 交付对象元数据，不保存影像二进制。
   - 检查 RLS、索引、唯一约束和订单状态流转；备份策略至少按日执行。
   - 管理员接口必须验证 HttpOnly 会话，不能使用前端 localStorage 作为权限依据。

3. **真实业务闭环**
   - STAC 查询接入监控、超时和供应商配额；失败时返回可识别的降级状态。
   - 询价、报价、接受报价、订单和支付 webhook 做幂等处理，并记录 request id。
   - 正式接入商业卫星供应商前，完成授权范围、价格表、交付 SLA 和数据合规审核。

4. **安全与运维**
   - `ALLOWED_ORIGINS` 只填写正式域名，禁止生产使用 `*`。
   - 将进程内限流和缓存迁移到 Redis/KV；补充错误日志、指标、告警和审计日志。
   - 配置 HTTPS、自定义域名、CSP、HSTS、备份恢复演练和密钥轮换流程。

5. **质量门禁**
   - CI 必须执行 `npm ci`、`npm run type-check`、`npm run lint:strict`、`npm run build`。
   - 为登录、行政区选择、坐标定位、询价提交、报价接受和支付 webhook 增加 E2E 测试。
   - 发布前在桌面和移动端验证地图拖拽、缩放、图层切换、KML/KMZ 上传和语言切换。

## 当前已知技术债

- 产品目录仍包含演示数据；真实供应商适配器需要统一产品协议和权限校验。
- 非中文语言目前复用英文文案，需要补齐正式翻译并做术语审核。
- 服务端缺少集中式日志、指标、告警和后台操作审计。
- GitHub Pages 不支持 `/api/*`，只能作为静态演示；正式业务应部署到 Vercel 或自有 Node/Nginx 网关。
- `src/app/context/UserContext.tsx` 在开发模式允许 mock 登录，生产发布前必须验证该分支不可达。

## 推荐迁移顺序

1. 清理并备份 ECS，确认不覆盖现有站点；按 [ECS 迁移手册](./ECS_DEPLOYMENT.md) 建立独立用户、目录、systemd 服务和 Nginx vhost。
2. 创建生产 Supabase 项目和自定义域名。
3. 执行数据库迁移，配置服务端密钥和 CORS 白名单。
4. 部署 API 网关并用测试账号跑完整询价到订单链路。
5. 接入 Stripe 测试 webhook，完成幂等和失败重试验证。
6. 将 Earth Search、Sentinel-2 等公开源纳入监控，再逐个接入商业供应商。
7. 通过 CI 门禁后切换 DNS，保留 GitHub Pages 作为只读演示和回滚入口。
