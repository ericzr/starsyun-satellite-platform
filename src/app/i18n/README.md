# 多语言国际化 (i18n) 系统

## 📋 当前支持的语言

### ✅ 已完成翻译
- **简体中文 (zh)** - 默认语言
- **English (en)** - 英语
- **العربية (ar)** - 阿拉伯语 (支持 RTL)
- **Español (es)** - 西班牙语

### 🚧 待翻译（当前使用英语回退）
- **Français (fr)** - 法语
- **Português (pt)** - 葡萄牙语
- **Русский (ru)** - 俄语
- **日本語 (ja)** - 日语
- **한국어 (ko)** - 韩语
- **Deutsch (de)** - 德语

---

## 🌍 添加新语言

### 步骤 1: 创建语言包文件

在 `src/app/i18n/` 目录下创建新的语言文件，例如 `fr.ts`：

```typescript
export const fr = {
  brand: 'starsyun',
  brandCn: 'Plateforme de Données Satellitaires',
  nav: {
    home: 'Accueil',
    explore: 'Centre de Données',
    solutions: 'Solutions',
    admin: 'Tableau de Bord',
    inquiry: 'Mes Demandes',
  },
  common: {
    search: 'Rechercher',
    searchData: 'Rechercher des Données Satellites',
    // ... 其他翻译
  },
  // ... 复制 zh.ts 或 en.ts 的完整结构
};
```

**重要**: 确保语言包的结构与 `zh.ts` 完全一致，所有的 key 都必须存在。

### 步骤 2: 在 index.tsx 中注册语言

编辑 `src/app/i18n/index.tsx`：

1. **导入语言包**:
```typescript
import { fr } from './fr';
```

2. **添加到 Lang 类型**（如果是新语言）:
```typescript
export type Lang = 'zh' | 'en' | 'ar' | 'es' | 'fr' | ...;
```

3. **添加到 LANGUAGES 对象**:
```typescript
export const LANGUAGES: Record<Lang, { name: string; nativeName: string }> = {
  // ...
  fr: { name: 'French', nativeName: 'Français' },
};
```

4. **添加到 dictionaries 对象**:
```typescript
const dictionaries: Record<Lang, Dict> = {
  // ...
  fr,  // 使用实际翻译
  // 或 fr: en,  // 临时使用英语回退
};
```

### 步骤 3: 测试

1. 启动开发服务器: `npm run dev`
2. 在右上角语言选择器中选择新语言
3. 检查所有页面的文案是否正确显示

---

## 🎯 语言包结构说明

### 主要部分

| 部分 | 说明 | 示例 |
|------|------|------|
| `brand` | 品牌名称 | `'starsyun'` |
| `nav` | 导航栏 | `home`, `explore`, `admin` |
| `common` | 通用文案 | 按钮、标签、状态等 |
| `home` | 首页内容 | Hero、分类、优势等 |
| `explore` | 地图数据中心 | 筛选、结果、绘制等 |
| `filters` | 筛选器选项 | 数据类型、时间范围等 |
| `product` | 产品详情 | 参数、定价等 |
| `inquiry` | 询价表单 | 字段标签、类型等 |
| `admin` | 后台管理 | 仪表盘、状态等 |

### 特殊语法

**动态文本（函数）**:
```typescript
resultsCount: (n: number) => `${n} 条数据产品`,
```

**对象嵌套**:
```typescript
categories: {
  history: { name: '历史卫星影像', desc: '海量存档影像' },
}
```

---

## 🔄 RTL（从右到左）支持

系统自动为阿拉伯语 (`ar`) 启用 RTL 布局：

```typescript
// 在 i18n/index.tsx 中自动处理
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
```

如需添加更多 RTL 语言（如希伯来语 `he`、波斯语 `fa`），在设置 dir 时添加条件：

```typescript
const rtlLangs: Lang[] = ['ar', 'he', 'fa'];
document.documentElement.dir = rtlLangs.includes(lang) ? 'rtl' : 'ltr';
```

