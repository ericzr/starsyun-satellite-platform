# StarSyun 接入交接清单

本清单把“可以展示”与“已经可交易”严格分开。任何凭据都只写入腾讯云服务器的 `/etc/starsyun/starsyun.env` 或受控 CI Secret，不能发到聊天、Git、浏览器环境变量或 Supabase 表。

## 图层与公开数据

| 图源 | 当前代码状态 | 你需要提供/申请 | 启用前验收 | 页面状态 |
| --- | --- | --- | --- | --- |
| Carto | 已有图层入口，未配置 key 时自动回退 OpenFreeMap | 域名受限的 Carto API key；如使用自定义样式，提供 style URL | `starsyun.com`、`www`、测试域名白名单；暗亮样式、署名、429 回退 | 配置后可选 |
| OpenFreeMap | 已接入 | 无 | 连通性、署名和限流观察 | 已启用 |
| OpenStreetMap | 已接入 | 无 | 署名、请求量不超过公开服务合理使用范围 | 已启用 |
| NASA VIIRS | 已接入为预览叠层 | 无 | WMTS 日期、可见性、服务限流与署名 | 已启用，仅预览 |
| Sentinel-2 EOX | 已接入为预览叠层 | 可选自有瓦片模板 `VITE_SENTINEL2_TILES_URL` | 许可、可用缩放级别、影像日期说明 | 已启用，仅预览 |
| Esri World Imagery | 已接入为预览叠层 | 可选自有瓦片模板 `VITE_ESRI_IMAGERY_TILES_URL` | Esri 条款、署名、缓存范围 | 已启用，仅预览 |
| 天地图 | 页面入口已预留，缺 token 时禁用 | 域名白名单 token；确认矢量/影像图层类型 | token 不报错、合规审查、全国及海外视图表现 | 获批后启用 |
| AICGIS | 页面入口已预留，缺瓦片 URL 时禁用 | 获授权的 `{z}/{x}/{y}` 瓦片模板及 token 规则 | 许可、跨域、缩放级别、署名、过期与错误回退 | 获批后启用 |

`VITE_*` 只允许放公开且可域名限制的地图瓦片配置。若 AICGIS 或任何图源的 token 可兑换数据、下载原始影像或产生计费，必须改为服务端瓦片代理/签名服务，不能写入 `VITE_*`。

## 目录与供应商 API

| 优先级 | 接口 | 需要的商务/技术材料 | 先实现的能力 | 启用交易前门槛 |
| --- | --- | --- | --- | --- |
| P0 | geoBoundaries gbOpen | 无账号；确认数据版本与许可证 | ADM0-ADM3 导入、边界检索、面积/AOI | 执行 `007`、导入中国和目标国家、人工抽样边界 |
| P0 | Earth Search | 无账号 | Sentinel-2 STAC 搜索 | 只标为开放数据，不作为收费库存 |
| P0 | Copernicus Data Space | 组织账号、OAuth client、配额/下载政策 | STAC/OData 搜索、授权下载 | 记录条款、下载许可、配额和归属 |
| P1 | Sentinel Hub | 组织账号、OAuth client、套餐/处理配额 | Catalog、Process、Batch、统计分析 | 生产 client、账单上限、输出许可 |
| P1 | UP42 或 SkyWatch（二选一） | 企业合同、sandbox、生产 API、价格与区域授权 | 搜索、询价、订单状态、交付 | 用 sandbox 跑完报价、下单、取消、交付 |
| P2 | Planet | 合作合同、生产 API、price book、地区授权 | archive 搜索和订单 | 条款版本、价格冻结、webhook、对账 |
| P2 | Airbus OneAtlas | 企业 OAuth、合同、产品目录、区域授权 | 检索、询价、下单、交付 | 沙箱验收、幂等下单、授权审计 |
| P2 | ICEYE 或 Capella（二选一） | 企业合同、tasking/sandbox、SLA | SAR archive/tasking | 预付款、任务状态、取消和失败退款 |
| P2 | 吉林一号、中国四维 | 销售合作与正式接口文档 | 先人工询价导入，再接自动化 | 中国区域授权、价格表、交付与售后责任 |

完整厂商范围、官方入口和建议顺序见 [SUPPLIER_INTEGRATION.md](./SUPPLIER_INTEGRATION.md)。Google Earth、公开地图截图或浏览器瓦片不是可再销售卫星原始数据的合法供应商，不能作为交易或交付来源。

## 后端统一接入契约

每个供应商都必须实现以下能力，未实现的能力在 `data_sources.status` 保持 `planned`，页面不能显示“已接入”：

