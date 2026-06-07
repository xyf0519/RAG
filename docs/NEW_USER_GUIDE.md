# xyfRAG 新手启动与扩展指南

这份文档给第一次拉取项目的同学使用，目标是从零跑通系统，并知道后续如何配置 API、下载 BGE 模型、训练边界二分类器、扩充知识库。

当前项目定位是“校园智能问答助手（知识库 + RAG）”。现有知识库主题为浙江大学图书馆规则，原始资料在 `data/raw/zju_library_rules.md`。

## 1. 项目结构

```text
app/                         FastAPI 后端入口
src/xyfrag/                  RAG 核心代码
web/                         Next.js 前端与 BFF
data/raw/                    原始知识库 Markdown/TXT
data/index/                  构建后的检索索引
data/boundary/train.jsonl    边界二分类器训练数据
models/train_classifier.py   边界分类器训练脚本
models/boundary_classifier/  训练后的分类器文件
models/huggingface/          本地 BGE 模型目录，不提交到 Git
config/settings.yaml         后端主配置
.env                         后端 API Key，本地私有文件，不提交到 Git
web/.env.local               前端 BFF 配置，本地私有文件，不提交到 Git
```

## 2. 环境要求

后端：

- Python 3.9+
- pip
- 建议 macOS/Linux/WSL

前端：

- Node.js 24 LTS
- npm

确认版本：

```bash
python3 --version
node --version
npm --version
```

## 3. 拉取项目

```bash
git clone https://github.com/xyf0519/RAG.git
cd RAG
```

如果你是在某个父目录里操作，请务必进入真正的项目仓库。判断标准是当前目录下能看到 `README.md`、`app/`、`src/`、`web/`：

```bash
cd RAG
ls README.md app src web
```

不要在项目外层目录执行本项目命令，否则可能会使用错误的 Git 仓库或错误的虚拟环境。

## 4. 后端安装

```bash
python3 -m venv .venv
.venv/bin/python3 -m pip install --upgrade pip
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 -m pip install -r requirements-local-models.txt
```

注意：`requirements-local-models.txt` 只安装加载 BGE 所需的 Python 库，例如 `FlagEmbedding`、`sentence-transformers`、`torch`。它不会下载 BGE 模型权重，也不会自动创建 `models/huggingface/bge-small-zh-v1.5/`。模型权重必须按第 6 节单独下载。

安装后先校验依赖是否真的装进当前项目的 `.venv`：

```bash
.venv/bin/python3 - <<'PY'
import yaml
import fastapi
import sklearn
print("backend dependencies ok")
PY
```

如果你要启用本地 BGE，再校验 `FlagEmbedding`：

```bash
.venv/bin/python3 - <<'PY'
import FlagEmbedding
print("FlagEmbedding ok")
PY
```

如果这里报 `ModuleNotFoundError: No module named 'FlagEmbedding'`，说明 `requirements-local-models.txt` 没有安装成功。请重新执行：

```bash
.venv/bin/python3 -m pip install -r requirements-local-models.txt
```

如果命令行提示 `ModuleNotFoundError: No module named 'yaml'`，说明依赖没有安装到当前项目的 `.venv`。请回到项目根目录重新执行：

```bash
.venv/bin/python3 -m pip install -r requirements.txt
```

如果命令行提示 `zsh: command not found: python`，请不要使用 `python`。本文档所有后端命令都显式使用 `.venv/bin/python3`，例如：

```bash
PYTHONPATH=src .venv/bin/python3 models/train_classifier.py
PYTHONPATH=src .venv/bin/python3 scripts/build_index.py
```

## 5. 配置 LLM API

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
OPENAI_API_KEY=你的 DeepSeek API Key
OPENAI_BASE_URL=https://api.deepseek.com
RAG_BACKEND_URL=http://127.0.0.1:8000
```

当前默认模型在 `config/settings.yaml`：

```yaml
llm:
  provider: openai_compatible
  model: deepseek-v4-flash
  temperature: 0.2
  timeout_seconds: 30
  max_tokens: 900
  allow_mock_when_no_key: true
```

说明：

- 本项目使用 OpenAI-compatible `/chat/completions` 接口。
- DeepSeek 的 Key 填在 `OPENAI_API_KEY`。
- DeepSeek 的 URL 填在 `OPENAI_BASE_URL=https://api.deepseek.com`。
- 没有 Key 时，`allow_mock_when_no_key: true` 会启用本地抽取式回答，适合离线演示，但不是大模型生成。

## 6. 配置 BGE 本地模型

BGE 分两部分：

