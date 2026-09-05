# 全球行政区数据方案

StarSyun 的正式行政区目录采用 [geoBoundaries gbOpen](https://www.geoboundaries.org/) 作为第一来源，导入 ADM0、ADM1、ADM2、ADM3 到 Supabase `admin_areas`。它的版本、下载地址、许可和更新时间可追溯，适合商业平台；GADM 不作为生产交易目录来源，因为其许可不适合直接用于商业服务。

## 数据模型

- `level=0`：国家/地区
- `level=1`：省、州、自治区、一级行政区
- `level=2`：市、县、州级行政区
- `level=3`：区、乡镇或数据源定义的三级行政区
- `parent_id`：导入器依据几何包含关系生成，无法可靠匹配时保持空值并记录警告
- `geometry`：WGS84 GeoJSON；`bbox`、`centroid_*` 用于列表和地图快速定位
- `name_local`：优先保存数据源提供的本地语言名称；中国 ADM0/ADM1 在导入时补齐中文规范名称（含“台湾省”），不再由浏览器临时翻译或拼接
- `source_license`、`source_url`：随导入批次保存数据源许可和来源链接，供合规复核和后续更新追溯

## 首次导入

在有 Supabase 服务端密钥的环境执行：

```bash
npm run check:release
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY='<server-only-key>' \
node scripts/import-geoboundaries.mjs --country=CHN
```

先执行中国和核心业务区域做验收，再分批导入全球：

```bash
node scripts/import-geoboundaries.mjs --country=ALL --levels=0,1
node scripts/import-geoboundaries.mjs --country=ALL --levels=2,3
```

ADM3 数据量和几何体很大，生产导入应在服务器后台运行并监控磁盘、Supabase 请求量。导入器保存数据源的原始 GeoJSON，按最多 100 条且不超过约 1.5 MB 的批次 upsert，并跳过没有公开 ADM3 数据的国家，不用地理编码结果“补齐”假数据。

导入后先执行目录验收，检查数量、父子层级、空几何、重复兄弟名称，以及中国台湾省的归属：

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY='<server-only-key>' \
npm run check:admin-data -- --country=CHN
```

## API

- `GET /api/admin/areas?level=0`：国家列表
- `GET /api/admin/areas?country=CHN&level=1`：一级行政区
- `GET /api/admin/areas?parent=<id>&level=2`：二级行政区
- `GET /api/admin/areas?parent=<id>&level=3&q=城区`：三级行政区搜索
- `GET /api/admin/areas/<id>`：单个行政区和边界 GeoJSON

接口只读、同源、使用服务端 Supabase 密钥，浏览器不会再直接访问 CountriesNow 或 Nominatim。页面应按接口返回的 `name_local[lang]`、`name_en` 回退显示；没有本地化名称时应明确显示英文，而不是把不同来源的中英文拼接成一个选项。

## 更新与回滚

目录使用稳定的区域 ID 进行 upsert，`source_version` 记录当前边界版本。升级前先在 Supabase 备份/临时项目中执行数量、重复名称、空父级和随机边界抽样检查，再更新生产目录；需要回滚时，重新导入上一版 geoBoundaries 发布数据或从数据库备份恢复。正式上线后建议每季度更新一次，行政区变更频繁的国家按月更新。
