# Aliyun ECS Web 部署说明

本分支 `feature/web-aliyun-ecs-production` 面向公开 Web App 上线。部署形态为 Aliyun ECS + Docker Compose + Nginx，FastAPI 与 Next.js 只在 Docker 内网通信，公网只开放 Nginx。

文档入口见 [docs/README.md](README.md)。日常改代码后的构建和上线命令见 [改完代码后的构建与上线步骤](CODE_DEPLOY_STEPS.md)。

## 1. ECS 准备

在 ECS 上安装 Docker 和 Docker Compose 插件后，创建持久化目录：

```bash
sudo mkdir -p /opt/xyfrag/data /opt/xyfrag/models /opt/xyfrag/logs /opt/xyfrag/backups
sudo chown -R "$USER":"$USER" /opt/xyfrag
```

安全组至少开放：

```text
80/tcp
443/tcp
22/tcp
```

## 2. 配置生产环境

```bash
cp .env.production.example .env.production
```

必须填写：

```bash
OPENAI_API_KEY
AUTH_SECRET
INTERNAL_API_KEY
ADMIN_EMAILS
SMTP_HOST
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
```

验证码始终随机生成。生产环境必须配置 SMTP，才能把注册和重置密码验证码发送给用户。

`ADMIN_EMAILS` 里的邮箱注册或登录后自动成为核心管理员。学生注册域名由 `ALLOWED_EMAIL_DOMAIN=zju.edu.cn` 控制。

`.env.production.example` 默认使用 DaoCloud Docker Hub 镜像源和阿里云 PyPI 源，适合当前 ECS 网络环境。如果服务器可以稳定访问 Docker Hub 和 PyPI，可按需切回官方源。

## 3. 启动

```bash
cd /opt/xyfrag/RAG
sudo docker compose --env-file .env.production -f docker-compose.backend-base.yml build backend-base
sudo docker compose --env-file .env.production -f docker-compose.aliyun.yml up -d --build
```

查看状态：

```bash
sudo docker compose --env-file .env.production -f docker-compose.aliyun.yml ps
curl -fsS http://127.0.0.1/api/health
sudo docker compose --env-file .env.production -f docker-compose.aliyun.yml logs -f backend
sudo docker compose --env-file .env.production -f docker-compose.aliyun.yml logs -f web
```

浏览器访问 ECS 公网 IP 或绑定域名。首次使用 `ADMIN_EMAILS` 中的邮箱注册，验证码通过 SMTP 发送。

## 4. HTTPS

最简单的 v1 方式是先在 Aliyun SLB/CDN 做 HTTPS 终止，再转发到 ECS 的 80 端口。

如果直接在容器内终止 HTTPS，将证书放入 `deploy/certs/`，再扩展 `deploy/nginx.aliyun.conf` 的 443 server block。

## 5. 备份

SQLite、上传文档、知识库索引和模型都保存在 ECS 持久化目录：

```text
/opt/xyfrag/data
/opt/xyfrag/models
/opt/xyfrag/logs
```

手动备份：

```bash
XYFRAG_DATA_DIR=/opt/xyfrag/data \
XYFRAG_MODELS_DIR=/opt/xyfrag/models \
XYFRAG_BACKUPS_DIR=/opt/xyfrag/backups \
scripts/backup_ops_data.sh
```

建议用 cron 每天备份一次，并同步到 OSS。

## 6. 验收清单

- `sudo docker compose --env-file .env.production -f docker-compose.aliyun.yml ps` 中 backend、web、nginx 均为 Up。
- `curl -fsS http://127.0.0.1/api/health` 返回 `ok: true`。
- 普通 `@zju.edu.cn` 邮箱可以注册、登录和问答。
- 非 `@zju.edu.cn` 邮箱注册被拒绝。
- `ADMIN_EMAILS` 中的邮箱登录后显示知识库管理、边界训练和用户运维。
- 普通用户无法调用管理员 API。
- 重启 ECS 或容器后，用户、文档、索引和模型仍存在。
- `.env.production` 中配置了可用 SMTP，验证码邮件可以正常收到。
