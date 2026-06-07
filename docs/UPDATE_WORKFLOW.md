# xyfRAG 协作更新工作流

这份文档给共同开发者使用。核心原则是：**后端依赖基础镜像很少重建，业务代码镜像按需重建，配置和运行数据只重启或执行任务**。

## 1. 当前部署形态

严格生产模板使用：

```bash
docker compose --env-file .env.production -f docker-compose.aliyun.yml ...
```

公网 IP 临时验证环境可使用：

```bash
docker compose --env-file .env.public-http -f docker-compose.public-http.yml ...
```

本文后续命令默认沿用 `.env.public-http` + `docker-compose.public-http.yml`。如果切到严格生产模板，把命令里的 `.env.public-http` 换成 `.env.production`，把 `docker-compose.public-http.yml` 换成 `docker-compose.aliyun.yml`。

后端镜像拆成两层：

```text
rag-backend-base:latest   Python + FastAPI + BGE/torch 依赖
rag-backend:latest        app/ src/ config/ scripts/ 等业务代码
```

基础镜像由 `Dockerfile.backend.base` 构建；业务镜像由 `Dockerfile.backend.runtime` 构建。普通 Python 代码更新只需要构建 `rag-backend:latest`，不会重装 torch。

## 2. 更新前检查

进入项目根目录：

```bash
cd /opt/xyfrag/RAG
```

查看当前分支和本地改动：

```bash
git branch --show-current
git status --short
```

不要覆盖不认识的本地改动。看到不属于自己的修改，先确认来源。

查看服务状态：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml ps
curl -fsS http://127.0.0.1/api/health
```

## 3. 第一次部署或依赖变更

只有以下文件变化时，才重建后端基础镜像：

- `Dockerfile.backend.base`
- `requirements.txt`
- `requirements-local-models.txt`
- Python 基础镜像或 pip 镜像源配置

构建基础镜像：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.backend-base.yml build backend-base
```

然后构建并启动业务后端：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --build backend
```

确认当前基础镜像的 torch 运行环境：

```bash
sudo docker run --rm rag-backend-base:latest python -c "import torch; print(torch.__version__); print(torch.cuda.is_available())"
```

## 4. 普通后端代码更新

适用范围：

- `app/`
- `src/`
- `scripts/`
- `models/train_classifier.py`
- 后端 API、认证、RAG 业务逻辑

不要重建基础镜像。只构建业务后端：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --build backend
```

这一步只复制业务代码，正常情况下应明显快于重建基础镜像。

如果后端 API 契约影响前端，再构建 web：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --build backend web
```

## 5. 配置更新

### 5.1 `.env.public-http`

例如：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `SMTP_*`
- `ADMIN_EMAILS`
- `AUTH_SECRET`
- `INTERNAL_API_KEY`

不构建镜像。重建容器实例让环境变量重新注入：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --no-build --force-recreate
```

只影响后端时：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --no-build --force-recreate backend
```

验证码始终随机生成。未配置 SMTP 时，开发环境会把验证码打印到后端日志；公开部署必须配置 SMTP。

### 5.2 `config/settings.yaml`

`docker-compose.public-http.yml` 将配置文件挂载进容器：

```text
./config/settings.yaml:/app/config/settings.yaml:ro
```

只改这个文件不构建镜像。重启后端即可：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml restart backend
```

更稳的方式：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --no-build --force-recreate backend
```

注意：

- 改 `llm.model`、`temperature`、`timeout_seconds`：重启后端生效。
- 改 `retrieval.reranker_backend`：重启后端生效；切到 `bge` 前要先准备 reranker 模型。
- 改 `retrieval.embedding_model`：需要确认索引是否也要按新 embedding 模型重建。
- 改 `boundary_classifier.threshold`：重启后端生效。

## 6. 前端更新

适用范围：

- `web/src/`
- `web/package.json`
- `web/package-lock.json`
- `web/Dockerfile`
- `web/next.config.mjs`

构建 web：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --build web
```

只改后端配置或后端 Python 代码时，不需要构建 web。

## 7. 运行数据更新

### 7.1 知识库文档

生产数据在宿主机持久化目录：

```text
/opt/xyfrag/data
```

更新原始文档后，重建索引：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml exec backend \
  python scripts/build_index.py
