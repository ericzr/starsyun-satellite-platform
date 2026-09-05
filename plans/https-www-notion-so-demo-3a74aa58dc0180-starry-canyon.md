# starsyun — Demo 设计与实现方案

## Context

用户在 Notion 中撰写了一份完整的《卫星遥感数据交易平台 Demo 产品需求文档》，希望做一个"足够酷而且好用"的卫星遥感数据搜索、采购与分析平台 Demo，用于向卫星厂商、客户、投资方演示，验证客户是否愿意在线提交采购需求。

PRD 覆盖 12 个前台页面 + 后台，范围过大。经与用户确认，本版聚焦**核心业务闭环**，把地图数据中心打磨成真正的亮点，跑通 PRD 第十九节的"迪拜港口变化监测"演示脚本。

### 已确认的关键决策
- **范围**：核心闭环 = 首页 → 地图数据中心 → 产品详情 → 询价表单 → 提交成功 → 简易后台询价列表。
- **语言**：中英双语，右上角一键切换，默认中文。
- **地图**：真实交互地图 MapLibre GL（免费瓦片），支持真实缩放/拖拽/矩形绘制/定位。
- **视觉**：纯黑极客风，SpaceX 式冷峻工程感（近黑底、等宽字体点缀、坐标网格、细描边、克制高亮），支持深/浅色一键切换，默认深色。

### 项目底座（已探明）
- React 18 + Tailwind v4 + shadcn/ui（Radix），组件齐全（Button/Input/Select/Slider/Dialog/Tabs/Table/Badge/Card 等）。
- 已装：`motion`、`recharts`、`react-router` v7、`sonner`、`lucide-react`(需确认)、`date-fns`。
- **未装**：`maplibre-gl`（需 `pnpm add maplibre-gl`）。
- 入口 `src/app/App.tsx` 目前为空。主题令牌在 `src/styles/theme.css`，字体在 `src/styles/fonts.css`。

---

## 视觉与主题系统（SpaceX 极客风）

在 `src/styles/theme.css` 中重定义令牌（深色为默认，`.light` 为浅色），并全局用 CSS 变量，不散落 hex：

- **深色**：背景 `#000000` / 面板 `#0A0A0B` / 描边 `rgba(255,255,255,0.08)`；前景近白 `#EDEDED`；高亮青蓝 `#3B82F6`→更冷的 `#5EE6FF`/`#4D9EFF` 单一强调色，其余保持灰阶。
- **浅色**：白底 `#FFFFFF` / 面板 `#FAFAFA` / 近黑文字，同一强调色。
- **字体**：标题/UI 用无衬线（Inter），数据/坐标/参数用等宽（如 `Geist Mono` 或 `JetBrains Mono`）——在 `src/styles/fonts.css` 顶部 `@import`。等宽字体是极客感的关键。
- **氛围元素**：全站背景细坐标网格（CSS grid lines，低透明度）、hairline 描边、大量留白、字母间距略宽的全大写小标签（如 `LAT / LON / RES / CLOUD`）。克制动画（`motion` 仅用于面板滑入、数字滚动）。
- 主题切换：`ThemeProvider`（用已装的 `next-themes` 或自建 context，切换 `<html class="dark|light">`），右上角切换按钮。

---

## 信息架构与路由

用 `react-router` v7（已装），`src/app/App.tsx` 挂载 `<RouterProvider>` 或 `<BrowserRouter>`。页面组件放 `src/app/pages/`，可复用组件放 `src/app/components/`。

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 首页 Home | 全球地图 hero + 搜索框 + 产品分类/热门卫星/流程/需求提交 |
| `/explore` | 地图数据中心 | **核心页**，三栏：筛选 / 地图 / 结果列表 |
| `/product/:id` | 产品详情 | 参数、地图预览、价格模块、购买方式、CTA |
| `/inquiry` | 询价表单 | 三类询价单，携带上下文（区域/产品/面积/估价） |
| `/inquiry/success` | 提交成功 | 询价单编号 + 后续说明 |
| `/admin` | 简易后台 | 询价列表 + 状态流转 + 仪表盘小卡片 |

