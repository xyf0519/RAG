# xyfRAG 使用手册

这份文档面向日常开发、演示和维护。当前主交互入口是 `web/` 下的 Next.js 工作台，`frontend.py` 仅作为 Gradio 调试入口保留。

## 1. 环境准备

后端需要 Python 3.9+，前端建议 Node 24 LTS。BGE 本地模型需要额外安装 `requirements-local-models.txt`。

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-local-models.txt
cp .env.example .env
```

如果需要真实调用 OpenAI 兼容接口，在 `.env` 中填写：

```bash
OPENAI_API_KEY=你的 API Key
OPENAI_BASE_URL=https://api.deepseek.com
```

没有 API Key 时，默认 `llm.allow_mock_when_no_key: true` 会启用本地抽取式回答。

BGE embedding/reranker 不走 OpenAI API，不需要在 `.env` 填 BGE API Key。当前默认配置从本地已下载模型加载：

```yaml
retrieval:
  embedding_backend: bge
  embedding_model: models/huggingface/bge-small-zh-v1.5
  reranker_backend: lexical
  reranker_model: ""
  use_local_models: true
  allow_model_fallback: true
```

`bge-small-zh-v1.5` 适合 CPU 快速演示。如果学校网络不能直连 Hugging Face，可以选择其一：

```bash
HF_ENDPOINT=https://hf-mirror.com
HF_TOKEN=你的 Hugging Face Token
```

或者提前下载模型，然后把 `config/settings.yaml` 改成本地路径：

```yaml
retrieval:
  embedding_model: /absolute/path/to/bge-small-zh-v1.5
```

## 2. 准备索引和边界分类器

知识库文档放在：

```text
data/raw/
```

当前支持 `.md` 和 `.txt`。更新知识库后重建索引：

```bash
PYTHONPATH=src python scripts/build_index.py
```

边界分类器训练数据放在：

```text
data/boundary/train.jsonl
```

每行格式：

```json
{"text":"补考申请什么时候提交","label":1}
{"text":"给我讲个笑话","label":0}
```

训练：

```bash
PYTHONPATH=src python models/train_classifier.py
```

如果 `data/boundary/train.jsonl` 不存在，脚本会 fallback 到内置 mock 数据。

## 3. 启动后端

```bash
PYTHONPATH=src uvicorn app.main:app --host 127.0.0.1 --port 8000
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
```

## 4. 启动 Next.js 工作台

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

访问：

```text
http://127.0.0.1:3000
```

前端通过 BFF 路由访问后端：

| 路由 | 说明 |
| --- | --- |
| `GET /api/health` | Next.js 检查 FastAPI 健康状态 |
| `POST /api/chat` | Next.js 代理 FastAPI 流式问答 |

`web/.env.local` 中可调整：

```bash
RAG_BACKEND_URL=http://127.0.0.1:8000
```

## 5. API 调用

兼容 JSON 接口：

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"挂科后什么时候申请补考？","session_id":"demo"}'
```

流式接口：

```bash
curl -N -X POST http://127.0.0.1:8000/api/v1/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"query":"挂科后什么时候申请补考？","session_id":"demo"}'
```

NDJSON 事件类型：

| type | payload |
| --- | --- |
| `status` | `stage`、`message`、`ts` |
| `delta` | `text` |
| `final` | `answer`、`sources`、`boundary`、`rewritten_query`、`timings` |
| `error` | `code`、`message`、`retryable` |

稳定错误码：

```text
BACKEND_UNAVAILABLE
LLM_TIMEOUT
NO_REFERENCE
OUT_OF_SCOPE
```

## 6. 测试

后端：

```bash
PYTHONPATH=src pytest
```

前端：

```bash
cd web
npm run lint
npm run typecheck
npm test
npm run e2e
```

E2E 使用 mocked BFF 响应验证桌面和移动端工作台基础体验。

## 7. Docker 演示

```bash
docker compose -f docker-compose.demo.yml up --build
```

访问：

```text
http://127.0.0.1:3000
```

## 8. 可选增强

默认已经配置为本地 `bge-small-zh-v1.5` embedding + 轻量词面 reranker，适合本机 CPU 演示。若机器没有安装本地模型依赖，系统会自动降级到 hashing embedding 和词面 reranker，保证演示不崩。

如果要升级到完整 BGE-M3 或 BGE reranker，把模型下载到 `models/huggingface/` 后修改：

```yaml
retrieval:
  embedding_backend: bge
  embedding_model: models/huggingface/bge-m3
  reranker_backend: bge
  reranker_model: models/huggingface/bge-reranker-v2-m3
```

如果显存/内存不足，可在 `config/settings.yaml` 临时切成轻量模式：

```yaml
retrieval:
  use_local_models: false
```

## 9. 常见问题

### 为什么问天气会直接拒答？

天气属于校园资料库范围外问题，边界分类器会熔断，避免大模型自由发挥。

### 更新知识库后为什么回答没变化？

需要重新构建索引：

```bash
PYTHONPATH=src python scripts/build_index.py
```

### Next.js 显示后端离线怎么办？

确认 FastAPI 正在运行，并检查 `web/.env.local` 中的 `RAG_BACKEND_URL`。
