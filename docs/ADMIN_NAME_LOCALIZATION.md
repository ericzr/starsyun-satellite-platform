# 行政区多语言名称

边界几何和行政层级继续由已审核的边界数据源维护；名称翻译单独采用 [GeoNames](https://www.geonames.org/) 的 `alternateNamesV2` 作为国际化名称层。GeoNames 数据按 CC BY 4.0 发布，产品页面和文档需要保留归属信息。它只补充名称，不改变 `parent_id`、层级或几何。

## 名称优先级

前端按以下顺序解析 `admin_areas.name_local`：

1. 当前语言的标准键，例如 `fr`、`name:fr`、`ja`。
2. 中文模式使用 `zh-Hans`、`zh`、`name:zh`。
3. 国家级记录使用浏览器 ICU 的标准国家名称。
4. 如果当前语言暂时没有标准翻译，保留行政区记录，使用数据源的规范本地名称；名称补齐后由翻译层覆盖该显示值。

英文模式可以使用规范的 `name_en`，因为它就是英文界面所需的规范名称；其他语言不会显示占位文案，也不会删除行政区。缺失项由后台覆盖率审计报告记录，继续通过 GeoNames 和 OSM Nominatim 的多语言 `namedetails` 补齐后覆盖；行政区 ID、父子关系和真实边界保持不变。

## 生成翻译补丁

GeoNames 的名称包较大，不提交到 Git，也不放进前端 bundle。把以下文件放在服务器或受控导入机的临时目录。ADM1/ADM2 名称补丁只需要前三个文件；要补齐 geoBoundaries 与 GeoNames 层级不一致的市县，以及 ADM3/ADM4 名称时，追加下载 `allCountries.zip`：

```bash
mkdir -p .codex-tmp/geonames
curl -L https://download.geonames.org/export/dump/admin1CodesASCII.txt \
  -o .codex-tmp/geonames/admin1CodesASCII.txt
curl -L https://download.geonames.org/export/dump/admin2Codes.txt \
  -o .codex-tmp/geonames/admin2Codes.txt
curl -L https://download.geonames.org/export/dump/allCountries.zip \
  -o .codex-tmp/geonames/allCountries.zip
curl -L https://download.geonames.org/export/dump/alternateNamesV2.zip \
  -o .codex-tmp/geonames/alternateNamesV2.zip
```

先执行只读生成：

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY='<server-only-key>' \
npm run enrich:admin:names -- \
  --country=ALL \
  --admin1=.codex-tmp/geonames/admin1CodesASCII.txt \
  --admin2=.codex-tmp/geonames/admin2Codes.txt \
  --all-countries=.codex-tmp/geonames/allCountries.zip \
  --alternate=.codex-tmp/geonames/alternateNamesV2.zip
```

脚本会把 `zh-CN`、`zh-TW` 等 GeoNames 语言码归一化为 `zh`，并处理 ADM1、ADM2、ADM3/ADM4；当边界源和 GeoNames 的行政层级不一致时，会使用全量行政索引进行唯一名称匹配。`country_iso2` 缺失时使用仓库内的 ISO3→ISO2 映射，不会因此跳过国家。默认只读生成报告，写库时使用低并发和 429/5xx 重试：

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY='<server-only-key>' \
npm run enrich:admin:names -- \
  --country=ALL \
  --admin1=.codex-tmp/geonames/admin1CodesASCII.txt \
  --admin2=.codex-tmp/geonames/admin2Codes.txt \
  --alternate=.codex-tmp/geonames/alternateNamesV2.zip \
  --concurrency=4 --retries=5 --apply
```

如果包含 ADM3/ADM4 或层级不一致的名称，追加 `--all-countries=.codex-tmp/geonames/allCountries.zip`。执行后抽查报告中的 `matched_rows`、`patched_rows` 和 `unmatched_sample`，并用 API 验证美国、日本、法国和中国以外的至少三个国家在中文模式下返回 `nameLocal.zh`。

检查 `.codex-tmp/admin-geonames-name-report.json` 的匹配数和未匹配抽样。确认报告后才允许写库：

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SECRET_KEY='<server-only-key>' \
npm run enrich:admin:names -- \
  --country=ALL \
  --admin1=.codex-tmp/geonames/admin1CodesASCII.txt \
  --admin2=.codex-tmp/geonames/admin2Codes.txt \
  --all-countries=.codex-tmp/geonames/allCountries.zip \
  --alternate=.codex-tmp/geonames/alternateNamesV2.zip \
  --apply
```

导入器只更新 `name_local`，不会停用行政区，也不会修改边界和父子关系。GeoNames 的名称快照应按季度更新；数据量较大的批次在服务器后台运行，并保留生成的报告用于回滚审计。

## OSM 多语言名称补齐

GeoNames 仍没有覆盖的行政区，使用服务器端的 `scripts/enrich-nominatim-names.mjs` 调用 OSM Nominatim `namedetails`。它只补充现有行政区的多语言名称，不创建或删除行政区，也不修改边界。脚本默认每次请求之间等待 1 秒、带报告运行；必须设置明确的 User-Agent，并遵守 Nominatim 使用政策。建议先 dry-run，再用受控批次 `--apply` 写入 Supabase，报告保留未匹配项和来源 URL 供审计。
