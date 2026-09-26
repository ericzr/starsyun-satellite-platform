# 供应商目录与同步

当前实现提供一条服务端同步边界：

- `earth-search`、`copernicus` 和 `planetary-computer` Adapter 已实现 `health` 和 `catalog`。它们读取各自的真实 STAC 结果，写入 `provider_products`，产品默认保持 `availability=unknown`，不会自动变成可销售库存。
- 商业供应商目前没有启用 Adapter。没有企业合同、价格、区域授权、配额和交付验收时，`data_sources.status` 必须保持 `planned` 或 `paused`。
- `POST /api/admin/provider-sync` 由管理员会话或服务器专用 `x-provider-sync-token` 调用；每次运行写入 `provider_sync_runs`，记录状态、数量、摘要和错误。
- `GET /api/admin/provider-sync` 返回 Adapter 能力和最近 100 次运行，只有管理员会话可读。
- 健康检查和公开目录同步使用独立的 systemd timer：健康检查每 5 分钟，公开目录每日一次。

## 服务器配置

在 `/etc/starsyun/starsyun.env` 增加随机长令牌：

```text
PROVIDER_SYNC_TOKEN=<server-only-random-token>
PUBLIC_CATALOG_SYNC_BBOX=-180,-85,180,85
PROVIDER_SYNC_PROVIDER=earth-search
PROVIDER_SYNC_MODE=health
```

`PROVIDER_SYNC_TOKEN` 不提交 Git，不放前端变量。全世界目录同步建议按国家或业务区域分批传入 `bbox`，避免一次请求过大；公开目录每日同步一次即可，健康检查每 5 分钟。商业价格和库存应按供应商限额设为 15～60 分钟，任务拍摄报价始终实时获取。

## systemd

迁移 `deploy/systemd/starsyun-provider-sync.service` 和 `.timer` 后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now starsyun-provider-sync.timer
systemctl list-timers starsyun-provider-sync.timer
sudo journalctl -u starsyun-provider-sync.service -n 50 --no-pager
```

公开目录每日同步还需要安装 `starsyun-provider-catalog.service` 和 `.timer`。当前服务器每次执行一个配置的公开源；新增源前先在服务器逐个手动运行并观察数量与错误。

```bash
sudo systemctl enable --now starsyun-provider-catalog.timer
systemctl list-timers 'starsyun-provider-*'
sudo journalctl -u starsyun-provider-catalog.service -n 50 --no-pager
```


首次启用前，先执行 Supabase 的 `013_provider_sync_runs.sql`，再用健康检查确认上游可达。

## 商业 Adapter 启用门槛

每家商业供应商都要实现检索、询价、下单、状态、取消和交付能力中适用的部分，并保存请求 ID、幂等键、条款/价格版本、配额消耗和脱敏响应摘要。生产启用顺序建议为：UP42 或 SkyWatch 聚合入口 → Planet 或 Airbus 光学 → ICEYE 或 Capella SAR → 吉林一号/中国四维。
