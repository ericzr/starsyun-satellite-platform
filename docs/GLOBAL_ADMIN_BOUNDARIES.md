# 全球行政区数据方案

StarSyun 的正式行政区目录采用 [geoBoundaries gbOpen](https://www.geoboundaries.org/) 作为第一来源，导入 ADM0、ADM1、ADM2、ADM3 到 Supabase `admin_areas`。它的版本、下载地址、许可和更新时间可追溯，适合商业平台；GADM 不作为生产交易目录来源，因为其许可不适合直接用于商业服务。

## 用户提供的 N159 SHP 包

2026-09-07 已对本地 N159 包进行只读审计。按业务负责人确认，该包为国土资源部提供的公开数据，不以供应商授权作为阻塞；导入批次仍需保留来源、版本和公开数据声明。它可以减少几何数据的手工建设，但不能原样导入生产：

| 层级 | 记录数 | 具有该层级的国家/地区代码数 |
| --- | ---: | ---: |
| ADM0 | 263 | 263 |
| ADM1 | 3,660 | 240 |
| ADM2 | 47,217 | 180 |
| ADM3 | 144,193 | 79 |

审计识别出以下阻塞项：

- 包内没有找到许可、数据来源 URL、卖方授权或允许商业再分发/对客服务的文件；已改为依据负责人公开数据声明记录，后续需补齐来源 URL 与版本证据。
- 字段和 `GID_*` 编码形式与旧版 GADM 导出高度一致。如果原始来源确为 GADM，必须先取得商业使用许可。
- “全球三级”实际只覆盖 79 个 ADM0 代码，不是全球 ADM3 完整覆盖。
- ADM0 中另有 `TWN`，并存在 `CHN`/`Z02`/`Z03`/`Z08` 多个 China 记录。导入时必须去重，并按 StarSyun 规则将台湾省纳入中国 ADM1。
- 台湾专项复核（2026-09-10）：全球包中的台湾源记录为 ADM1=7、ADM2=22、ADM3=0。也就是说，台湾县市级二级边界存在，但该包没有台湾三级边界；导入时只能将现有记录规范化到 `CHN → 台湾省 → ADM2`，三级选择器必须按数据可用性隐藏或置灰，不能用地理编码结果补造三级边界。
- 全球包的中国 ADM2 含有已撤销的“巢湖市”等旧记录，ADM1→ADM2 也有缺失父级的记录。
- 另附的 2023 中国包包含 34 个省级几何，含“台湾省”和代码 `710000`；按业务负责人声明作为国土资源部公开数据使用，并在导入报告中保留 `source=MNR-N159`、版本和来源声明。

复核命令：

```bash
npm run audit:admin-source -- \
  "/path/to/N159全球各国省级多级行政区划shp数据世界国家边界矢量中国省市县gis" \
  --owner-attested-public \
  --json=/tmp/starsyun-admin-source-audit.json
```

来源声明记录后，处理流程为：转换到 staging GeoJSON/GeoPackage → 根据稳定编码建立父子关系 → 台湾省和 China 别名规范化 → 旧区划/重复/空几何审计 → 样本国家人工验收 → 分批导入 Supabase。

### N159 中国包的已完成离线验收

仓库中的 `scripts/stage-n159-admin.py` 只做离线转换，不连接 Supabase；它会读取中国 2023 的国界、省级、地级和县级 ZIP，输出 NDJSON 与报告。脚本会把 pyshp 的几何转换为 WGS84 GeoJSON，校验稳定编码、中文名称、父子层级、bbox 和重复同级名称，并把直辖市/省直管县等没有地级父级的单位提升为 ADM2，避免把县级实体混进三级列表。

本地验收结果（2026-09-07）：ADM0=1、ADM1=34、ADM2=451、ADM3=2,725；父级缺失和重复同级名称均为 0；台湾省为 CHN 下的唯一对应 ADM1，未生成独立 TWN。产物写入被 `.gitignore` 忽略的 `.codex-tmp/`，不会进入 Git。

写库由 `scripts/import-n159-admin.mjs` 单独负责，默认只读校验；只有显式传入 `--apply` 才会调用 Supabase REST，并按 ADM0 → ADM3 顺序写入。它默认不会停用旧记录，`--deactivate-legacy` 是另一个需要明确确认的选项。生产写入后必须运行：

```bash
npm run import:admin:n159 -- \
  --input=.codex-tmp/n159-china.ndjson \
  --report=.codex-tmp/n159-china-report.json

SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY='<server-only-key>' \
npm run import:admin:n159 -- \
  --input=.codex-tmp/n159-china.ndjson \
  --report=.codex-tmp/n159-china-report.json \
  --apply

SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY='<server-only-key>' \
npm run check:admin-data -- --country=CHN --require-levels=0,1,2,3
```

导入前先在 Supabase 备份或临时项目运行同一命令；确认前端级联列表不再读取旧 CHN 行后，再单独评估是否使用 `--deactivate-legacy` 清理旧的活动记录。原始 ZIP 不提交到仓库，生产只保存压缩后的目录几何和来源元数据。

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

### 生产目录快照与已知阻塞（2026-09-06）

- geoBoundaries gbOpen ADM0 已导入 230 个国家/地区。
- 当前目录计数为：中国 ADM0-ADM3 共 5,283 条，阿联酋 ADM0-ADM1 共 8 条，新加坡 ADM0-ADM2 共 61 条。这是导入快照，不代表业务语义正确或全球三级覆盖完成。
- 复核确认：现有中国 ADM2 把旗、县等三级实体混入二级；二级到三级父子关系不可靠，且部分记录没有中文显示名。该批中国 ADM1-ADM3 必须以权威行政区划重建，不能继续作为生产级联选择或 AOI 交易依据。
- 非中国的 ADM3 当前没有全球覆盖；没有公开三级数据的国家应在产品中明确降级，不可用地理编码或猜测边界补齐。
- 中国台湾省作为 CHN ADM1 保留，不创建独立 TWN 国家记录。
- 个别国家没有公开 ADM2/ADM3，导入器会记录 404 并跳过；不会用地理编码结果伪造缺失层级。
- 大型边界使用简化 GeoJSON（每个行政区总点数上限）以控制 Supabase JSONB 写入和前端地图性能；原始来源 URL、版本和 bbox/质心仍被保存。

后续导入应按国家和层级分批执行，并在每批完成后运行 `npm run check:admin-data -- --country=<ISO3> --require-levels=<levels>`；不要一次性并发写入全部 ADM2/ADM3。该审计同时检查分页完整性、空几何、层级、中文展示名和中国抽样链路（内蒙古 → 鄂尔多斯市 → 达拉特旗），但不能替代国家级边界抽检和来源授权复核。

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

导入后先执行目录验收，检查数量、父子层级、空几何、重复兄弟名称，以及中国台湾省的归属。中国的完整三级目录必须显式要求 0 到 3 级：

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY='<server-only-key>' \
npm run check:admin-data -- --country=CHN --require-levels=0,1,2,3
```

## API

- `GET /api/admin/areas?level=0`：国家列表
- `GET /api/admin/areas?country=CHN&level=1`：一级行政区
- `GET /api/admin/areas?parent=<id>&level=2`：二级行政区
- `GET /api/admin/areas?parent=<id>&level=3&q=城区`：三级行政区搜索
- `GET /api/admin/areas/<id>`：单个行政区和边界 GeoJSON

接口只读、同源、使用服务端 Supabase 密钥，浏览器不会再直接访问 CountriesNow 或 Nominatim。页面应按接口返回的 `name_local[lang]`、`name_en` 回退显示；没有本地化名称时应明确显示英文，而不是把不同来源的中英文拼接成一个选项。

## 更新与回滚

目录使用稳定的区域 ID 进行 upsert，`source_version` 记录当前边界版本。升级前先在 Supabase 备份/临时项目中执行数量、空父级、抽样行政链路与随机边界抽样检查，再更新生产目录；需要回滚时，重新导入上一版通过验收的数据或从数据库备份恢复。正式上线后建议每季度更新一次，行政区变更频繁的国家按月更新。
