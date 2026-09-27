# StarSyun 分析工作台

分析服务不把模型暴露给普通用户，而是把用户的空间问题转换为可验证的分析规格，再由配方路由到确定性遥感处理、专用模型和可选的 AI 报告层。

## 用户流程

```text
选择模板 → 选择已购影像/自有影像 → 描述目标和时间 → 确认交付物
→ 校验输入 → 执行配方 → 质量检查 → 报告生成 → COS 交付
```

首批模板：

- `change-detection`：多时相变化检测，优先上线；
- `feature-extraction`：建筑物、道路、船舶等目标提取；
- `land-cover`：地物分类与面积统计；
- `time-series`：植被、水体、城市等时间序列趋势。

## 模型边界

- GDAL/Rasterio/NumPy 等确定性处理负责坐标、配准、云掩膜、指数和统计；
- 专用遥感模型负责变化检测、分类和目标识别；
- SAM3 只作为光学目标提取或交互式分割的可选 Worker，不作为 SAR、光谱指数或最终统计引擎；
- 多模态模型负责需求结构化、结果解释和报告编排，不得自行计算面积、数量或置信度；
- 报告数字必须来自结构化结果和已通过的质量检查。

## 成果包

每个已交付任务应包含：

1. 预览图和结果叠加图；
2. COG/GeoTIFF、GeoJSON、CSV 或 JSON 结果；
3. PDF/HTML 标准报告；
4. 数据来源、处理模板、模型版本、质量检查和限制条件；
5. 私有 COS 对象、SHA-256 和短时签名下载审计。

## 后端对象

`analysis_jobs` 是执行主表；迁移 `014_analysis_workbench.sql` 增加：

- `analysis_workspaces`：保存用户的分析工作区；
- `analysis_job_steps`：记录验证、准备、处理、质检、报告和发布步骤；
- `analysis_model_runs`：记录模型、版本、权重哈希和参数；
- `analysis_quality_checks`：记录覆盖率、配准误差、空结果和人工抽样等检查；
- `analysis_artifacts`：记录 COS 中的预览、空间数据、报告和日志；
- `analysis_reports`：记录报告语言、版本、生成来源和审核状态。

迁移执行前必须完成生产 Supabase 备份。Node Web 进程只负责创建任务、鉴权和状态查询；长时间处理应由独立 CPU/GPU Worker 执行。
