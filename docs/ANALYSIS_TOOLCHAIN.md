# 分析工作台工具链与执行边界

分析工作台采用“结构化配方 + 可审计 Worker”模式。用户提交目标和数据，系统生成固定的处理步骤；工具由配方选择，用户不需要也不应该直接选择模型权重。

## 分层架构

| 层 | 责任 | 运行位置 |
|---|---|---|
| Node API | 鉴权、订单/询价、任务状态、短时 COS 签名、结果索引 | 腾讯云 Web 服务 |
| CPU Worker | GDAL、Rasterio、GeoPandas、Shapely、坐标转换、配准、云掩膜、指数和统计 | 独立 CPU Worker |
| GPU Worker | YOLO、SAM/SAM2/SAM3、变化检测和分类模型 | 可弹性 GPU Worker |
| 质量检查 | 覆盖率、坐标系、配准误差、空结果、抽样复核 | CPU/GPU Worker + 人工复核 |
| 报告层 | 读取结构化结果，生成多语言摘要、图表和 PDF/HTML | 受控报告 Worker |

当前腾讯云 Web 服务器不承载长时间 GPU 推理，也不安装 QGIS 或 Codex 插件作为生产依赖。

## 工具职责

- **GDAL/Rasterio/GeoPandas**：输入格式检查、坐标/投影、栅格窗口、拼接、COG、GeoJSON、CSV 和确定性统计。
- **YOLO/Ultralytics**：目标检测和实例检测。商用分发前必须选择符合业务的许可（AGPL 或 Enterprise），记录模型版本和权重哈希。
- **SAM/SAM2/SAM3**：光学目标的提示式/开放词汇分割和边界修正。它不替代 SAR 解译、光谱指数或最终面积计算；SAM3 只在 GPU Worker 配方声明时运行。
- **QGIS/Deepness**：开发与人工质检、标注、算法验证和模板调试，不在 Web 请求中启动桌面插件。Deepness 的模型和许可证需要单独备案。
- **Mapflow**：外部服务 Adapter。只有在确认 API、数据再分发、商用许可、区域和价格后才启用，响应必须落入统一的模型运行记录。
- **Earth Engine / Easy GEE**：Easy GEE 这类 Codex 辅助插件只用于生成和调试 GEE 脚本；生产通过 Earth Engine API、服务账号、配额和许可执行，不把插件当作在线运行时。
- **多模态大模型**：把自然语言转成结构化规格，解释已计算的结果并编排报告。不能直接计算像元面积、数量、置信度或替代质量检查。

## 首批可落地配方

1. `change-detection-optical`：输入校验 → COG/配准 → 云掩膜 → 差异栅格 → 面积/数量统计 → QA → 报告。
2. `feature-extraction-yolo-sam`：输入校验 → YOLO 候选 → SAM 边界精修（可选）→ 去重/面积统计 → QA → GeoJSON/报告。
3. `land-cover-classification`：输入校验 → 分类模型 → 后处理 → 类别面积统计 → QA → COG/CSV/报告。
4. `gee-time-series`：输入校验 → Earth Engine 时序计算 → 指标表/图表 → QA → 报告。

每个配方都要把步骤写入 `analysis_job_steps`，把模型、版本、权重哈希和参数写入 `analysis_model_runs`，把检查结论写入 `analysis_quality_checks`，成果物写入私有 COS 并在 `analysis_artifacts` 登记。报告只能引用这些结构化记录。

## 自有影像输入

用户可在分析工作台创建“自有影像”任务，上传 GeoTIFF/COG、GeoJSON、KML/KMZ 或 ZIP。浏览器使用短时 COS PUT URL 直传，服务器只保存 `analysis_input_assets` 的元数据并在完成回调中 HEAD 校验大小。Worker 读取私有 COS，不把大文件放进 Supabase。

