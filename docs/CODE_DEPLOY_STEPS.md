# 改完代码后的构建与上线步骤

这份文档给日常改代码后使用。公网 HTTP 验证环境可使用：

```bash
ENV_FILE=.env.public-http
COMPOSE_FILE=docker-compose.public-http.yml
```

如果以后切到严格生产模板，把下面命令里的 `.env.public-http` 换成 `.env.production`，把 `docker-compose.public-http.yml` 换成 `docker-compose.aliyun.yml`。

## 1. 进入项目目录

```bash
cd /opt/xyfrag/RAG
```

查看当前服务状态：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml ps
curl -fsS http://127.0.0.1/api/health
```

## 2. 只改后端 Python 代码

适用范围：

- `app/`
- `src/`
- `scripts/`
- `models/`
- `config/` 中会被复制进镜像的代码类文件

构建并上线后端：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --build backend
```

这个命令会使用已有的 `rag-backend-base:latest`，不会重新安装 torch、transformers、FlagEmbedding 等大依赖。普通代码更新只复制业务代码，通常明显快于重建基础镜像。

如果要使用严格生产模板：

```bash
sudo docker compose --env-file .env.production -f docker-compose.aliyun.yml up -d --build backend
```

## 3. 只改前端代码

适用范围：

- `web/src/`
- `web/app/`
- `web/components/`
- `web/package.json`
- `web/package-lock.json`
- `web/Dockerfile`

构建并上线前端：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --build web
```

## 4. 前后端都改了

构建并上线后端和前端：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --build backend web
```

一般不需要重启 nginx。只有改了 `deploy/nginx.aliyun.conf` 或证书挂载时，才重新创建 nginx：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --no-build --force-recreate nginx
```

## 5. 改了后端依赖

只有改了这些文件时才重建基础镜像：

- `requirements.txt`
- `requirements-local-models.txt`
- `Dockerfile.backend.base`

先重建后端基础镜像：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.backend-base.yml build backend-base
```

再构建并上线后端业务镜像：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --build backend
```

注意：这一步会重新安装大依赖，可能需要几十分钟。普通代码更新不要执行这一节。

## 6. 只改运行配置

### `.env.public-http`

不构建镜像，重新创建容器让环境变量生效：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --no-build --force-recreate
```

只影响后端时：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --no-build --force-recreate backend
```

### `config/settings.yaml`

这个文件是挂载进后端容器的，不需要构建镜像。重启后端即可：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml restart backend
```

## 7. 上线后验证

查看容器状态：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml ps
```

健康检查：

```bash
curl -fsS http://127.0.0.1/api/health
```

查看后端日志：

```bash
sudo docker logs --tail 120 rag-backend-1
```

查看前端日志：

```bash
sudo docker logs --tail 120 rag-web-1
```

确认后端当前镜像：

```bash
sudo docker image ls rag-backend
sudo docker ps --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Status}}'
```

## 8. 保持快速构建

不要清理下面两个内容，否则下一次后端构建会变慢：

- `rag-backend-base:latest`
- Docker BuildKit 构建缓存

检查基础镜像是否还在：

```bash
sudo docker image ls rag-backend-base
```

如果被清理掉了，重新执行：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.backend-base.yml build backend-base
```

然后再执行后端上线命令：

```bash
sudo docker compose --env-file .env.public-http -f docker-compose.public-http.yml up -d --build backend
```
