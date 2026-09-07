# StarSyun 需要业务负责人推进的事项

本清单只包含需要开户、签约、财务授权或数据授权的外部动作。密钥、密码和私钥不要通过聊天发送；取得后写入腾讯云服务器的 `/etc/starsyun/starsyun.env`，再仅回复“已配置”。

## 本周优先级

1. **企业支付宝**：“电脑网站支付”已开通，StarSyun 独立应用已创建并在审核中，密钥、公钥、回调和生产网关已准备。现在只需等待审核；通过后将凭据写入腾讯云服务器，再完成小额支付、重复回调、退款和对账验收。接入时不修改其他业务应用，详见 [支付接入与业务隔离](./PAYMENT_INTEGRATION.md)。
2. **COS 真实交付验收**：向私有 `delivery` 桶/前缀上传一个非敏感测试压缩包，保留文件名、Object Key、实际字节数和 SHA-256。随后由管理员以测试订单完成“登记 → 标记交付 → 客户下载 → 撤销 → 审计”流程。子账号权限保持 `GetObject`、`HeadObject`、`PutObject`，不增加 `DeleteObject`。
3. **行政区包来源记录**：按你确认，该包来自国土资源部公开数据，无需另行购买授权。请补充公开数据页面或发布版本信息，以便导入批次记录 `source_url/source_version` 并完成追溯。
4. **首个商业供应商**：在 UP42 和 SkyWatch 中选择一个作为首个聚合入口，申请 sandbox、价格表、区域授权、下载/再分发许可、配额、SLA 与 webhook 文档。完成 sandbox 全链路前，页面只允许显示“询价”，不得显示可直接购买库存。

## 随后推进

- 注册 Copernicus Data Space 组织账号，准备 OAuth Client、配额和下载政策，用于开放数据的真实目录。
- 开始接受海外自助订单前申请 PayPal Business，并为 StarSyun 创建独立 REST App。首发阶段不是阻塞项。
- 为 Planet/Airbus、ICEYE 或 Capella、吉林一号、中国四维分别取得合同或正式接口文档；先人工询价入库，再接自动化下单。
- 确认 Carto、天地图、AICGIS 的域名白名单、使用条款和 token。可计费或可下载的 token 不放 `VITE_*`，由服务端代理。
- 选定 Supabase 与 COS 的备份保留期，安排一次备份恢复演练。完成后记录恢复时间目标和实际结果。
- 将 SSH 22 收敛到固定管理 IP，改为密钥认证并关闭密码登录；80/443 之外的应用端口不对公网开放。

## 已完成，不需要重复操作

- 腾讯云最近一次可核对的正式 release 为 `b51bea0`，`https://starsyun.com/healthz` 与 `/readyz` 返回正常。GitHub `main` 的后续更新尚待服务器终端登录后发布。
- Supabase 的 `001` 至 `010` 已通过 26 项只读结构检查。不要把旧迁移再次粘贴到生产 SQL Editor；新增 `011_normalize_paypal_provider.sql` 尚未执行，需先备份再单独运行一次。
- COS 交付登记会先校验对象存在和实际大小；相关代码已发布，但还没有真实业务对象的端到端验收。

运营人员可在腾讯云服务器使用 `sudo node --env-file=/etc/starsyun/starsyun.env /srv/starsyun/current/scripts/production-inventory.mjs` 查看仅含数量的生产业务基线；命令不会输出客户、订单、支付、对象 Key 或供应商响应内容。

完整技术顺序见 [正式上线主线任务](./PRODUCTION_LAUNCH_PLAN.md) 和 [供应商接入清单](./INTEGRATION_HANDOFF.md)。