- Python 库：通过 `.venv/bin/python3 -m pip install -r requirements-local-models.txt` 安装。
- 模型权重文件：通过 `.venv/bin/huggingface-cli download ...` 下载到 `models/huggingface/`。

只安装 `requirements-local-models.txt` 不会得到 BGE 模型文件。

不要直接运行裸 `huggingface-cli`。很多机器上它不在 shell 的 `PATH` 里，会出现：

```text
zsh: command not found: huggingface-cli
```

本项目统一使用：

```bash
.venv/bin/huggingface-cli
```

当前推荐 CPU 演示模型：

```text
BAAI/bge-small-zh-v1.5
```

推荐放置目录：

```text
models/huggingface/bge-small-zh-v1.5/
```

配置位置在 `config/settings.yaml`：

```yaml
retrieval:
  embedding_backend: sentence_transformer
  embedding_model: models/huggingface/bge-small-zh-v1.5
  reranker_backend: lexical
  reranker_model: ""
  use_local_models: true
  allow_model_fallback: true
```

### 6.1 从 Hugging Face 下载

先创建模型目录，再下载：

```bash
mkdir -p models/huggingface
.venv/bin/huggingface-cli download BAAI/bge-small-zh-v1.5 \
  --local-dir models/huggingface/bge-small-zh-v1.5 \
  --local-dir-use-symlinks False
```

如果网络无法直连 Hugging Face，可先设置镜像：

```bash
export HF_ENDPOINT=https://hf-mirror.com
.venv/bin/huggingface-cli download BAAI/bge-small-zh-v1.5 \
  --local-dir models/huggingface/bge-small-zh-v1.5 \
  --local-dir-use-symlinks False
```

如果模型需要鉴权：

```bash
export HF_TOKEN=你的 Hugging Face Token
```

### 6.2 检查模型是否完整

至少应看到这些文件：

```text
models/huggingface/bge-small-zh-v1.5/config.json
models/huggingface/bge-small-zh-v1.5/tokenizer.json
models/huggingface/bge-small-zh-v1.5/vocab.txt
models/huggingface/bge-small-zh-v1.5/model.safetensors
```

检查命令：

```bash
ls -lh models/huggingface/bge-small-zh-v1.5
```

再用 Python 实测能否加载：

```bash
.venv/bin/python3 - <<'PY'
from FlagEmbedding import FlagModel
model = FlagModel(
    "models/huggingface/bge-small-zh-v1.5",
    query_instruction_for_retrieval="为这个句子生成表示以用于检索相关文章：",
    use_fp16=False,
)
vectors = model.encode(["浙江大学图书馆预约图书保留几天？"])
print(vectors.shape)
PY
```

能看到类似 `(1, 512)` 的输出，就说明本地 BGE 可用。

### 6.3 使用更大的 BGE-M3

如果机器内存和下载条件允许，可以下载：

```bash
.venv/bin/huggingface-cli download BAAI/bge-m3 \
  --local-dir models/huggingface/bge-m3 \
  --local-dir-use-symlinks False
```

然后修改：

```yaml
retrieval:
  embedding_backend: sentence_transformer
  embedding_model: models/huggingface/bge-m3
  use_local_models: true
```

注意：BGE-M3 更大，首次加载更慢，对内存更敏感。课堂演示优先推荐 `bge-small-zh-v1.5`。

### 6.4 BGE reranker 可选配置

默认使用轻量词面 reranker：

```yaml
reranker_backend: lexical
reranker_model: ""
```

如需启用 BGE reranker，下载模型：

```bash
.venv/bin/huggingface-cli download BAAI/bge-reranker-v2-m3 \
  --local-dir models/huggingface/bge-reranker-v2-m3 \
  --local-dir-use-symlinks False
```

修改配置：

```yaml
retrieval:
  reranker_backend: bge
  reranker_model: models/huggingface/bge-reranker-v2-m3
```

启用 reranker 后重启后端即可，不一定要重建索引；但如果同时换了 embedding 模型，必须重建索引。

## 7. 构建知识库索引

原始知识库放在：

```text
data/raw/
```

当前示例：

```text
data/raw/zju_library_rules.md
```

构建索引：

```bash
PYTHONPATH=src .venv/bin/python3 scripts/build_index.py
```

成功后会生成或更新：

```text
data/index/chunks.json
data/index/embeddings.npy
```

什么时候需要重建索引：

- 新增、删除、修改 `data/raw/` 中的资料。
- 修改 `retrieval.chunk_size` 或 `retrieval.chunk_overlap`。
- 更换 embedding 模型，例如从 `bge-small-zh-v1.5` 换到 `bge-m3`。

