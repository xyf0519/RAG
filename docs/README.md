# xyfRAG 文档入口

当前分支：`feature/web-aliyun-ecs-production`

这个分支面向 Aliyun ECS + Docker Compose + Nginx 的公开 Web App 部署。后端镜像拆成两层：

```text
rag-backend-base:latest   Python + FastAPI + BGE/torch 依赖
rag-backend:latest        app/ src/ config/ scripts/ 等业务代码
```

普通代码更新只重建 `rag-backend:latest`，不要重建基础镜像；只有 `requirements*.txt` 或 `Dockerfile.backend.base` 变化时才重建 `rag-backend-base:latest`。

## 直接部署

从新 ECS 或干净环境开始，按这份文档执行：

- [Aliyun ECS Web 部署说明](ALIYUN_ECS_DEPLOY.md)

核心命令如下：

```bash
cd /opt/xyfrag/RAG
cp .env.production.example .env.production
# 编辑 .env.production，填入 OPENAI_API_KEY、AUTH_SECRET、INTERNAL_API_KEY、ADMIN_EMAILS、SMTP_* 等

sudo mkdir -p /opt/xyfrag/data /opt/xyfrag/models /opt/xyfrag/logs /opt/xyfrag/backups
sudo chown -R "$USER":"$USER" /opt/xyfrag

sudo docker compose --env-file .env.production -f docker-compose.backend-base.yml build backend-base
sudo docker compose --env-file .env.production -f docker-compose.aliyun.yml up -d --build
curl -fsS http://127.0.0.1/api/health
```

如果只是按公网 IP 临时验证，也可以使用：

- `.env.public-http.example`
- `docker-compose.public-http.yml`
- [改完代码后的构建与上线步骤](CODE_DEPLOY_STEPS.md)

## 日常维护

- [改完代码后的构建与上线步骤](CODE_DEPLOY_STEPS.md)：改代码后构建、上线、验证。
- [协作更新工作流](UPDATE_WORKFLOW.md)：多人协作时如何判断是否需要重建基础镜像、如何处理配置和运行数据。
- [新手启动与扩展指南](NEW_USER_GUIDE.md)：本地开发、模型、知识库、边界分类器和扩展说明。

## 部署文件

部署相关文件必须和文档一起保留：

```text
Dockerfile.backend.base
Dockerfile.backend
web/Dockerfile
docker-compose.backend-base.yml
docker-compose.aliyun.yml
docker-compose.public-http.yml
.env.production.example
.env.public-http.example
.dockerignore
deploy/nginx.aliyun.conf
```

其中 `.env.production`、`.env.public-http` 是本机私密配置文件，不应提交。