```ts
type ProviderAdapter = {
  search(input: SearchInput): Promise<NormalizedProduct[]>;
  quote(input: QuoteInput): Promise<QuoteResult>;
  createOrder(input: ProviderOrderInput): Promise<ProviderOrder>;
  getOrderStatus(externalOrderId: string): Promise<ProviderOrderStatus>;
  getDelivery(externalOrderId: string): Promise<DeliveryAsset[]>;
  cancelOrder?(externalOrderId: string): Promise<void>;
};
```

适配器必须保存：供应商原始响应摘要、标准化产品、请求 ID、幂等键、条款版本、价格版本、配额消耗、错误类别和重试次数。密钥统一使用供应商独立的服务端变量，例如 `COPERNICUS_CLIENT_ID`、`UP42_CLIENT_SECRET`、`PLANET_API_KEY`；变量只有在对应 adapter 实现后再加入运行时环境文件。

## 支付、身份与交付

| 业务项 | 首期路径 | 需要你开通/提供 | 代码启用条件 |
| --- | --- | --- | --- |
| 客户与供应商身份 | Supabase Auth + 后端角色模型 | 管理员、采购商、供应商的角色规则；邮件模板与回调域名 | 角色表和 RLS 审核后 |
| 国内支付 | 对公转账人工核销起步，再接支付宝 | 企业支付宝签约资料、异步通知地址、退款权限 | webhook 验签、幂等、对账、退款测试 |
| 国际支付 | 选择可服务目标市场的卡支付渠道，再接 PayPal | 商户主体、KYC、webhook secret、支持币种/国家 | 成功、失败、退款、拒付和对账测试 |
| 任务储值/预付款 | 多币种钱包冻结 | 财务确认储值、退款、税务与资金监管规则 | `wallet_transactions` 只追加账本、支付回调驱动入账 |
| 历史数据支付 | 冻结报价后支付 | 商品授权、价税规则、样片规则 | 付款成功后才签发交付 |
| 文件交付 | 腾讯 COS 私有桶 | Bucket、地域、最小权限子账号、生命周期规则 | COS 真实签名链接、撤销和下载审计验收 |

## 生产执行顺序

1. 在 Supabase SQL Editor 按顺序执行 `007_create_platform_foundation.sql`、`008_business_workflow_functions.sql` 和 `009_order_quote_items.sql`，再执行 `npm run check:supabase`。
2. 在服务器环境加载密钥后导入 `CHN`、`ARE`、`SGP`，通过 `/api/admin/areas` 抽查级联和边界，再分批导入全球数据。
3. 配置并验收 COS 私有交付，完成一次真实的“订单已交付 → 签名下载 → 撤销”演练。
4. 用 Earth Search/Copernicus 完成开放数据真实目录；演示产品继续明确标注为示例。
5. 选择一个商业聚合商完成 sandbox adapter，再决定 Planet/Airbus/SAR 直连次序；供应商询价先写入 `provider_quotes`，客户订单明细写入 `order_items` 后才允许下单。
6. 先上线对公转账核销，然后逐个开通支付宝和国际支付通道；每个通道都必须先通过 webhook、退款和对账验收。

目录 API：`GET /api/catalog/sources` 返回公开图源登记，`GET /api/catalog/products?provider=<id>&category=archive&limit=100` 返回已核验的标准化产品。它们不会返回凭据，也不会把“规划中”供应商或未核验库存展示给客户。

## 已落地的业务接口

- `GET/POST /api/analysis/jobs`：客户查询或创建分析作业；作业必须关联本人询价或已付款订单。
- `GET /api/wallet`：客户查询指定币种余额与账本；余额由服务端 RPC 从已记账交易推导。
- `POST /api/wallet/holds`：客户为本人待付款订单冻结余额，金额、币种和订单总额必须一致，并且必须使用幂等键。
- `GET/POST /api/admin/provider-quotes`、`PATCH /api/admin/provider-quotes/:id`：运营人员登记和回写供应商报价、条款和状态。
- `GET/POST /api/admin/provider-orders`、`PATCH /api/admin/provider-orders/:id`：运营人员创建并维护供应商订单的标准化状态；创建前订单必须已付款或进入履约。
- `GET /api/admin/analysis-jobs`、`PATCH /api/admin/analysis-jobs/:id`：Worker/运营人员推进分析作业状态和输出规格。
- `POST /api/admin/wallet-credit`：对公转账或其他已核验支付的人工入账；必须带供应商流水和幂等键。
- `POST /api/admin/wallet-operation`：管理员执行已核验的扣款、释放冻结或退款；操作只追加账本并且必须带幂等键。
- `GET/POST /api/admin/catalog-products`：运营导入或查看标准化产品；只有带来源、许可证和条款版本的产品才能标记为 `available`。

钱包冻结、支付事件幂等和订单状态推进由 `008_business_workflow_functions.sql` 中的 Supabase RPC 原子执行；`009_order_quote_items.sql` 为接受报价订单补充商品快照。执行 `007` 至 `009` 后再运行 `npm run check:supabase`。
