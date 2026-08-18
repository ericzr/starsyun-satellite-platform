# 全球卫星数据供应商与接入路线

> 初版供应商地图，面向 StarSyun 的真实询价与数据交付 MVP。
> “开放合作”不等于免费使用：多数商业卫星运营商需要销售合同、区域授权、最小采购额或企业 API 凭证。

## 1. 先建立供应商分层

| 层级 | 角色 | 典型接入方式 | 适合 StarSyun 的用途 |
| --- | --- | --- | --- |
| 开放数据源 | 公共机构、开放数据计划 | STAC、OData、REST、S3、下载链接 | 做目录、地图检索、低成本数据产品 |
| 商业运营商 | 拥有卫星和数据版权的厂家 | Partner API、OAuth/API Key、任务拍摄 API、订单 webhook | 真实商业影像、任务拍摄、企业交付 |
| 聚合平台 | 统一代理多个数据厂家 | 一个 REST API、统一搜索/下单、平台账单 | 快速覆盖多家供应商，降低首期集成成本 |

## 2. 第一批建议接入的开放数据源

| 供应商/平台 | 数据范围 | 官方入口 | 接入方式 | 合作门槛 |
| --- | --- | --- | --- | --- |
| Copernicus Data Space Ecosystem | Sentinel-1/2/3/5P 等 | [APIs](https://documentation.dataspace.copernicus.eu/APIs.html) | OData、STAC、S3、openEO；账号与配额管理 | 可注册，需遵守数据政策与限流 |
| NASA Earthdata / CMR | NASA 地球科学数据及多个任务数据集 | [CMR API](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html) | REST 元数据检索、Earthdata Login、资产下载 | 可注册；部分数据和下载有使用限制 |
| USGS EROS | Landsat、部分地学档案 | [EarthExplorer](https://earthexplorer.usgs.gov/) | EarthExplorer / M2M JSON API、批量下载 | 需要账号、配额和使用政策确认 |
| AWS / Element84 Earth Search | Sentinel、Landsat 等公开集合 | [Earth Search STAC](https://earth-search.aws.element84.com/v1) | STAC 查询、S3/HTTP 资产 | 公开数据；需控制请求量和云成本 |
| Microsoft Planetary Computer | 多个公开遥感数据集合 | [STAC 文档](https://planetarycomputer.microsoft.com/docs/quickstarts/reading-stac/) | STAC API、签名资产 URL | 公开数据；需遵守服务条款 |
| JAXA G-Portal | 日本及合作任务数据 | [G-Portal](https://gportal.jaxa.jp/gpr/?lang=en) | 门户检索和下载；具体 API 需逐项确认 | 数据集和服务政策不完全统一 |

这组数据源适合先做真实目录和地图检索，但不能替代商业供应商的最新高分辨率影像、任务拍摄和交付 SLA。

## 3. 商业卫星运营商清单

| 运营商 | 主要能力 | 对接形态 | StarSyun 处理方式 |
| --- | --- | --- | --- |
| Planet | PlanetScope、SkySat、历史影像、订阅、任务拍摄 | [Developer APIs](https://docs.planet.com/)；Data、Orders、Subscriptions、Tasking 等 API；API Key/OAuth | 第一优先级商业光学供应商，先做 archive/search/order |
| Airbus OneAtlas | Pléiades Neo、SPOT、TerraSAR-X 等产品与底图 | [OneAtlas API](https://api.oneatlas.airbus.com/)；OAuth、数据检索、订单/交付 | 适合高分辨率光学和企业项目，需签约和授权 |
| Vantor（原 Maxar Geospatial 体系） | WorldView、GeoEye 等高分辨率数据 | [Vantor](https://www.vantor.com/)；企业平台/API 合作 | 作为高价值项目供应商，先走商务合作，不做无合同直连 |
| ICEYE | SAR 历史数据、任务拍摄、灾害与形变场景 | 企业 API/partner integration、异步任务与交付 | 第二阶段接入 SAR，重点做 tasking 和灾害项目 |
| Capella Space | 高分辨率 SAR、archive/tasking | [Capella](https://www.capellaspace.com/)；企业 API/合作接入 | 与 ICEYE 二选一做首个 SAR 适配器 |
| BlackSky | 高时效光学、持续监测、Spectra 平台 | 企业/伙伴 API、项目制接入 | 适合高时效监测，不作为首个通用目录源 |
| Umbra | 高分辨率 SAR、任务拍摄及部分开放数据 | 企业合作、任务 API、文件交付 | 客户有明确 SAR 需求后接入 |
| Satellogic | 高频重访光学、任务拍摄 | 企业合作和区域授权 | 作为补充光学供应商，按区域和项目谈合作 |
| GHGSat | 甲烷等温室气体排放监测 | 企业数据/API 合作 | 作为行业专题数据，不与通用影像混为一个产品类型 |
| Spire | 气象、海事、航空和射频数据 | 企业 API/订阅 | 作为非影像空间数据扩展，后置 |

商业运营商通常不会提供完全开放的匿名 API。实际流程一般是：商务资格审查 → 合同/授权 → 创建组织和 API 凭证 → 配额与价格表 → 沙箱/生产环境。

## 4. 聚合平台：首期最值得接入

| 平台 | 价值 | 接入方式 | 建议 |
| --- | --- | --- | --- |
| Sentinel Hub | 统一访问 Sentinel、部分商业/自有数据；Process、Catalog、Batch、Statistical API | [API 文档](https://docs.sentinel-hub.com/api/latest/)；OAuth、JSON 请求、异步 Batch | 开放数据和影像处理的第一选择 |
| UP42 | 汇聚多家影像、DEM、分析和处理工作流 | [API 文档](https://docs.up42.com/)；项目、数据块、工作流、订单 API | 商业数据快速覆盖的第一候选 |
| SkyWatch EarthCache | 影像搜索、报价、订单和交付 | [API 文档](https://docs.skywatch.com/)；REST、异步订单、交付通知 | 适合先验证“搜索→报价→下单”闭环 |

聚合平台的优点是上线快，缺点是价格、区域授权、数据条款和交付能力受平台约束。关键客户稳定后，再把高频供应商改为直连以提升毛利和可控性。

## 5. StarSyun 统一供应商适配器

前端不应该直接对接任何供应商。后端建立统一适配器接口：

```ts
interface SatelliteProvider {
  search(input: SearchInput): Promise<SearchPage>;
  getProduct(id: string): Promise<NormalizedProduct>;
  quote(input: QuoteInput): Promise<QuoteResult>;
  createOrder(input: OrderInput): Promise<ProviderOrder>;
  getOrderStatus(orderId: string): Promise<ProviderOrderStatus>;
  cancelOrder?(orderId: string): Promise<void>;
  getDelivery(orderId: string): Promise<DeliveryAsset[]>;
}
```

内部统一产品模型应至少保留：

- `provider`、`providerItemId`、`collection`
- `geometry`、`captureTime`、`cloudCover`、`resolution`
- `sensor`、`dataType`、`processingLevel`
- `availability`、`priceMode`、`license`
- `assets`、`deliveryTime`、`sourceTerms`

供应商差异通过 adapter 处理，不能把 Planet、Sentinel、SAR 任务拍摄的字段直接塞进前端 `Product` 类型。

## 6. 推荐接入顺序

### 阶段 A：真实目录与搜索

1. Copernicus Data Space
2. Earth Search / Planetary Computer
3. Sentinel Hub

目标：让地图搜索、时间/分辨率/云量筛选使用真实 STAC 产品，而不是 `PRODUCTS` mock。

### 阶段 B：商业询价 MVP

1. UP42 或 SkyWatch（二选一作为聚合入口）
2. Planet 直连
3. Airbus OneAtlas 直连

目标：真实产品可用性 → 规则报价或供应商报价 → 询价单 → 销售后台跟进。

### 阶段 C：SAR 与任务拍摄

1. ICEYE 或 Capella（二选一）
2. Vantor / BlackSky / Umbra 按客户需求接入

目标：把 archive、tasking、analysis 分成不同订单状态机，不共享一套简单的“立即购买”逻辑。

## 7. 必须提前设计的工程规则

- 所有供应商密钥只存后端密钥管理系统，不能进入 `VITE_*` 前端变量。
- 搜索、报价、下单、交付都要有超时、重试、幂等键和审计日志。
- 供应商异步任务必须通过 webhook 或轮询 worker 更新状态。
- 订单金额、税费、币种和交付条款以后端结果为准，前端只展示。
- 供应商数据要保存原始响应和标准化结果，方便追责与重新处理。
- 每个供应商要有 sandbox、合同状态、区域授权、配额和 SLA 字段。

## 8. 当前结论

StarSyun 不应该一次性签接十几家厂家。最小可行路线是：

```text
Copernicus/STAC
  -> Sentinel Hub 或 UP42/SkyWatch
  -> Planet + Airbus
  -> 销售报价与人工确认
  -> 支付/采购
  -> 对象存储签名交付
```

这条路线可以先验证真实客户需求和收入，再决定是否投入 ICEYE、Capella、Vantor、BlackSky 等更重的供应商直连。
