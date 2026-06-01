# Localhost 使用说明

本分支 `local/localhost-current` 保存当前本地开发和演示版本。它保留现有 Next.js 工作台、FastAPI RAG 后端、邮箱登录、管理员、知识库管理和边界训练能力，不包含阿里云生产部署或桌面打包改造。

## 1. 后端环境

```bash
python3 -m venv .venv
.venv/bin/python3 -m pip install --upgrade pip
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 -m pip install -r requirements-local-models.txt
cp .env.localhost.example .env
```

如需本地 BGE embedding，下载模型到默认目录：

```bash
mkdir -p models/huggingface
.venv/bin/huggingface-cli download BAAI/bge-small-zh-v1.5 \
  --local-dir models/huggingface/bge-small-zh-v1.5 \
  --local-dir-use-symlinks False
```

初始化边界分类器和默认知识库索引：

```bash
PYTHONPATH=src .venv/bin/python3 models/train_classifier.py
PYTHONPATH=src .venv/bin/python3 scripts/build_index.py
```

启动后端：

```bash
PYTHONPATH=src .venv/bin/python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## 2. 前端环境

```bash
cd web
npm install
cp .env.localhost.example .env.local
npm run dev
```

访问：

```text
http://127.0.0.1:3000
```

## 3. 本地登录

`.env.localhost.example` 默认使用：

```bash
AUTH_DEV_CODE=123456
ALLOWED_EMAIL_DOMAIN=zju.edu.cn
ADMIN_EMAILS=admin@zju.edu.cn
```

注册时使用任意 `@zju.edu.cn` 邮箱，并输入验证码 `123456`。`ADMIN_EMAILS` 中的邮箱会自动成为管理员。

## 4. 本地质量检查

```bash
PYTHONPATH=src .venv/bin/python3 -m pytest
cd web
npm run lint
npm run typecheck
npm test
```

