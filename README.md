# StarSyun 星云数据平台

基于卫星遥感数据的商业化交易平台，提供全球卫星影像数据查询、购买和增值服务。

## 功能特性

- 🌍 **全球卫星数据检索** - 支持多种卫星数据源，覆盖光学、SAR、多光谱等数据类型
- 🗺️ **交互式地图选择** - 基于 MapLibre GL 的地图界面，支持矩形、多边形绘制
- 🔍 **高级筛选系统** - 多维度筛选（时间、分辨率、云量、处理级别等）
- 📊 **产品对比功能** - 支持多个产品并排对比分析
- 💼 **增值服务** - 提供变化检测、地物分类、目标提取等分析服务
- 🌓 **明暗主题** - 支持亮色/暗色主题切换
- 🌐 **多语言支持** - 中英文双语界面
- 🔌 **公开数据 Provider Gateway** - 可通过服务端 STAC 网关接入真实 Sentinel-2 数据，并为后续商业供应商适配器预留统一入口

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite 6
- **UI 组件**: Radix UI + Tailwind CSS 4
- **路由**: React Router 7
- **地图**: MapLibre GL
- **3D 可视化**: Three.js
- **动画**: Framer Motion
- **状态管理**: React Context
- **代码质量**: ESLint + Prettier + TypeScript Strict Mode

## 快速开始

### 前置要求

- Node.js >= 18
- npm/pnpm/yarn

### 安装依赖

```bash
npm install
# 或
pnpm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

### 生产构建

```bash
npm run build
```

构建产物位于 `dist/` 目录

### 预览生产构建

```bash
npm run preview
```

## 项目结构

```
src/
├── app/
│   ├── components/      # 可复用组件
│   │   ├── ui/         # 基础 UI 组件
│   │   ├── figma/      # Figma 导出组件
│   │   └── ...         # 业务组件
│   ├── pages/          # 页面组件
│   ├── context/        # React Context
│   ├── data/           # 静态数据和 mock 数据
│   ├── i18n/           # 国际化配置
│   ├── lib/            # 工具库
│   ├── constants/      # 常量定义
│   ├── types/          # TypeScript 类型
│   ├── utils/          # 工具函数
│   ├── hooks/          # 自定义 Hooks
│   └── App.tsx         # 应用入口
├── styles/             # 全局样式
└── main.tsx           # 主入口
```

## 开发指南

### 代码规范

项目使用 ESLint 和 Prettier 进行代码规范检查：

```bash
# 检查代码规范
npm run lint

# 自动修复
npm run lint:fix

# 格式化代码
npm run format

# 检查格式
npm run format:check

# 类型检查
npm run type-check
```

### 环境变量

复制 `.env.example` 为 `.env` 并配置相应的环境变量：

```bash
cp .env.example .env
```

主要环境变量：
- `VITE_API_BASE_URL` - API 服务地址
- `VITE_MAP_STYLE_URL` - 地图样式 URL
- `VITE_CARTO_API_KEY` - 可选的 Carto 公共地图 Key；在 Carto Dashboard 的 API Keys 中创建，并限制允许的域名
- `VITE_ENABLE_MOCK_DATA` - 是否使用 mock 数据

地图图层说明：地图右下角“切换图层”提供 Carto、OpenFreeMap、OpenStreetMap 三种底图，以及 NASA、Sentinel-2、Esri、AICGIS、天地图影像图层。AICGIS 通过 `VITE_AICGIS_TILES_URL` 配置瓦片模板；天地图通过 `VITE_TIANDITU_TOKEN` 配置官方 Token，未配置凭据时入口会自动置灰。未配置 `VITE_CARTO_API_KEY` 时，Carto 入口会自动使用 OpenFreeMap 作为免费回退，避免出现空白地图。Google Earth、吉林一号、四维高景等商业图源仅在取得授权并配置专用服务后接入。

可选影像瓦片地址：`VITE_SENTINEL2_TILES_URL`、`VITE_ESRI_IMAGERY_TILES_URL`。如服务商调整访问策略，可通过环境变量替换，避免修改前端代码。

### 添加新页面

1. 在 `src/app/pages/` 创建新页面组件
2. 在 `src/app/App.tsx` 中添加路由配置
3. 如需国际化，在 `src/app/i18n/` 添加翻译

### 添加新组件

1. 基础 UI 组件放在 `src/app/components/ui/`
2. 业务组件放在 `src/app/components/`
3. 使用 TypeScript 编写，确保类型完整

## 部署

### Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel
```

正式环境建议在 Vercel 配置 `VITE_STAC_GATEWAY_URL=/api/stac`，让真实数据检索经过服务端网关。详见 [Provider Gateway 文档](docs/PROVIDER_GATEWAY.md)。

服务器迁移、环境变量分层、数据库、支付和上线门禁请参阅 [正式部署准备清单](docs/DEPLOYMENT_READINESS.md)。

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 4173
CMD ["npm", "run", "preview"]
```

### Nginx

构建后将 `dist/` 目录部署到 Nginx，配置示例：

```nginx
server {
    listen 80;
    server_name starsyun.com;
    root /var/www/starsyun/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 缓存静态资源
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 性能优化

- ✅ 代码分割和懒加载
- ✅ 图片懒加载
- ✅ Three.js 场景优化（降低几何体复杂度）
- ✅ 地图瓦片缓存
- ✅ 防抖和节流优化
- ✅ 构建产物压缩

## 浏览器支持

- Chrome >= 90
- Firefox >= 88
- Safari >= 14
- Edge >= 90

## 许可证

Copyright © 2026 StarSyun. All rights reserved.

## 联系方式

- 网站: https://starsyun.com
- 邮箱: contact@starsyun.com
