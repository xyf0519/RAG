# 桌面端开发与打包

本分支 `feature/desktop-electron-local-rag` 将 xyfRAG 做成本机单用户桌面应用。Electron 启动本地 FastAPI/RAG 后端，再打开桌面模式的 Next.js 工作台。

## 功能边界

- 无登录流程，启动后直接进入本机用户工作台。
- 隐藏用户运维、权限分配等管理员功能。
- 保留个人资料库：创建知识库、上传 Markdown/TXT、构建索引、选择知识库问答。
- 设置面板保存 OpenAI/DeepSeek 兼容 API Key、Base URL 和模型名到本机数据目录。
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

Windows EXE 安装包：

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

## 注意

- 当前打包脚本会把 Python 后端源码、默认资料和前端产物放进安装包，但目标机器仍需要可用 Python 运行时，或后续改成 PyInstaller/Nuitka 打包后端二进制。
- Windows 和 macOS 最好分别在对应系统上构建，以减少签名、权限和二进制兼容问题。
- 模型权重默认不捆绑进安装包，用户可按需下载到桌面数据目录或使用 hashing fallback。
