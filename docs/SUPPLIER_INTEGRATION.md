# 全球卫星数据供应商接入矩阵

本清单用于供应商 Adapter 的排期和合规验收。`planned` 只代表已登记，不代表 StarSyun 已取得销售、下载或区域分发授权。任何供应商只有在合同、价格表、配额、服务条款和 sandbox 验收完成后，才能把 `data_sources.status` 切换为 `configured` 或 `enabled`。

## 开放目录与公共数据

| 供应商/目录 | 类型 | 官方接口 | StarSyun 用途 | 当前门槛 |
| --- | --- | --- | --- | --- |
| Earth Search / Element84 | STAC、Sentinel-2 | `https://earth-search.aws.element84.com/v1` | 开放检索、样片和元数据 | 不作为收费库存；遵守 AWS/数据源许可 |
| Microsoft Planetary Computer | STAC、开放数据 | `https://planetarycomputer.microsoft.com/api/stac/v1` | 开放目录、签名资产 | 需要 token 的资产必须服务端签名；核对每个 collection 许可 |
| Copernicus Data Space | Sentinel-1/2/3、STAC/OData | `https://catalogue.dataspace.copernicus.eu/` | 开放数据检索和授权下载 | 注册 OAuth、限额、下载政策和归属 |
| NASA Earthdata / CMR | MODIS、Landsat、VIIRS 等 | `https://cmr.earthdata.nasa.gov/search` | 公共目录、近实时图层 | Earthdata 账号、速率限制、产品许可 |
| USGS EROS / M2M | Landsat、商业档案目录 | `https://m2m.cr.usgs.gov/` | 公共/授权目录 | M2M 账号、配额与下载授权 |
| Sentinel Hub | Catalog、Process、Batch | `https://services.sentinel-hub.com/` | 处理型产品、统计和批量输出 | 商业套餐、OAuth、处理配额和输出许可 |

## 商业光学与 SAR

| 供应商 | 主要能力 | 官方入口 | Adapter 优先级 | 必须取得 |
| --- | --- | --- | --- | --- |
| UP42 | 多供应商目录、报价、任务和交付 | `https://docs.up42.com/` | P1 聚合入口 | 企业合同、sandbox、价格/地区授权 |
| SkyWatch | EarthCache、档案和任务 | `https://skywatch.com/developers/` | P1 聚合入口 | API、订单取消、交付 SLA |
| Planet | PlanetScope、SkySat、任务 | `https://docs.planet.com/` | P2 | 合同、price book、区域授权、webhook |
| Airbus OneAtlas | Pléiades、SPOT、OneAtlas | `https://api.oneatlas.airbus.com/` | P2 | OAuth、商业合同、授权和交付政策 |
| Maxar / Vantor | WorldView、高分辨率档案/任务 | `https://developers.maxar.com/` | P2 | 企业 API、价格、出口/地区限制 |
| ICEYE | SAR 档案和任务 | `https://www.iceye.com/` | P2 | tasking 合同、SLA、预付款和区域限制 |
| Capella Space | SAR 档案和任务 | `https://www.capellaspace.com/` | P2 | API/合同、任务取消和交付规则 |
| Umbra | 高分 SAR | `https://umbra.space/` | P3 | 商业许可和 API 合同 |
| BlackSky | 高重访光学和分析 | `https://www.blacksky.com/` | P3 | 企业数据协议和区域授权 |
| Satellogic | 中分辨率高重访 | `https://satellogic.com/` | P3 | 企业 API、价格和再分发许可 |

## 中国及区域供应商

| 供应商 | 主要能力 | 接入方式 | 当前状态 |
| --- | --- | --- | --- |
| 长光卫星 / 吉林一号 | 光学档案和任务 | 先销售合作/人工询价，再按正式接口实现 Adapter | `planned` |
| 中国四维 | 高分、资源、测绘数据 | 商务合作和授权目录；不能抓取公开页面当库存 | `planned` |
| 天地图 | 地图瓦片/地理服务 | 官方 token 和域名白名单；仅作地图图层 | `planned` |
| AICGIS | 地图/影像瓦片 | 获授权瓦片模板或服务端代理 | `planned` |
| 高分专项及地方遥感平台 | 区域数据 | 逐项目确认发布、销售和跨境规则 | `planned` |

## 统一 Adapter 契约

```ts
type ProviderAdapter = {
  id: string;
  search(input: SearchInput): Promise<NormalizedProduct[]>;
  getProduct?(externalId: string): Promise<NormalizedProduct>;
  quote(input: QuoteInput): Promise<ProviderQuoteResult>;
  createOrder(input: ProviderOrderInput): Promise<ProviderOrderResult>;
  getOrderStatus(externalOrderId: string): Promise<ProviderOrderStatus>;
  cancelOrder?(externalOrderId: string): Promise<void>;
  getDelivery(externalOrderId: string): Promise<DeliveryAsset[]>;
};
```

每次调用必须带 request id 和幂等键，设置连接/读取超时、有限重试和供应商配额；保存脱敏的原始响应摘要、条款版本、价格版本和错误类别。Adapter 失败时写入 `provider_quotes.last_error` 或 `provider_orders.last_error`，不能伪造报价、库存或交付状态。

## 统一标准化字段

`provider_products` 必须包含供应商、外部产品 ID、档案/任务/分析类别、采集时间、GeoJSON 几何、bbox、传感器/分辨率/云量元数据、可用性、价格模式、币种、授权许可、条款版本和来源链接。只有授权、价格和交付条件验收通过的记录才能标记 `availability=available`，客户目录接口也只返回这些记录。

## 供应商启用顺序

1. Earth Search + Copernicus：完成开放目录与真实资产读取，不做收费库存。
2. UP42 或 SkyWatch：选一个聚合平台跑通 sandbox 的搜索、询价、下单、取消和交付。
3. Planet 或 Airbus：完成第一个商业光学 Adapter。
4. ICEYE 或 Capella：完成第一个 SAR Adapter，联动预付款冻结和失败退款。
5. 吉林一号、中国四维及其他区域供应商：按正式商务授权逐家接入。

未满足上一阶段的验收条件，不推进下一家供应商；所有长任务最终由 Worker/队列执行，Web 进程只负责接受请求、返回状态和审计结果。
