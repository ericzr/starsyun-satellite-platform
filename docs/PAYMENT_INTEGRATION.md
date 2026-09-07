# 支付接入与业务隔离

## 当前状态

- 2026-09-07 已在支付宝商家平台只读确认：企业账号的“电脑网站支付”为“已开通”。
- 签约已完成不等于 StarSyun 已可收款。当前服务端只实现 Stripe Payment Intent，尚无支付宝下单、验签回调、退款和对账 Adapter。
- 生产付款入口在完成全链路验收前不得把支付宝或 PayPal 显示为“已可用”。首期可继续使用对公转账加管理员人工核销。

## 支付宝：与其他业务隔离

不需要为 StarSyun 重新注册一个企业支付宝主体，前提是 StarSyun 和现有业务属于同一收款与税务主体。技术上应使用独立的 StarSyun 开放平台应用，不复用其他业务的 AppID 和回调处理器。

| 隔离项 | StarSyun 规则 |
| --- | --- |
| 应用 | 单独的 StarSyun AppID，在开放平台完成电脑网站支付开发设置 |
| 密钥 | 单独 RSA2 应用私钥和支付宝公钥/证书；只放在腾讯云服务端 |
| 异步通知 | `https://starsyun.com/api/webhooks/alipay`；必须验签、核对 AppID、商户订单号、金额和币种 |
| 同步返回 | 只用于页面导航，不以浏览器返回结果标记已支付 |
| 订单号 | 使用 StarSyun 独立命名空间，例如 `SSY-<order_no>` |
| 幂等 | 以支付宝通知 ID/交易号写入 `payment_events`，重复回调不重复入账 |
| 对账 | 按 AppID、`SSY-` 订单前缀、订单 ID 和商户主体对账 |
| 退款 | 服务端发起，保留原支付和退款流水，验证重复退款保护 |

建议的服务端变量是 `ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`、`ALIPAY_GATEWAY`和 `ALIPAY_NOTIFY_URL`。任何私钥、证书或可调用付款/退款的凭据都不得放入 `VITE_*`、GitHub 或聊天。

## PayPal：是否现在开通

`Payple` 是拼写错误，正式名称是 `PayPal`。面向全球用户时建议准备 PayPal Business，但它是 P2 而不是首发阻塞项：

- 国内与中国企业客户首期用支付宝和对公转账。
- 开始接受海外自助订单、USD/EUR 付款时再开通 PayPal Business。中国大陆商户的国际交易费率和提现费偏高，大额 B2B 订单仍应优先对公电汇。
- 同一 PayPal Business 账户下为 StarSyun 创建独立 REST App，单独保存 Client ID/Secret 和 webhook ID。PayPal webhook 与具体 App 关联，可与其他业务隔离。
- 实现 Orders API 时只在 `PAYMENT.CAPTURE.COMPLETED` 验签并核对金额/币种后交付，同时处理 pending、denied、refund 和 dispute。

## 实现顺序

1. 创建/确认独立 StarSyun 支付宝应用和 AppID，不改动其他业务应用。
2. 实现支付宝预下单、RSA2 验签、幂等 webhook、退款、对账与沙箱/小额生产验收。
3. 完成支付宝后，再申请 PayPal Business 并创建独立 StarSyun REST App。
4. 支付成功、金额不符、重复回调、退款、拒付、对账全部通过后，前端才显示对应渠道。

支付宝开发文档：<https://opendocs.alipay.com/open/270/01didh>

PayPal REST API：<https://developer.paypal.com/api/rest/>

PayPal webhook：<https://developer.paypal.com/api/rest/webhooks/>
