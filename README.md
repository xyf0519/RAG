<p align="center">
  <h1 align="center">campus RAG</h1>
  <p align="center">面向校园资料库的可控 RAG 问答工程</p>
</p>

<p align="center">
  <a href="https://github.com/xyf0519/RAG"><img alt="GitHub Repo" src="https://img.shields.io/badge/GitHub-xyf0519%2FRAG-181717?style=for-the-badge&logo=github"></a>
  <img alt="Python" src="https://img.shields.io/badge/Python-3.9%2B-3776AB?style=for-the-badge&logo=python&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white">
  <img alt="Gradio" src="https://img.shields.io/badge/Gradio-Frontend-F97316?style=for-the-badge">
</p>

<p align="center">
  <b>Boundary Filter</b> · <b>Hybrid Retrieval</b> · <b>Reranker</b> · <b>Citation</b> · <b>Session Memory</b>
</p>

---

## 项目定位

`xyfRAG` 是一个从工程边界开始约束幻觉的校园资料库问答系统。它不是把用户问题直接丢给大模型，而是先通过边界分类器判断问题是否属于校园知识库范围，再执行混合召回、重排、引用 Prompt 和多轮查询重写。

如果问题被判定为闲聊或超纲，系统会直接熔断返回固定话术，并且不调用大模型。

## 核心亮点

| 能力 | 说明 |
| --- | --- |
| 边界神经网络 | `models/train_classifier.py` 训练二分类器，Label 1 表示知识库相关，Label 0 表示闲聊或超纲问题 |
| Token 熔断 | 边界判 0 时立即返回，不进入 LLM 链路，降低幻觉和成本 |
| 多路召回 | BM25 捕捉课程代码、部门缩写等精确词；Embedding 捕捉语义相似问题 |
| 重排 Top-3 | 召回候选经过 Reranker 统一排序，只把最相关资料送入 Prompt |
| 来源引用 | 每段资料以 `[参考资料 1]` 编号，要求回答句末标注 `[1]` |
| 多轮会话 | 后端维护 session history，并支持独立查询重写 |
| 本地可演示 | 无 API Key 时默认启用本地抽取式回答，方便完整跑通链路 |

## 架构速览

```text
User Query
    |
    v
+---------------------+
| Boundary Classifier |
+---------------------+
    | in-scope                         | out-of-scope
    v                                  v
+---------------------+        +----------------------+
| Query Rewrite       |        | Fast Fuse Response   |
+---------------------+        +----------------------+
    |
    v
+---------------------+      +---------------------+
| BM25 Retriever      |      | Embedding Retriever |
+---------------------+      +---------------------+
    \                         /
     \                       /
      v                     v
      +---------------------+
      | Hybrid Fusion       |
      +---------------------+
               |
               v
      +---------------------+
      | Reranker Top-3      |
      +---------------------+
               |
               v
      +---------------------+
      | Citation Prompt     |
      +---------------------+
               |
               v
      +---------------------+
      | Grounded Answer     |
      +---------------------+
```

## 快速启动

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

构建分类器和检索索引：

```bash
PYTHONPATH=src python models/train_classifier.py
PYTHONPATH=src python scripts/build_index.py
```

启动后端：

```bash
PYTHONPATH=src uvicorn app.main:app --host 127.0.0.1 --port 8000
```

启动前端：

```bash
PYTHONPATH=src python frontend.py
```

打开：

```text
FastAPI  http://127.0.0.1:8000
Gradio   http://127.0.0.1:7860
```

## 一次请求

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"挂科后什么时候申请补考？","session_id":"demo"}'
```

超纲问题会直接熔断：

```json
{
  "answer": "该问题超出校园资料库范围，建议咨询相关行政部门。",
  "used_llm": false
}
```

## 可选增强

默认使用轻量 hashing embedding 和词面 reranker，适合快速开发。如果需要切换到 SentenceTransformers 与 CrossEncoder：

```bash
pip install -r requirements-local-models.txt
```

然后修改 `config/settings.yaml`：

```yaml
retrieval:
  use_local_models: true
```

## 目录地图

```text
app/                  FastAPI 后端入口
config/settings.yaml  统一配置文件
data/raw/             原始知识库文档
models/               边界分类器训练脚本
scripts/              索引构建与评测脚本
src/xyfrag/           RAG 核心模块
frontend.py           Gradio 前端入口
USAGE.md              完整使用手册
```

## GitHub

当前仓库已关联：

```bash
origin  https://github.com/xyf0519/RAG.git
```

后续开发完成后直接提交并推送：

```bash
git add .
git commit -m "your message"
git push origin main
```

更多运行、配置、数据更新和推送流程见 [USAGE.md](USAGE.md)。
