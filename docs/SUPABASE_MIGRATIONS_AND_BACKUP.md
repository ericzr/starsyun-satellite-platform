# Supabase 迁移与备份

## 本轮新增文件

迁移文件位于仓库的 `supabase/migrations/`：

- `014_analysis_workbench.sql`：工作区、步骤、模型运行、质检、成果物和报告元数据；
- `015_analysis_input_assets.sql`：自有影像上传登记、对象路径、大小、哈希和状态。

这些 SQL 文件不会因为 Git 发布或服务器重启自动执行。执行前必须先完成生产数据库备份，并确认可以找到备份文件。

## 控制台执行方式

1. 登录 Supabase Dashboard，打开 StarSyun 项目。
2. 进入 `SQL Editor`，新建查询。
3. 先执行下面的只读检查，确认旧迁移没有处于半完成状态：

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('analysis_jobs', 'analysis_workspaces', 'analysis_input_assets')
order by table_name;
```

4. 把 `014_analysis_workbench.sql` 的完整内容粘贴执行；执行成功后再把 `015_analysis_input_assets.sql` 的完整内容粘贴执行。不要把两个文件截断或重排。
5. 执行确认：

```sql
select to_regclass('public.analysis_workspaces') as analysis_workspaces,
       to_regclass('public.analysis_job_steps') as analysis_job_steps,
       to_regclass('public.analysis_model_runs') as analysis_model_runs,
       to_regclass('public.analysis_quality_checks') as analysis_quality_checks,
       to_regclass('public.analysis_artifacts') as analysis_artifacts,
       to_regclass('public.analysis_reports') as analysis_reports,
       to_regclass('public.analysis_input_assets') as analysis_input_assets;
```

结果中的每一列都应为对应的 `public.*` 表名。迁移具有幂等保护，可以安全重试失败的 `create table/index` 语句；如果是中途报错，先保留错误信息，不要自行删除表或列。

## 备份方式

优先使用 Supabase 项目设置中的数据库备份/恢复能力（菜单名称会随计划和控制台版本变化）。确认备份时间、项目和区域正确后，再执行迁移。

需要独立本地备份时，在 Supabase `Project Settings → Database` 复制连接信息，使用一次性密码提示执行，不要把连接串、数据库密码、Secret key 发到聊天或提交 Git：

```bash
umask 077
mkdir -p "$HOME/starsyun-backups"
pg_dump \
  --format=custom \
  --no-owner \
  --file="$HOME/starsyun-backups/starsyun-$(date +%Y%m%d-%H%M%S).dump" \
  'postgresql://postgres:<PASSWORD>@<HOST>:5432/postgres?sslmode=require'
```

完成后至少检查文件存在且非空：

```bash
ls -lh "$HOME/starsyun-backups"
pg_restore --list "$HOME"/starsyun-backups/*.dump | head
```

备份文件应放在加密磁盘或受控密码库，不能放入仓库、GitHub、公开 COS 桶或 `/srv/starsyun/current`。恢复演练要在单独的 Supabase 项目或本地 PostgreSQL 中进行，不能直接覆盖生产。

## 迁移后应用检查

迁移完成后，在服务器上运行发布预检；它只检查文件和环境变量，不会替代数据库迁移：

```bash
cd /srv/starsyun/current
npm run check:release -- --runtime-env=/etc/starsyun/starsyun.env
curl -fsS https://starsyun.com/healthz
curl -fsS https://starsyun.com/readyz
```

随后使用测试账号创建一个自有影像分析任务，上传一个小型 GeoTIFF 或 GeoJSON，确认任务的上传状态从 `pending` 变为 `ready`。真实生产分析仍需独立 Worker 和人工/自动质检通过后才会进入交付。

