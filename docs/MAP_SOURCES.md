# 图源接口与接入清单

页面只展示短名称，后端和 `data_sources` 保存完整接口、归属、许可和凭据状态。任何没有合同、Token 或明确许可的商业图源只能显示为“规划中”，不能伪装成已接入。

| ID | 页面名称 | 类型 | 当前状态 | 配置 | 备注 |
| --- | --- | --- | --- | --- | --- |
| `carto` | Carto | 底图 | 可选 | `VITE_CARTO_API_KEY` | 无 key 时回退 OpenFreeMap；key 需限制域名 |
| `openfreemap` | OpenFreeMap | 底图 | 已启用 | 无 | 黑白风格默认备选 |
| `osm` | OSM | 底图 | 已启用 | 无 | 保留现有免费瓦片并显示署名 |
| `nasa-viirs` | NASA | 影像 | 已启用 | 无 | NASA GIBS 近实时栅格，受服务限流 |
| `sentinel2-eox` | Sentinel-2 | 影像 | 已启用 | 无 | 预览用途，不等于可销售原始资产 |
| `esri-imagery` | Esri | 影像 | 已启用 | 无 | 使用条款和缓存边界需复核 |
| `aicgis` | AICGIS | 影像 | 规划中 | `VITE_AICGIS_TILES_URL` | 需确认瓦片授权和 Token |
| `tianditu` | 天地图 | 影像 | 规划中 | `VITE_TIANDITU_TOKEN` | Token、域名白名单和合规要求 |
| `earth-search` | Earth Search | STAC | 已启用 | 服务端 | 当前公开 Sentinel-2 搜索源 |
| `copernicus` | Copernicus | 数据供应商 | 规划中 | 服务端凭据 | 账号、配额、下载和授权条款 |
| `planetary-computer` | Planetary Computer | 数据供应商 | 规划中 | 服务端凭据 | STAC 和签名资产 |
| `planet` | Planet | 商业供应商 | 规划中 | 商务/API | 必须完成企业合同和区域授权 |
| `airbus-oneatlas` | Airbus | 商业供应商 | 规划中 | 商务/API | 不允许从公开页面猜测价格或库存 |
| `jilin-1` | 吉林一号 | 商业供应商 | 规划中 | 商务/API | 等待开放接口或销售合作 |
| `siwei` | 中国四维 | 商业供应商 | 规划中 | 商务/API | 等待开放接口或销售合作 |

## 凭据规则

- 浏览器只拿到公开的 Carto/瓦片配置；供应商、支付和下载密钥只存在 `/etc/starsyun/starsyun.env`。
- 每个图源必须登记官方文档、许可、署名、区域限制、请求限额和失败回退策略。
- 影像瓦片只用于地图预览。可销售的原始影像必须进入产品目录和交付授权流程，不得把瓦片 URL 当作交付文件。

## 地名显示层级

Carto 与 OpenFreeMap 使用矢量地名图层，前端按缩放级别分段显示：全球视图显示国家，区域视图显示省/州，放大后再显示城市、城镇和村落，避免国家与城市名称同时挤在一个层级。台湾不作为国家级标签显示，平台在省级层级显示“台湾省”（英文等语言随站点语言切换）。

OSM 选项当前使用官方 PNG 栅格瓦片，地名已经烧录在图片中，无法由 MapLibre 在客户端重新分级或隐藏；需要严格控制地名层级时应使用 Carto 或 OpenFreeMap 矢量底图。
