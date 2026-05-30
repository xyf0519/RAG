<p align="center">
  <h1 align="center">RAG</h1>
  <p align="center">面向校园资料库的可控 RAG 问答工作台</p>
</p>

<p align="center">
  <img alt="Node" src="https://img.shields.io/badge/Node-24_LTS-339933?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-BFF-000000?style=for-the-badge&logo=next.js&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-RAG_Engine-009688?style=for-the-badge&logo=fastapi&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/Python-3.9%2B-3776AB?style=for-the-badge&logo=python&logoColor=white">
</p>

<p align="center">
  <b>Streaming UX</b> · <b>Boundary Filter</b> · <b>Hybrid Retrieval</b> · <b>Citations</b> · <b>Next.js BFF</b>
</p>

---

## 项目定位

`xyfRAG` 是一个从工程边界开始约束幻觉的校园资料库问答系统。Python/FastAPI 负责 RAG 引擎，Next.js/Node 负责专业交互、BFF 转发、流式体验和错误治理。

用户提问后，系统会先判断问题是否属于校园资料库范围；范围内问题进入查询改写、BM25 + embedding 混合召回、重排、引用生成；超纲问题会直接熔断，不调用大模型。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| Next.js 工作台 | 首屏就是聊天工具，支持流式回答、停止、重试、新会话、健康状态、引用侧栏和移动端 tabs |
| BFF 聚合层 | 浏览器只访问 `/api/chat` 与 `/api/health`，Node 服务端转发到 FastAPI 并统一错误事件 |
| NDJSON 流协议 | `status`、`delta`、`final`、`error` 四类事件驱动丝滑反馈 |
| 边界熔断 | 超纲或闲聊问题返回固定话术，降低幻觉和成本 |
| 混合检索 | BM25 捕捉精确词，embedding 捕捉语义相似问题 |
| 引用追溯 | 回答绑定 `[1]` 样式来源，前端展示 chunk、score 和正文 |
| BGE 语义检索 | 默认使用本地 `models/huggingface/bge-small-zh-v1.5` 做 embedding，CPU 演示稳定；可按需切换到 BGE-M3 或 BGE reranker |
| 本地演示 | 无 LLM API Key 时启用本地抽取式回答，完整链路可跑通 |

## 快速启动

第一次拉取项目、配置 API、本地 BGE 模型、边界二分类器和知识库扩充，请先看 [新手启动与扩展指南](docs/NEW_USER_GUIDE.md)。

后端：

```bash
python3 -m venv .venv
.venv/bin/python3 -m pip install --upgrade pip
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 -m pip install -r requirements-local-models.txt
cp .env.example .env
mkdir -p models/huggingface
.venv/bin/huggingface-cli download BAAI/bge-small-zh-v1.5 \
  --local-dir models/huggingface/bge-small-zh-v1.5 \
  --local-dir-use-symlinks False
PYTHONPATH=src .venv/bin/python3 models/train_classifier.py
PYTHONPATH=src .venv/bin/python3 scripts/build_index.py
PYTHONPATH=src .venv/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

如果下载模型时报 `zsh: command not found: huggingface-cli`，说明你执行了裸命令。请使用项目虚拟环境里的脚本：

```bash
.venv/bin/huggingface-cli download BAAI/bge-small-zh-v1.5 \
  --local-dir models/huggingface/bge-small-zh-v1.5 \
  --local-dir-use-symlinks False
```

如果 `.venv/bin/huggingface-cli` 也不存在，先重新安装基础依赖：

```bash
.venv/bin/python3 -m pip install -r requirements.txt
```

LLM API Key 填在项目根目录 `.env`：

```bash
OPENAI_API_KEY=你的 API Key
OPENAI_BASE_URL=https://api.deepseek.com
```

BGE 模型不需要填写 API Key，但需要两步：先安装 `requirements-local-models.txt` 中的加载库，再用 `.venv/bin/huggingface-cli` 下载模型权重到 `models/huggingface/bge-small-zh-v1.5`。若要换更大的模型，可下载到本地后在 `config/settings.yaml` 中把 `embedding_model` 改成本地路径，并按需把 `reranker_backend` 改成 `bge`。

前端：

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

打开：

```text
Next.js  http://127.0.0.1:3000
FastAPI  http://127.0.0.1:8000
```

Gradio 仍保留为调试入口：

```bash
PYTHONPATH=src .venv/bin/python3 frontend.py
```

## 流式 API

```bash
curl -N -X POST http://127.0.0.1:8000/api/v1/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"query":"挂科后什么时候申请补考？","session_id":"demo"}'
```

事件格式：

```json
{"type":"status","payload":{"stage":"retrieve","message":"正在检索知识库"}}
{"type":"delta","payload":{"text":"补考申请应在开学前两周提交"}}
{"type":"final","payload":{"answer":"...","sources":[],"timings":{}}}
```

## 测试与质量门槛

```bash
PYTHONPATH=src .venv/bin/python3 -m pytest
cd web
npm run lint
npm run typecheck
npm test
npm run e2e
```

一键演示：

```bash
docker compose -f docker-compose.demo.yml up --build
```

## 目录地图

```text
app/                  FastAPI 后端入口与流式 API
src/xyfrag/           RAG 核心模块
web/                  Next.js BFF 与主交互界面
data/raw/             原始知识库文档
data/boundary/        边界分类器训练 JSONL
models/               边界分类器训练脚本
scripts/              索引构建与评测脚本
frontend.py           Gradio 调试前端
USAGE.md              完整使用手册
```
