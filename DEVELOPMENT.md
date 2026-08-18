# 开发文档

## 架构概览

### 目录结构说明

```
src/app/
├── components/         # 组件库
│   ├── ui/            # 基础 UI 组件（Button, Input 等）
│   ├── figma/         # Figma 导出的特定组件
│   ├── FilterPanel.tsx
│   ├── ResultCard.tsx
│   ├── HeroGlobe.tsx  # 3D 地球组件
│   └── ...
├── pages/             # 页面组件
│   ├── Home.tsx       # 首页
│   ├── Explore.tsx    # 数据浏览页
│   ├── ProductDetail.tsx
│   ├── Compare.tsx    # 产品对比
│   └── Login.tsx
├── context/           # 全局状态管理
│   ├── UserContext.tsx
│   └── CompareContext.tsx
├── data/              # 数据模型和 Mock 数据
│   ├── products.ts
│   ├── satellites.ts
│   └── solutions.ts
├── i18n/              # 国际化
│   ├── index.ts
│   ├── zh.ts
│   └── en.ts
├── lib/               # 业务工具库
│   ├── geo.ts         # 地理计算
│   ├── pricing.ts     # 价格计算
│   └── labels.ts      # 标签工具
├── constants/         # 常量定义
├── types/             # TypeScript 类型
├── utils/             # 通用工具函数
├── hooks/             # 自定义 Hooks
└── App.tsx            # 应用根组件
```

## 核心概念

### 1. 产品数据模型

```typescript
interface Product {
  id: string;
  satelliteName: string;
  productCode: string;
  dataType: DataType;
  category: ProductCategory;
  processingLevel: ProcessingLevel;
  resolution: number;
  captureTime: string;
  cloudCover: number;
  area: number;
  priceType: PriceType;
  unitPrice?: number;
  // ...
}
```

**产品分类 (ProductCategory)**:
- `archive` - 历史存档数据
- `tasking` - 任务拍摄（定制）
- `analysis` - 分析服务

**处理级别 (ProcessingLevel)**:
- `L1` - 原始数据
- `L2` - 标准处理
- `L3` - 正射校正
- `L4` - 分析就绪

### 2. 筛选系统

筛选器状态保存在 `Explore` 页面，通过 `FilterPanel` 组件展示。

**筛选维度**:
- 数据类型（光学、SAR、多光谱等）
- 产品类型（存档、任务、分析）
- 处理级别
- 时间范围（快捷选择、自定义范围、特定日期）
- 分辨率（快捷选择、精确范围）
- 云量

### 3. 地图交互

使用 MapLibre GL 实现：

```typescript
// 绘制矩形
map.on('draw.create', (e) => {
  const bbox = turf.bbox(e.features[0]);
  // 更新 AOI
});
```

支持的绘制模式：
- 矩形
- 多边形
- 点

### 4. 3D 地球组件

`HeroGlobe.tsx` 使用 Three.js 实现：

**性能优化要点**:
- 球体几何体：80×80 分段
- 纹理分辨率：2048×1024
- 星空粒子：300 个
- 卫星模型：简化版（约 15 个网格对象）

### 5. 国际化

使用自定义 i18n 系统：

```typescript
// 使用
const { t, lang } = useI18n();
<h1>{t.home.heroTitle}</h1>

// 添加翻译
// i18n/zh.ts
export const zh = {
  home: {
    heroTitle: '全球卫星数据，一张地图即可查询',
  },
};
```

## 常见开发任务

### 添加新的筛选条件

1. 更新 `FilterPanel.tsx` 中的 `Filters` 接口
2. 在 `DEFAULT_FILTERS` 中添加默认值
3. 在 UI 中添加筛选组件
4. 在 `Explore.tsx` 的 `useMemo` 中实现筛选逻辑

### 添加新的产品字段

1. 更新 `data/products.ts` 中的 `Product` 接口
2. 在 `makeProduct` 函数中生成该字段
3. 在 `ResultCard.tsx` 中显示该字段
4. 如需筛选，在 `FilterPanel` 中添加

### 添加新页面

1. 在 `pages/` 创建组件
2. 在 `App.tsx` 添加路由：

```typescript
<Route path="/new-page" element={<NewPage />} />
```

### 接入真实 API

替换 `data/products.ts` 中的 mock 数据：

```typescript
// utils/api.ts
export async function fetchProducts(filters: ProductFilters) {
  const response = await fetch(
    `${API_BASE_URL}/products?${buildQueryString(filters)}`
  );
  return response.json();
}

// Explore.tsx
const { data, loading } = useAsync(() => fetchProducts(filters));
```

## 样式指南

### Tailwind CSS 使用规范

- 使用语义化的 Tailwind 类名
- 复杂样式提取为组件
- 使用 `cn()` 工具合并类名

```typescript
import { cn } from './ui/utils';

<div className={cn(
  'base-classes',
  active && 'active-classes',
  className
)} />
```

### 主题变量

主题定义在 `src/styles/theme.css`：

```css
:root {
  --background: #ffffff;
  --foreground: #0a0a0b;
  --primary: #0a0a0b;
  /* ... */
}

.dark {
  --background: #000000;
  --foreground: #f2f2f2;
  /* ... */
}
```

## 性能优化建议

### 1. 代码分割

使用 React.lazy 进行路由级别的代码分割：

```typescript
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
```

### 2. 图片优化

- 使用 WebP 格式
- 实现懒加载
- 使用 `ImageWithFallback` 组件

### 3. 地图性能

- 限制同时显示的产品标记数量
- 使用聚合显示大量点
- 实现虚拟滚动

### 4. Three.js 优化

- 降低几何体复杂度
- 减少材质和纹理数量
- 使用对象池复用几何体

## 测试

### 单元测试

```bash
npm run test
```

### E2E 测试

使用 Playwright（待配置）：

```bash
npm run test:e2e
```

## 故障排查

### 常见问题

**问题：地图不显示**
- 检查 MapLibre GL CSS 是否正确加载
- 检查地图容器是否有高度
- 查看浏览器控制台错误

**问题：3D 地球卡顿**
- 降低几何体分段数
- 减少星空粒子数量
- 检查纹理分辨率

**问题：构建失败**
- 清除缓存：`rm -rf node_modules dist && npm install`
- 检查 TypeScript 错误：`npm run type-check`
- 检查 ESLint 错误：`npm run lint`

## 贡献指南

1. Fork 项目
2. 创建特性分支：`git checkout -b feature/new-feature`
3. 提交更改：`git commit -m 'Add new feature'`
4. 推送到分支：`git push origin feature/new-feature`
5. 提交 Pull Request

## 代码审查清单

- [ ] 代码符合 ESLint 规范
- [ ] 通过 TypeScript 类型检查
- [ ] 添加了必要的注释
- [ ] 更新了相关文档
- [ ] 测试通过
- [ ] 无 console.log 残留
- [ ] 性能影响可接受