## 8. 训练边界二分类器

边界分类器用于判断问题是否属于知识库范围。

- `label: 1` 表示知识库范围内，应进入 RAG。
- `label: 0` 表示范围外，应拒答，不调用大模型。

训练数据位置：

```text
data/boundary/train.jsonl
```

示例：

```json
{"text":"浙江大学图书馆预约图书保留几天","label":1}
{"text":"科技查新需要多久完成","label":1}
{"text":"给我讲个笑话","label":0}
{"text":"选课时间冲突怎么办","label":0}
```

训练命令：

```bash
PYTHONPATH=src .venv/bin/python3 models/train_classifier.py
```

成功后会生成：

```text
models/boundary_classifier/classifier.joblib
```

什么时候需要重训：

- 新增了知识库主题。
- 把项目从“图书馆助手”改成“教务助手”或“新生指南助手”。
- 发现合法问题被误判为超纲。
- 发现超纲问题被放进 RAG 并导致乱答。

边界阈值在 `config/settings.yaml`：

```yaml
boundary_classifier:
  enabled: true
  threshold: 0.55
```

调参建议：

- 合法问题经常被拒答：适当降低 `threshold`，例如 `0.45`。
- 超纲问题经常被放行：适当提高 `threshold`，例如 `0.65`。
- 更推荐先补充 `data/boundary/train.jsonl`，再考虑改阈值。

## 9. 启动后端

```bash
PYTHONPATH=src .venv/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
```

期望返回：

```json
{"ok":true,"app":"xyfRAG"}
```

流式接口测试：

```bash
curl -N -X POST http://127.0.0.1:8000/api/v1/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"query":"浙江大学图书馆预约图书保留几天？","session_id":"demo"}'
```

## 10. 启动前端

进入前端目录：

```bash
cd web
npm install
cp .env.example .env.local
```

确认 `web/.env.local`：

```bash
RAG_BACKEND_URL=http://127.0.0.1:8000
```

启动：

```bash
npm run dev
```

访问：

```text
http://127.0.0.1:3000
```

启动顺序建议：

1. 先启动后端 `127.0.0.1:8000`。
2. 再启动前端 `127.0.0.1:3000`。
3. 前端健康状态显示在线后开始提问。

## 11. 一键启动参考

终端 1：

```bash
cd RAG
PYTHONPATH=src .venv/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

终端 2：

```bash
cd RAG/web
npm run dev
```

## 12. Docker 启动

项目提供 demo compose：

```bash
docker compose -f docker-compose.backend-base.yml build backend-base
docker compose -f docker-compose.demo.yml up --build
```

访问：

```text
http://127.0.0.1:3000
```

注意：Docker 环境如果要使用本地 Hugging Face 模型，需要确认模型目录已被正确复制或挂载。课堂本机演示更推荐直接使用 Python + npm 启动。

## 13. 如何扩充知识库

可以扩充，推荐流程如下：

1. 选择一个连贯主题，不要把无关主题混在一起。
2. 将真实资料整理为 Markdown 或 TXT，放入 `data/raw/`。
3. 每个知识点尽量使用二级标题 `##` 分段。
4. 每段写清楚来源、适用对象、时间、流程、限制条件。
5. 运行索引构建命令。
6. 更新边界分类器训练数据。
7. 重新训练分类器。
8. 启动系统测试。

示例新增文件：

```text
data/raw/zju_library_opening_hours.md
```

推荐写法：

```markdown
# 浙江大学图书馆开放时间

## 紫金港主馆开放时间
来源：https://example.com
紫金港主馆周一至周日 8:00-22:30 开放，法定节假日以图书馆通知为准。

## 玉泉分馆开放时间
来源：https://example.com
玉泉分馆开放时间为工作日 8:30-21:30，寒暑假开放时间另行通知。
```

然后执行：

```bash
PYTHONPATH=src .venv/bin/python3 scripts/build_index.py
PYTHONPATH=src .venv/bin/python3 models/train_classifier.py
```

## 14. 如何扩充二分类器

可以扩充。编辑：

```text
data/boundary/train.jsonl
```

新增范围内样本：

```json
{"text":"预约图书到馆后保留几天","label":1}
{"text":"校外人员能不能进浙江大学图书馆","label":1}
{"text":"馆际互借一次最多能借几本","label":1}
```

新增范围外样本：

```json
{"text":"今天杭州天气怎么样","label":0}
{"text":"帮我写一首诗","label":0}
{"text":"高数补考什么时候报名","label":0}
{"text":"校园卡丢了怎么办","label":0}
```

