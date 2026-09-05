# 真实业务工作流

## 统一供应商适配器

所有供应商都实现同一服务端接口，前端不感知 Planet、Copernicus 或 SAR 厂家的字段差异：

```ts
interface SatelliteProvider {
  search(input: SearchInput): Promise<SearchPage>;
  getProduct(id: string): Promise<NormalizedProduct>;
  quote(input: QuoteInput): Promise<QuoteResult>;
  createOrder(input: OrderInput): Promise<ProviderOrder>;
  getOrderStatus(id: string): Promise<ProviderOrderStatus>;
  cancel?(id: string): Promise<void>;
  getDelivery(id: string): Promise<DeliveryAsset[]>;
}
```

适配器必须实现超时、重试、幂等键、原始响应留存、配额计数和条款版本。`data_sources` 记录是否已配置；`provider_products` 只有在授权、可用性和价格核验后才允许进入可购买目录。

## 历史存档数据

```text
真实目录检索 → 样片/元数据 → 客户确认 → 冻结报价 → 支付/对公收款
→ 供应商资产同步 → 质检 → COS 私有交付 → 短时下载链接 → 下载审计
```

历史数据可以在报价确认后直接购买。订单必须关联 `provider_product` 或供应商外部产品 ID，交付文件只能从私有 COS 签名下载，不能从供应商公开瓦片直接下载。

## 任务拍摄

```text
AOI + 时间窗口 + 分辨率 + 云量 + 传感器
→ 多供应商询价 → 规则/人工报价 → 预付款或余额冻结
→ 供应商下单 → 排程/采集 → 处理/质检 → 分阶段交付 → 结算/退款
```

`provider_quotes` 保存向供应商发出的任务/存档询价与有效期，`provider_orders` 保存外部订单和异步状态，`order_events` 记录每个状态变更。任务拍摄未完成预付款或余额冻结时不得创建供应商订单；供应商失败时只能进入 `failed` 并触发退款/人工处理，不得自动标记为已交付。

## 分析服务

统一为 `analysis_jobs`：

1. `validating`：检查 AOI、影像输入、坐标系、时间序列数量和授权。
2. `queued`：分配处理模板和 Worker。
3. `processing`：执行变化检测、分类、目标提取或时间序列模型。
4. `qa`：检查覆盖率、坐标系、空结果、统计和人工抽样。
5. `delivered`：输出 GeoTIFF/COG、GeoJSON、CSV、报告和处理日志到 COS。

每个服务类型都要有输入规格、处理级别、SLA、价格区间、失败重跑规则和交付格式。定制分析仍可以人工确认，但状态、验收、文件和计费必须走同一作业表。网关使用 `POST /api/analysis/jobs` 创建作业，管理员或 Worker 只能按 `queued → validating → processing → qa → delivered` 推进；失败只允许从 `failed` 重新排队，不能跳过质检。

## 用户、余额和支付

- `auth.users`：供应商、采购商和运营人员的身份来源；`user_roles` 支持一个用户同时拥有采购商和供应商身份，`supplier_profiles` 记录供应商审核状态。
- `wallet_accounts`：按币种建立余额账户；任务拍摄使用 `hold` 冻结余额。
- `wallet_transactions`：只追加不可修改，所有入账只能由已验证的支付 webhook、对公收款人工核销或退款事件产生。
- `payment_events`：保留每个支付 webhook 或人工核销事件的验签/审核结果；只有 `verified` 事件可以推进订单或钱包账本。
- `orders`：冻结报价、税费、币种和交付 SLA。
- `order_events`：审计用户、管理员、供应商和系统操作。

钱包冻结和订单状态推进在 `008_business_workflow_functions.sql` 中使用 Supabase RPC 原子执行：重复幂等键返回原交易，余额不足拒绝冻结，订单状态变化追加 `order_events`。Node 进程不会自行计算可用余额，也不会从浏览器接受支付成功状态。

支付接入顺序建议是：先对公转账人工核销和一个国际卡通道，再分别接入支付宝、PayPal/PAYPLE 等区域渠道。每个渠道都必须完成签名校验、幂等、退款、对账和风控后，才能把订单从 `pending_payment` 推进到 `paid`。浏览器永远不能直接修改余额或支付状态。
