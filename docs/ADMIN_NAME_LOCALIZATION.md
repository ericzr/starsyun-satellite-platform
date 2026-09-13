# 行政区多语言名称

边界几何和行政层级继续由已审核的边界数据源维护；名称翻译单独采用 [GeoNames](https://www.geonames.org/) 的 `alternateNamesV2` 作为国际化名称层。GeoNames 数据按 CC BY 4.0 发布，产品页面和文档需要保留归属信息。它只补充名称，不改变 `parent_id`、层级或几何。

## 名称优先级

前端按以下顺序解析 `admin_areas.name_local`：

1. 当前语言的标准键，例如 `fr`、`name:fr`、`ja`。
2. 中文模式使用 `zh-Hans`、`zh`、`name:zh`。
3. 国家级记录使用浏览器 ICU 的标准国家名称。
4. 数据源提供的 `local` 名称。
5. 只有数据源完全没有本地名称时，才使用必填的 `name_en` 作为数据完整性兜底。

因此，不会再因为切换语言而把一个行政区的中文名和英文名拼成混合选项；已有翻译也不会被 GeoNames 的普通别名覆盖。

## 生成翻译补丁

GeoNames 的名称包较大，不提交到 Git，也不放进前端 bundle。把以下文件放在服务器或受控导入机的临时目录：

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