顶部统一 `AppHeader`（Logo「starsyun」、导航、语言切换、主题切换）。

---

## 数据与状态（纯前端 mock）

- `src/app/data/satellites.ts`：PRD 第 9.2 的卫星（吉林一号、高景一号、SuperView Neo、WorldView-3、Pleiades Neo、PlanetScope、Sentinel-1/2、Landsat 9、ICEYE、Capella 等），含厂商、国家、类型、最佳分辨率、重访周期。
- `src/app/data/products.ts`：生成 100+ 条模拟产品，字段对齐 PRD 9.3（product_code / satellite_name / data_type / capture_time / resolution / cloud_cover / coverage_rate / area / price_type / unit_price / delivery_time / license_type / thumbnail / geometry 覆盖框 bbox）。围绕 PRD 9.1 示例区域（迪拜、上海、深圳、利雅得、新加坡等）生成覆盖框。
- `src/app/data/analysis.ts`、`solutions.ts`：分析服务与行业方案卡片数据（用于首页与详情页交叉引用，即便本版不建独立页）。
- `src/app/i18n/`：`zh.ts` / `en.ts` 文案字典 + `useT()` hook。所有 UI 文案走字典。
- **全局状态**：轻量 React Context —
  - `AppStateContext`：语言、主题。
  - `SearchContext`（explore 页内）：当前绘制区域 geometry、面积、筛选条件、结果列表、对比篮（最多 3）。
  - `InquiryContext`：跨页携带询价上下文到 `/inquiry`。
  - 询价单提交后写入 `localStorage`，`/admin` 读取展示（模拟"后台收到线索"）。

### 价格估算工具
`src/app/lib/pricing.ts`：实现 PRD 第十节公式 `预计价格 = max(面积, 起订面积) × 单价 + 处理费`，按分辨率档位取单价区间。`src/app/lib/geo.ts`：bbox 面积计算（球面近似）、目标区域与影像框相交面积、覆盖率百分比。

---

## 核心页面实现要点

### 地图数据中心 `/explore`（重中之重）
- **MapLibre GL** 底图用免费 demotiles 或 CARTO dark-matter/positron 风格（深色底图契合极客风）；深浅主题切换时同步切换地图 style。
- 三栏布局：左 320px 筛选栏（数据类型/时间/分辨率/云量/厂商/来源/价格区间，用 shadcn Select+Slider+Checkbox）；中间地图；右 380px 结果列表（可收起抽屉）。
- **矩形绘制**：用 MapLibre 原生事件自行实现拖拽画 bbox（避免额外重依赖 mapbox-gl-draw 的授权问题）；绘制后计算面积并显示，作为搜索输入。
- 结果影像覆盖框以半透明矩形叠加地图（GeoJSON source + fill layer），悬停高亮、点击定位。
- 结果卡片含缩略图（Unsplash 卫星/城市影像）、参数、覆盖率、价格/「需询价」、操作（详情/加入对比/立即询价）。
- 对比抽屉：最多 3 个产品并排，含推荐标签（性价比最高/分辨率最高/最新）。
- 顶部搜索框：地点搜索（对示例区域做本地关键词匹配定位 + 经纬度直接解析），支持迪拜「Jebel Ali Port」定位。

### 首页 `/`
- Hero：全屏 MapLibre 全球地图（深色）+ 居中搜索框 + 主副标题（PRD 5.1.2 文案）+「搜索卫星数据」「提交拍摄需求」。叠加坐标网格与轨道线氛围。
- 向下：产品分类六卡 / 热门卫星 / 行业方案 / 平台优势 / 采购流程（5 步条）/ 需求提交表单。

