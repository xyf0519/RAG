# xyfRAG 使用手册

这份文档面向日常开发、演示和后续推送维护。README 负责快速展示项目，USAGE 负责把操作步骤写清楚。

## 1. 环境准备

推荐使用 Python 3.9 或更高版本。

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

如果需要真实调用 OpenAI 兼容接口，在 `.env` 中填写：

```bash
OPENAI_API_KEY=你的 API Key
OPENAI_BASE_URL=https://api.openai.com/v1
```

如果没有 API Key，默认配置 `llm.allow_mock_when_no_key: true` 会启用本地抽取式回答，仍然可以演示完整 RAG 链路。

## 2. 配置入口

主要配置集中在 `config/settings.yaml`：

```yaml
boundary_classifier:
  enabled: true
  threshold: 0.55

retrieval:
  bm25_top_k: 8
  embedding_top_k: 8
  rerank_top_k: 3
  use_local_models: false

llm:
  model: gpt-4.1-mini
  allow_mock_when_no_key: true
```

常用调整：

| 场景 | 修改项 |
| --- | --- |
| 边界分类过严 | 降低 `boundary_classifier.threshold` |
| 召回结果太少 | 提高 `bm25_top_k` 或 `embedding_top_k` |
| 希望给 LLM 更多资料 | 提高 `rerank_top_k` |
| 启用本地语义模型 | 设置 `retrieval.use_local_models: true` |
| 强制必须使用真实 LLM | 设置 `llm.allow_mock_when_no_key: false` |

## 3. 准备知识库

把校园资料库文档放入：

```text
data/raw/
```

当前支持：

```text
.md
.txt
```

示例：

```text
data/raw/campus_guide.md
```

更新文档后必须重建索引：

```bash
PYTHONPATH=src python scripts/build_index.py
```

## 4. 训练边界分类器

训练脚本：

```bash
PYTHONPATH=src python models/train_classifier.py
```

产物位置：

```text
models/boundary_classifier/classifier.joblib
```

当前脚本内置 mock 数据用于跑通流程。真实项目中建议把样本扩展为：

| Label | 含义 | 示例 |
| --- | --- | --- |
| 1 | 校园资料库相关 | 补考申请时间、校园卡挂失、图书馆借阅规则 |
| 0 | 闲聊或超纲 | 天气、电影推荐、写诗、股票预测 |

## 5. 启动后端

```bash
PYTHONPATH=src uvicorn app.main:app --host 127.0.0.1 --port 8000
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
```

预期：

```json
{"ok":true,"app":"xyfRAG"}
```

## 6. 启动前端

另开一个终端：

```bash
source .venv/bin/activate
PYTHONPATH=src python frontend.py
```

访问：

```text
http://127.0.0.1:7860
```

## 7. API 调用

校园资料库问题：

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"挂科后什么时候申请补考？","session_id":"demo"}'
```

超纲问题：

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"给我讲个笑话","session_id":"demo"}'
```

重点看返回中的：

```json
{
  "boundary": {
    "is_in_scope": false
  },
  "used_llm": false
}
```

这表示边界分类器已经熔断，未调用大模型。

## 8. 评测

```bash
PYTHONPATH=src python scripts/evaluate.py
```

评测脚本会对比：

| 模式 | 说明 |
| --- | --- |
| RAG | 边界分类、检索、重排、引用后回答 |
| Plain LLM | 不带知识库的原生大模型回答 |

涉及真实 LLM 的部分需要配置 `OPENAI_API_KEY`。

## 9. GitHub 推送流程

当前远程仓库：

```bash
git remote -v
```

预期：

```text
origin  https://github.com/xyf0519/RAG.git (fetch)
origin  https://github.com/xyf0519/RAG.git (push)
```

后续日常推送：

```bash
git status
git add .
git commit -m "docs: update usage guide"
git push origin main
```

如果远程有更新，先拉取：

```bash
git pull --rebase origin main
git push origin main
```

## 10. 常见问题

### 没有 API Key 能不能跑？

可以。默认 `llm.allow_mock_when_no_key: true`，会使用本地抽取式回答。

### 为什么问天气会直接拒答？

天气属于校园资料库范围外问题，边界分类器会熔断，避免大模型自由发挥。

### 更新知识库后为什么回答没变化？

需要重新构建索引：

```bash
PYTHONPATH=src python scripts/build_index.py
```

### 如何启用更强的向量模型和重排模型？

安装可选依赖：

```bash
pip install -r requirements-local-models.txt
```

修改配置：

```yaml
retrieval:
  use_local_models: true
```

### 运行产物会不会被提交？

`.gitignore` 已忽略 `.venv/`、日志、索引和训练产物。源码、配置、示例原始知识库和文档会进入版本管理。
