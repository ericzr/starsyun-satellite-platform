# Explore 筛选与区域输入设计记录

## 已确认的竞品事实

- SkyFi 任务拍摄把 Optical、SAR、Stereo 作为互斥的成像模式；它们描述的是“怎么拍”，不是交付处理级别。
- SkyFi 将 Resolution、Capture Attempts、AOI timezone 放在任务主流程，把 Advanced Options 和 Tasking Preferences 收起，避免首屏被低频约束占满。
- AOI 支持 Rectangle 和 Custom Shape。真正的订单应保留原始 Polygon，而不能只保存外接矩形。
- 任务日期按 AOI 时区解释，并在确认拍摄机会前再次展示时区。

以上结论来自 2026-09-18 SkyFi/Planet 调研记录和本轮 SkyFi 公开任务页观察；页面、价格和可用传感器会随登录状态及供应商变化。

## StarSyun 当前决策

### 产品类型

产品类型仍是单选：历史存档、任务拍摄、分析服务。选择类型后只展示该类型真正适用的条件。

### 数据类型

产品模型的 `dataType` 是单值，因此筛选也改为单选，点击已选项可清除。任务拍摄只显示 Optical / SAR 两种已接入的成像方式；Stereo 等能力应在供应商能力矩阵接入后作为任务模式增加，不提前伪造可用能力。

历史存档和分析目录暂保留 Optical、Multispectral、Hyperspectral、SAR、Night-light、DEM、Video，但它们属于不同的观测/数据产品维度。后续接入真实目录后，应拆成“观测方式”和“产品类型”两个字段，而不是让用户同时勾选互斥值。

### 处理级别

历史存档和分析产品可按 L1/L2/L3/L4 单选。任务拍摄不显示处理级别：任务的输出级别、格式、正射/大气校正等属于报价与交付规格，由供应商能力和订单确认决定。

### 任务日期

任务起始和结束日期的最小值是所选 AOI 时区的当天；更换时区会把已过期日期归一到新时区当天。服务端仍会重新计算 UTC 半开区间，并处理夏令时和不存在的民用日期。

### 区域入口

行政区与矢量上传统一为“区域”入口：常用的行政区选择是主按钮，矢量上传变成右侧图标次级动作。这样二者仍是并列能力，但不会误导用户以为它们是筛选条件一级分类。

## 后续供应商接入要求

供应商适配器需要声明：`acquisitionMode`、`dataProductType`、`processingLevels`、`supportsTasking`、`taskingTimeZones`、`supportsPolygonAoi`。筛选 UI 只能渲染当前产品类型和供应商能力矩阵的交集。