### 产品详情 `/product/:id`
- 左：参数区（PRD 5.3.2 全字段，等宽数字）+ 价格模块（基础单价、起订面积、所选面积、处理费、预计总价、价格状态说明）。
- 右：地图预览（影像框 + 目标区 + 重合区，透明度滑块、前后对比滑块可选）。
- 购买方式 tabs（原始/标准处理/专题分析）；CTA：获取报价 / 提交采购申请 / 加入对比。

### 询价 `/inquiry` + 成功页
- 表单（react-hook-form，注意版本 7.55.0）：姓名/电话/邮箱/公司/目标区域/数据用途/期望日期/期望分辨率/需求说明；带入上下文摘要卡。
- 提交 → 生成询价单编号 → 写 localStorage → 跳成功页（编号 + 后续说明 + 返回）。

### 后台 `/admin`
- 顶部小仪表盘卡（今日询价数、本月预计金额、热门区域/卫星——可基于 localStorage + mock 汇总）。
- 询价单 Table：编号/客户/公司/区域/产品/参考价/状态/时间；状态可下拉流转（已提交→待确认→报价处理中→已报价→客户确认，PRD 5.7.3 前五态）；行详情抽屉。

---

## 需要新增/修改的关键文件

- 修改：`src/app/App.tsx`（路由 + Providers）、`src/styles/theme.css`（黑色主题令牌 + light 覆盖）、`src/styles/fonts.css`（等宽字体 import）。
- 新增：`src/app/pages/{Home,Explore,ProductDetail,Inquiry,InquirySuccess,Admin}.tsx`
- 新增：`src/app/components/{AppHeader,ThemeToggle,LangToggle,MapCanvas,FilterPanel,ResultCard,CompareDrawer,CoordGrid,SectionHeader}.tsx`
- 新增：`src/app/context/{AppStateContext,SearchContext,InquiryContext}.tsx`
- 新增：`src/app/data/{satellites,products,analysis,solutions}.ts`、`src/app/lib/{pricing,geo}.ts`、`src/app/i18n/{zh,en,index}.ts`
- 依赖：`pnpm add maplibre-gl`（确认 `lucide-react`、`next-themes` 已在 package.json，缺则补装）。
- 图片：产品缩略图/首页素材用 Unsplash（satellite / aerial / city from above），通过 `ImageWithFallback` 渲染，ES module 方式引入。

---

## 实现顺序（建议）

1. 主题系统 + 字体 + `ThemeProvider` + i18n 骨架 + `AppHeader`（先立住极客调性）。
2. 装 MapLibre，做 `MapCanvas` 通用组件（底图 + 网格叠加 + 主题联动）。
3. 首页（含 hero 地图）。
4. 地图数据中心：筛选 + 绘制 + 结果 + 覆盖框 + 对比。
5. 产品详情 + 价格/地理工具函数。
6. 询价表单 + 成功页 + localStorage。
7. 后台询价列表 + 小仪表盘。
8. 迪拜演示脚本走查 + 双语/主题全量校对 + 动效收尾。

---

## 验证方式

无独立测试，通过运行 Dev 预览按 PRD 第十九节演示脚本端到端走查：

1. 首页搜索「Jebel Ali Port」→ 地图定位迪拜杰贝阿里港。
2. 进入地图数据中心，绘制矩形 → 显示目标面积。
3. 设置时间近一年、分辨率 <1m → 出现吉林一号/Pleiades Neo/WorldView 等模拟产品，地图显示覆盖框与覆盖率。
4. 对比 2–3 个产品 → 查看推荐标签。
5. 打开一景详情 → 查看参数、覆盖预览、系统估价。
6. 提交询价（填公司/联系人）→ 生成编号 → 成功页。
7. 打开 `/admin` → 看到刚提交的新线索，切换状态。
8. 右上角切换中英双语 + 深/浅色，确认全站文案与主题一致、地图底图同步切换、无布局错乱。
