# 桌面端开发与打包

本分支 `feature/desktop-electron-local-rag` 将 Maverella 做成本机单用户桌面应用。Electron 启动本地 FastAPI/RAG 后端，再打开桌面模式的 Next.js 工作台。

## 功能边界

- 无登录流程，启动后直接进入本机用户工作台。
- 隐藏用户运维、权限分配等管理员功能。
- 保留个人资料库：创建知识库、上传 Markdown/TXT、构建索引、选择知识库问答。
- 设置面板保存 OpenAI/DeepSeek 兼容 API Key、Base URL 和模型名到本机数据目录。
- 设置面板可联网下载并启用 BGE 1.5 或 BGE 3.0，本地模型文件保存在用户数据目录。
- 不内置大语言模型；未配置 API Key 时使用本地抽取式回答。

## 本地开发

后端依赖：

```bash
python3 -m venv .venv
.venv/bin/python3 -m pip install --upgrade pip
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 -m pip install -r requirements-local-models.txt
```

前端与 Electron 依赖：

```bash
cd web
npm install
```

构建桌面模式前端并启动 Electron：

```bash
cd web
npm run build:desktop
npm run desktop:dev
```

Electron 默认端口：

```text
FastAPI  http://127.0.0.1:8765
Next.js  http://127.0.0.1:3765
```

## 打包

macOS DMG：

```bash
cd web
npm run desktop:dist:mac
```

Windows EXE 安装包，需要在 Windows 环境执行：

```bash
cd web
npm run desktop:dist:win
```

通用构建：

```bash
cd web
npm run desktop:dist
```

产物输出到：

```text
web/dist/
```

打包命令会先运行 `scripts/build_desktop_backend.mjs`，用 PyInstaller 生成 `web/build/backend/maverella-backend` 或 `maverella-backend.exe`，再把它放进安装包。用户打开 App 时不需要手动安装 Python 或后端依赖。

## 首次启动

- App 会创建本机数据目录，并自动复制默认资料、创建默认知识库、构建索引。
- 桌面模式默认关闭边界分类器，个人资料库问题会直接进入检索问答。
- 首次启动不强制下载 BGE 模型；默认使用内置 hashing embedding 与 lexical reranker，保证直接进入工作台。
- 桌面日志写入 macOS `~/Library/Application Support/Maverella/rag-data/logs/`，便于排查启动失败。

## 注意

- Windows 和 macOS 最好分别在对应系统上构建，以减少签名、权限和二进制兼容问题。
- 模型权重默认不捆绑进安装包，用户可在设置面板按需下载到桌面数据目录或使用 hashing fallback。
