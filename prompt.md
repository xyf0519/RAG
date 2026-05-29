# 核心模块工程规范要求

1. **边界处理 (Boundary Neural Network)**：
   * 提供一个独立脚本 `models/train_classifier.py`。定义二分类任务：Label 1 为「知识库相关」，Label 0 为「闲聊/超纲问题」。
   * 在 RAG 链路的最前端接入此模型。若判为 0，系统直接返回快速熔断话术（如：“该问题超出校园资料库范围，建议咨询相关行政部门。”），**决不调用大模型**，以此彻底阻断幻觉并节约 Token 成本。
2. **知识库检索 (RAG Pipeline)**：
   * 必须实现多路召回融合。BM25 捕捉精准关键词（如具体的课程代码、机构缩写），Embedding 捕捉模糊语义。
   * 融合后的结果必须经过 Reranker 打分，提取 Top-3 送入 Prompt。
3. **来源引用与透明度 (Citation)**：
   * 构建 Prompt 时，给每一段召回内容编上序号（如 `[参考资料 1]`）。
   * 系统级指令（System Prompt）中严格要求大模型：必须且只能利用提供的参考资料回答，并在句末标注对应来源序号（如：“根据规定，挂科后需在下学期开学前两周申请补考[1]。”）。
4. **多轮对话管理**：
   * 后端需维护历史会话（可用内存字典模拟或存入 SQLite）。将最新的对话历史与当前 Query 一并交给 LLM 进行**独立查询重写 (Query Rewrite)**，再拿重写后的 Query 去向量库检索。

# 代码质量与工程习惯约束 (极客标准)

* **Type Hinting**：所有 Python 函数必须有严格的类型注解（Type Hints）。
* **Docstrings**：每个类和复杂函数必须包含 Google 风格的 Docstring，说明 Args, Returns 和 Raises。
* **配置分离**：绝不可以在代码里硬编码路径或 API Key，必须从 `config/settings.yaml` 或 `.env` 读取。
* **错误处理**：使用 `try-except` 捕获所有可能的网络异常、大模型 API 超时，并返回优雅的 JSON 错误信息。
* **日志系统**：使用 `logging` 模块替换所有的 `print`，设置 INFO 和 ERROR 级别，记录用户的 Query、召回的 Doc ID 以及大模型的耗时。

# 执行步骤规划

请你按照以下步骤依次输出代码，不要一次性全部堆砌，请先确认理解本项目全貌：

* **Phase 1**：生成项目基础依赖（requirements.txt）与配置文件读取模块。
* **Phase 2**：编写边界分类器网络模型与训练脚本（包含模拟的假数据生成器以便跑通流程）。
* **Phase 3**：实现 RAG 核心三剑客（Loader切分、Hybrid Retriever召回、Reranker重排）。
* **Phase 4**：搭建 FastAPI 后端与对话状态管理。
* **Phase 5**：实现 Gradio 前端页面，完成全链路对接。
* **Phase 6**：编写自动化的对比评测脚本（对比带知识库与纯原生大模型的差异）。