注意：

- 范围外样本不只是闲聊，也包括其他校园主题。
- 如果当前助手只做图书馆，则教务、宿舍、校园卡、奖学金都应标为 `0`。
- 每次新增知识库主题，都应加入对应的 `label: 1` 问法。
- 每个主题至少准备 10 条以上正例和 10 条以上负例，效果会更稳定。

重训：

```bash
PYTHONPATH=src .venv/bin/python3 models/train_classifier.py
```

## 15. 改完资料后的标准流程

只改知识库：

```bash
PYTHONPATH=src .venv/bin/python3 scripts/build_index.py
```

只改边界训练集：

```bash
PYTHONPATH=src .venv/bin/python3 models/train_classifier.py
```

换 embedding 模型：

```bash
PYTHONPATH=src .venv/bin/python3 scripts/build_index.py
```

换 LLM API Key 或模型名：

```bash
# 修改 .env 或 config/settings.yaml 后重启后端
PYTHONPATH=src .venv/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

改前端 BFF 地址：

```bash
# 修改 web/.env.local 后重启前端
cd web
npm run dev
```

## 16. 验收测试问题

范围内问题：

```text
浙江大学图书馆预约图书保留几天？
图书馆离校手续怎么办理？
科技查新需要多久完成？
校外人员可以进浙江大学图书馆吗？
馆际互借怎么申请？
```

范围外问题：

```text
今天杭州天气怎么样？
选课时间冲突怎么办？
校园卡丢了怎么办？
帮我写一首诗。
推荐一部电影。
```

预期：

- 范围内问题应返回基于资料的回答，并展示引用来源。
- 范围外问题应提示资料库没有相关内容，不应编造。

## 17. 常见问题

### 17.1 前端显示后端离线

检查后端是否启动：

```bash
curl http://127.0.0.1:8000/health
```

检查 `web/.env.local`：

```bash
RAG_BACKEND_URL=http://127.0.0.1:8000
```

### 17.2 BGE 模型加载失败

先确认模型路径：

```bash
ls -lh models/huggingface/bge-small-zh-v1.5
```

再确认配置：

```yaml
retrieval:
  embedding_model: models/huggingface/bge-small-zh-v1.5
```

如果临时不想用本地模型，可以改成：

```yaml
retrieval:
  use_local_models: false
```

然后重建索引：

```bash
PYTHONPATH=src .venv/bin/python3 scripts/build_index.py
```

### 17.3 回答没有引用或引用不相关

优先检查：

- `data/raw/` 是否有相关资料。
- 是否执行了 `scripts/build_index.py`。
- 问题是否被边界分类器正确放行。
- 知识库分段是否过长或主题混杂。

### 17.4 合法问题被拒答

补充正例到 `data/boundary/train.jsonl`：

```json
{"text":"你的合法问题换一种说法","label":1}
```

然后重训：

```bash
PYTHONPATH=src .venv/bin/python3 models/train_classifier.py
```

### 17.5 超纲问题被回答了

补充负例：

```json
{"text":"被误放行的问题","label":0}
```

然后重训。

必要时提高阈值：

```yaml
boundary_classifier:
  threshold: 0.65
```

## 18. 提交前检查

不要提交：

```text
.env
.venv/
web/node_modules/
web/.next/
models/huggingface/
logs/*.log
```

建议提交：

```text
data/raw/*.md
data/boundary/train.jsonl
config/settings.yaml
README.md
USAGE.md
docs/*.md
```

如果修改了知识库并希望同学拉取后立即可用，也可以提交：

```text
data/index/chunks.json
data/index/embeddings.npy
models/boundary_classifier/classifier.joblib
```

提交前建议运行：

```bash
PYTHONPATH=src .venv/bin/python3 -m pytest
cd web
npm run lint
npm run typecheck
npm test
```

## 19. 最短启动命令清单

第一次配置：

```bash
git clone https://github.com/xyf0519/RAG.git
cd RAG
python3 -m venv .venv
.venv/bin/python3 -m pip install --upgrade pip
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 -m pip install -r requirements-local-models.txt
cp .env.example .env
PYTHONPATH=src .venv/bin/python3 scripts/build_index.py
PYTHONPATH=src .venv/bin/python3 models/train_classifier.py
cd web
npm install
cp .env.example .env.local
```

日常启动：

```bash
# terminal 1
cd RAG
PYTHONPATH=src .venv/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# terminal 2
cd RAG/web
npm run dev
```

访问：

```text
http://127.0.0.1:3000
```
