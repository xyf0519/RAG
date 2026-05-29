# xyfRAG

校园资料库 RAG 问答工程，包含边界分类器、混合召回、重排、来源引用、多轮查询重写、FastAPI 后端、Gradio 前端和对比评测脚本。

## 快速开始

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

如需启用 SentenceTransformers embedding 与 CrossEncoder reranker：

```bash
pip install -r requirements-local-models.txt
```

并在 `config/settings.yaml` 中设置：

```yaml
retrieval:
  use_local_models: true
```

## 构建资产

```bash
PYTHONPATH=src python models/train_classifier.py
PYTHONPATH=src python scripts/build_index.py
```

## 启动服务

```bash
PYTHONPATH=src uvicorn app.main:app --host 0.0.0.0 --port 8000
```

另开一个终端启动前端：

```bash
PYTHONPATH=src python frontend.py
```

## API 示例

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"挂科后什么时候申请补考？","session_id":"demo"}'
```

## 评测

```bash
PYTHONPATH=src python scripts/evaluate.py
```

评测脚本会比较带知识库的 RAG 回答与纯原生大模型回答。需要在 `.env` 中配置 `OPENAI_API_KEY` 后，涉及大模型的步骤才会正常返回。

默认配置 `llm.allow_mock_when_no_key: true` 会在没有 API Key 时启用本地抽取式回答，便于演示完整 RAG 链路；配置 API Key 后会自动调用真实大模型。

## 工程结构

```text
app/                  FastAPI 后端
config/settings.yaml  配置入口
data/raw/             原始知识库文档
models/               边界分类器训练脚本与产物目录
scripts/              索引构建和评测脚本
src/xyfrag/           RAG 核心模块
frontend.py           Gradio 前端
```