---

## 🌐 浏览器语言自动检测

系统会自动检测用户的浏览器语言并设置为默认语言：

```typescript
function detectBrowserLanguage(): Lang {
  const browserLang = navigator.language.toLowerCase();
  
  if (browserLang.startsWith('zh')) return 'zh';
  if (browserLang.startsWith('es')) return 'es';
  // ...
  
  return 'en'; // 默认回退到英语
}
```

用户可以通过右上角的语言选择器手动切换，选择会保存到 `localStorage`。

---

## 📝 翻译指南

### 1. 保持一致性
- 使用相同的术语翻译（如 "卫星" 始终翻译为 "Satellite"）
- 保持语气专业、友好

### 2. 注意长度
- 某些语言翻译后会更长（如德语、法语）
- 测试 UI 在不同语言下是否正常显示
- 特别注意移动端的显示效果

### 3. 文化适配
- 日期/时间格式（某些地区使用 DD/MM/YYYY）
- 货币符号（当前使用人民币 CNY）
- 度量单位（公里 vs 英里）

### 4. 专业术语
- 卫星遥感相关术语应使用行业标准翻译
- 参考 NASA、ESA 等权威机构的多语言资源

---

## 🛠️ 在代码中使用

### 获取当前语言和翻译

```typescript
import { useI18n } from '../i18n';

function MyComponent() {
  const { t, lang, setLang } = useI18n();
  
  return (
    <div>
      <h1>{t.home.heroTitle}</h1>
      <p>{t.explore.resultsCount(42)}</p>
      <button onClick={() => setLang('es')}>Español</button>
    </div>
  );
}
```

### 多语言对象选择

```typescript
import { useLocale } from '../i18n';

const product = {
  name: { zh: '吉林一号', en: 'Jilin-1', es: 'Jilin-1' }
};

function MyComponent() {
  const loc = useLocale();
  
  return <div>{loc(product.name)}</div>;
}
```

---

## 🎨 UI 组件适配

语言选择器组件位于: `src/app/components/LangToggle.tsx`

特点：
- 下拉菜单展示所有可用语言
- 主要语言（中文、英语）置顶
- 显示当前选中语言的 native name
- 响应式设计，移动端只显示图标

---

## 📊 优先级建议

根据业务需求，建议优先翻译的语言：

### 高优先级
1. **英语 (en)** ✅ - 国际通用语
2. **阿拉伯语 (ar)** ✅ - 中东市场（沙特、阿联酋等）
3. **西班牙语 (es)** ✅ - 拉美、西班牙市场

### 中优先级
4. **法语 (fr)** - 非洲、法国市场
5. **葡萄牙语 (pt)** - 巴西、葡萄牙市场
6. **俄语 (ru)** - 俄罗斯、中亚市场

### 低优先级（根据业务拓展）
7. **日语 (ja)** - 日本市场
8. **韩语 (ko)** - 韩国市场
9. **德语 (de)** - 德国、中欧市场

---

## 🐛 常见问题

### Q: 翻译后某些页面显示英文？
A: 检查语言包是否包含所有必需的 key，确保结构与 `zh.ts` 一致。

### Q: 如何测试所有语言？
A: 在浏览器中逐个切换语言，检查每个页面。建议使用浏览器的响应式设计模式测试移动端。

### Q: 翻译文本太长导致 UI 布局错乱？
A: 使用 CSS `truncate` 或 `line-clamp` 类，或调整组件的响应式断点。

### Q: 如何处理复数形式？
A: 在函数中根据数量返回不同文案：
```typescript
itemCount: (n: number) => n === 1 ? '1 item' : `${n} items`
```

---

## 📧 贡献

如果你完成了某个语言的翻译，请：
1. 确保翻译准确、专业
2. 测试所有页面的显示效果
3. 提交 Pull Request 或联系开发团队

---

**最后更新**: 2026-07-28
**维护者**: starsyun 开发团队
