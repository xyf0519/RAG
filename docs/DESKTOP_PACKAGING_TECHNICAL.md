# 桌面 App 打包技术说明

本文档说明 `feature/desktop-electron-local-rag` 分支当前如何把 xyfRAG 打包为桌面 App。

## 总体方案

桌面版采用三层组合：

- Electron 作为桌面壳，负责窗口、进程管理和安装包生成。
- Next.js 作为本机前端工作台，仍以 `next start` 方式在本机端口运行。
- FastAPI/RAG 后端使用 PyInstaller 打成独立二进制，由 Electron 启动。

最终用户打开 App 后，本机实际会启动两个 localhost 服务：

```text
FastAPI/RAG  http://127.0.0.1:8765
Next.js      http://127.0.0.1:3765
```

Electron 窗口加载 `http://127.0.0.1:3765`，用户看到的是桌面模式工作台。

## 前端打包

前端位于 `web/`，桌面构建使用：

```bash
cd web
npm run build:desktop
```

该命令设置：

```text
APP_MODE=desktop
NEXT_PUBLIC_APP_MODE=desktop
```

桌面模式下前端会：

- 跳过邮箱登录，使用内置本机用户 `desktop-local-user`。
- 隐藏管理员、用户运维、权限管理入口。
- 保留个人知识库、文档上传、索引构建和 RAG 问答功能。
- 使用桌面设置接口保存用户自己的 OpenAI/DeepSeek 兼容 API Key。

## 后端二进制

后端入口文件是：

```text
desktop/backend_entry.py
```

它做了几件事：

- 设置 `APP_MODE=desktop` 和 `XYFRAG_DESKTOP=1`。
- 设置 `XYFRAG_PROJECT_ROOT`，让后端从 App 包内资源读取配置和默认资料。
- 设置 `XYFRAG_DATA_DIR`、`XYFRAG_MODELS_DIR`、`XYFRAG_LOGS_DIR`，让用户数据写到本机应用数据目录。
- 首次启动时复制默认资料，创建默认知识库并构建索引。
- 启动 FastAPI app。

PyInstaller 构建脚本是：

```text
scripts/build_desktop_backend.sh
```

核心命令使用 `--onefile`：

```bash
python -m PyInstaller \
  --onefile \
  --name xyfrag-backend \
  --paths "$ROOT" \
  --paths "$ROOT/src" \
  --add-data "$ROOT/app:app" \
  --add-data "$ROOT/config:config" \
  --add-data "$ROOT/data/raw:data/raw" \
  "$ROOT/desktop/backend_entry.py"
```

生成结果会复制到：

```text
web/build/backend/xyfrag-backend
```

Electron Builder 再把它放进 App 包：

```text
xyfRAG.app/Contents/Resources/backend/xyfrag-backend
```

用户机器不需要安装 Python、`.venv` 或后端 pip 依赖。

## Electron 进程管理

Electron 主进程文件是：

```text
web/electron/main.cjs
```

启动流程：

1. 创建窗口并显示本地启动页。
2. 查找包内后端二进制 `Resources/backend/xyfrag-backend`。
3. 启动后端并等待 `127.0.0.1:8765` 可连接。
4. 使用 Electron 自带 Node 运行 `next start`，等待 `127.0.0.1:3765` 可连接。
5. 窗口跳转到 Next.js 工作台。

开发模式下，如果没有包内后端二进制，Electron 会回退到 `.venv/bin/python3` 或系统 `python3` 运行 `uvicorn app.main:app`。

打包模式下，子进程日志写入：

```text
~/Library/Application Support/xyfRAG/rag-data/logs/desktop-processes.log
```

## Electron Builder 配置

配置写在 `web/package.json` 的 `build` 字段。

关键配置：

```json
{
  "appId": "cn.xyfrag.desktop",
  "productName": "xyfRAG",
  "asar": false,
  "directories": {
    "output": "dist"
  }
}
```

打包进 App 的前端资源：

```text
.next/
public/
electron/
package.json
node_modules/
```

额外资源：

```text
build/backend -> Resources/backend
../app        -> Resources/rag/app
../config     -> Resources/rag/config
../data/raw   -> Resources/rag/data/raw
../src        -> Resources/rag/src
```

当前 `asar` 设为 `false`，原因是 Next.js 和后端 sidecar 都需要直接访问文件路径。后续可优化为启用 `asar` 并用 `asarUnpack` 只解包必要资源。

## 数据目录

安装包内资源只作为只读模板。用户数据写入系统应用数据目录。

macOS：

```text
~/Library/Application Support/xyfRAG/rag-data/
```

Windows：

```text
%APPDATA%\xyfRAG\rag-data\
```

目录结构：

```text
rag-data/
  data/
    raw/
    knowledge_bases/
    ops.sqlite3
  models/
  logs/
```

这样做的目的：

- App 升级时不覆盖用户数据。
- 用户上传的文档、索引、设置和 SQLite 数据库都保存在个人目录。
- DMG/EXE 不依赖开发机路径。

## 模型策略

当前桌面包不内置 BGE 1.5，也不会自动在线下载 BGE。

桌面模式默认设置：

```text
XYFRAG_RETRIEVAL_USE_LOCAL_MODELS=0
XYFRAG_BOUNDARY_ENABLED=0
```

因此默认检索方案是：

- embedding：本地 hashing embedding
- reranker：lexical overlap reranker
- boundary classifier：关闭

这样可以保证 App 下载后直接进入工作台，不需要模型权重、GPU、Torch 或 FlagEmbedding。

LLM 生成答案仍通过 OpenAI/DeepSeek 兼容接口。用户可在桌面设置中填写：

- API Key
- Base URL
- Model

未配置 API Key 时，系统使用本地抽取式回答 fallback。

## 构建命令

macOS DMG：

```bash
cd web
npm run desktop:dist:mac
```

该命令等价于：

```bash
npm run build:desktop
npm run desktop:backend
electron-builder --mac dmg
```

Windows EXE：

```bash
cd web
npm run desktop:dist:win
```

Windows 产物需要在 Windows 环境构建，因为 PyInstaller 后端二进制和 Electron native 包都与平台相关。

## 已验证行为

当前 macOS 构建已验证：

- DMG 能成功生成。
- DMG 校验有效。
- App 包内存在 `Resources/backend/xyfrag-backend`。
- 将 App 复制到临时目录后仍能启动，说明不依赖开发机项目路径。
- 启动后 `127.0.0.1:8765/health` 可响应。
- 前端 `127.0.0.1:3765/api/auth/session` 返回桌面本机用户。

## 当前限制

- macOS 未做 Developer ID 签名和 notarization，分发给陌生机器时可能需要用户右键打开。
- 后端目前使用 PyInstaller `--onefile`，每次启动会先解压运行时，因此冷启动时间相对固定。
- Windows EXE 仍需在 Windows 环境单独构建和验证。
- BGE、本地大模型、Torch 等重量级模型依赖未放入安装包。

## 后续优化

- 将 PyInstaller 从 `onefile` 改为 `onedir`，减少每次启动解压开销。
- 增加本地模型下载/导入界面，把 BGE 作为可选增强能力。
- 配置 macOS 图标、签名和 notarization。
- 增加 Windows 构建脚本和 NSIS 安装验证。
- 启用 `asar` 并精确 `asarUnpack`，减小包结构暴露面。