```

然后重启后端加载新索引：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml restart backend
```

如果使用管理后台上传文档和触发索引任务，以管理后台结果为准。

### 7.2 边界分类器训练数据

更新训练数据后，重新训练：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml exec backend \
  python models/train_classifier.py
```

然后重启后端：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml restart backend
```

如果使用管理后台触发训练任务，以管理后台结果为准。

## 8. BGE 和效果边界

当前默认链路：

```text
BM25 + SentenceTransformers 加载的 BGE embedding 混合召回 -> lexical reranker -> DeepSeek/OpenAI-compatible LLM
```

当前配置重点：

```yaml
retrieval:
  embedding_backend: sentence_transformer
  embedding_model: models/huggingface/bge-small-zh-v1.5
  reranker_backend: lexical
```

CPU 与 GPU 的 torch wheel 不改变 BGE 模型权重、embedding 维度或召回参数；差异主要是运行设备、镜像大小和安装速度。

查看当前是否 CPU 跑：

```bash
sudo docker exec rag-backend-1 python -c "import torch; print(torch.__version__); print(torch.cuda.is_available())"
```

查看 BGE 加载日志：

```bash
sudo docker logs --tail 200 rag-backend-1 | grep -E "SentenceTransformer|BGE|reranker|fallback|Use pytorch"
```

如果未来启用 BGE reranker：

```yaml
retrieval:
  reranker_backend: bge
  reranker_model: models/huggingface/bge-reranker-base
```

先把 reranker 模型放到：

```text
/opt/xyfrag/models/huggingface/bge-reranker-base
```

再重启后端并看日志确认没有 fallback。

## 9. 连通性测试

主链路健康检查：

```bash
curl -fsS http://127.0.0.1/api/health
```

期望返回：

```json
{"ok":true,"app":"Maverella web","backend":{"ok":true,"app":"Maverella"}}
```

前端设置弹窗里的连通性测试是辅助功能，不等同于真实问答链路：

- RAG 服务测试是在 Next.js 容器里发起的，容器内地址应是 `http://backend:8000`，不是 `http://127.0.0.1:8000`。
- 模型 API 测试使用设置弹窗输入的 API Key，只测试 `/models` 可访问性。
- 真实问答目前使用服务器 env 文件中的 `OPENAI_API_KEY`。

## 10. 发布后验证

查看容器状态：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml ps
```

查看日志：

```bash
sudo docker logs --tail 120 rag-backend-1
sudo docker logs --tail 120 rag-web-1
```

验证健康接口：

```bash
curl -fsS http://127.0.0.1/api/health
```

验证真实问答后，后端日志中应看到：

```text
POST /api/v1/chat/stream
```

如果配置了真实 LLM API，还应看到 provider 的 `/chat/completions` 成功日志。

## 11. 快速决策表

| 改动内容 | 构建基础镜像 | 构建业务镜像 | 推荐动作 |
| --- | --- | --- | --- |
| `.env.public-http` / `.env.production` | 否 | 否 | `up -d --no-build --force-recreate` |
| `config/settings.yaml` | 否 | 否 | `restart backend` |
| 后端 Python 代码 | 否 | 是 | `up -d --build backend` |
| 前端代码 | 否 | web | `up -d --build web` |
| `requirements*.txt` | 是 | 是 | 先 build `backend-base`，再 build `backend` |
| `Dockerfile.backend.base` | 是 | 是 | 先 build `backend-base`，再 build `backend` |
| `Dockerfile.backend.runtime` | 否 | 是 | `up -d --build backend` |
| 知识库原文 | 否 | 否 | 重建索引后重启 |
| 边界训练数据 | 否 | 否 | 重新训练后重启 |

## 12. 回滚

如果只是配置改错，恢复配置后重启后端。不要用 `git reset --hard` 清空工作区，除非确认没有别人的本地改动。

如果新业务镜像有问题，先查看日志：

```bash
sudo docker logs --tail 200 rag-backend-1
```

需要回退代码时，回到明确的 Git 提交后重新构建业务镜像：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --build backend
```

如果基础镜像依赖本身有问题，回退 `requirements*.txt` 或 `Dockerfile.backend.base`，重新构建 `backend-base`，再构建 `backend`。
