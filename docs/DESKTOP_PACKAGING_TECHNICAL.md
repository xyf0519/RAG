# 桌面 App 打包技术说明

本文档说明 `feature/desktop-electron-local-rag` 分支当前如何把 Maverella 打包为桌面 App。

## 总体方案

桌面版采用三层组合：

- Electron 作为桌面壳，负责窗口、进程管理和安装包生成。
- Next.js 作为本机前端工作台，以 `next start` 方式运行在本机端口。
- FastAPI/RAG 后端使用 PyInstaller 打成独立二进制，由 Electron 启动。

最终用户打开 App 后，本机会启动两个 localhost 服务：

```text
FastAPI/RAG  http://127.0.0.1:8765
Next.js      http://127.0.0.1:3765
```

Electron 窗口加载 `http://127.0.0.1:3765`，用户看到的是桌面模式工作台。

## 前端构建

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
- 在设置面板提供 BGE 1.5 / BGE 3.0 下载和启用入口。

## 后端二进制

后端入口文件是：

```text
desktop/backend_entry.py
```

它负责：

- 设置 `APP_MODE=desktop` 和 `XYFRAG_DESKTOP=1`。
- 设置 `XYFRAG_PROJECT_ROOT`，让后端从 App 包内资源读取配置和默认资料。
- 设置 `XYFRAG_DATA_DIR`、`XYFRAG_MODELS_DIR`、`XYFRAG_LOGS_DIR`，让用户数据写到本机应用数据目录。
- 首次启动时复制默认资料，创建默认知识库并构建索引。
- 读取桌面设置中的 API 与 embedding 模型配置。
- 启动 FastAPI app。

跨平台 PyInstaller 构建脚本是：

```text
scripts/build_desktop_backend.mjs
```

macOS 兼容入口仍保留：

```text
scripts/build_desktop_backend.sh
```

实际核心命令由 Node 脚本拼装，关键参数包括：

```text
python -m PyInstaller
  --onefile
  --name maverella-backend
  --paths <repo>
  --paths <repo>/src
  --add-data <repo>/app:app
  --add-data <repo>/config:config
  --add-data <repo>/data/raw:data/raw
  desktop/backend_entry.py
```

Windows 上 `--add-data` 自动使用 `;` 分隔符，生成文件名为：

```text
web/build/backend/maverella-backend.exe
```

macOS 上生成文件名为：

```text
web/build/backend/maverella-backend
```

Electron Builder 再把它放进 App 包：

```text
Maverella.app/Contents/Resources/backend/maverella-backend
```

用户机器不需要安装 Python、`.venv` 或后端 pip 依赖。

## BGE 模型策略

安装包默认不捆绑 BGE 权重。用户进入设置面板后可联网下载：

- 默认：BGE 1.5，对应 Hugging Face repo `BAAI/bge-small-zh-v1.5`。
- 可选：BGE 3.0，对应 Hugging Face repo `BAAI/bge-m3`。

模型文件保存到桌面用户数据目录：

```text
rag-data/models/huggingface/
```

下载并启用模型后，后端会：

1. 写入 `desktop-settings.json`。
2. 设置 embedding 为本地 BGE 路径。
3. 保持 reranker 为 lexical。
4. 清空当前 RAG service cache。
5. 重建默认知识库索引。

如果构建后端时已安装 `requirements-local-models.txt`，`scripts/build_desktop_backend.mjs` 会自动把 `FlagEmbedding`、`sentence-transformers`、`transformers`、`tokenizers`、`safetensors`、`torch` 收进 PyInstaller 包。否则下载卡片会提示当前桌面后端未包含 BGE 运行库，App 仍可使用轻量 hashing embedding。

构建包含 BGE 运行库的桌面包：

```bash
python3 -m venv .venv
.venv/bin/python3 -m pip install -r requirements.txt
.venv/bin/python3 -m pip install -r requirements-local-models.txt
cd web
npm run desktop:dist:mac
```

Windows 同理在 Windows 环境安装依赖后运行：

```powershell
cd web
npm run desktop:dist:win
```

## Electron 进程管理

Electron 主进程文件是：

```text
web/electron/main.cjs
```

启动流程：

1. 创建窗口并显示本地启动页。
2. 查找包内后端二进制 `Resources/backend/maverella-backend` 或 `maverella-backend.exe`。
3. 启动后端并等待 `127.0.0.1:8765` 可连接。
4. 使用 Electron 自带 Node 运行 `next start`，等待 `127.0.0.1:3765` 可连接。
5. 窗口跳转到 Next.js 工作台。

开发模式下，如果没有包内后端二进制，Electron 会回退到 `.venv/bin/python3` 或系统 `python3` 运行 `uvicorn app.main:app`。

打包模式下，子进程日志写入：

```text
~/Library/Application Support/Maverella/rag-data/logs/desktop-processes.log
```

## Electron Builder 配置

配置写在 `web/package.json` 的 `build` 字段。

关键配置：

```json
{
  "appId": "cn.maverella.desktop",
  "productName": "Maverella",
  "asar": false,
  "mac": {
    "target": ["dmg"],
    "icon": "build/icon.icns"
  },
  "win": {
    "target": ["nsis"],
    "icon": "build/icon.ico"
  }
}
```

图标来源：

```text
web/public/images/icon.png
```

构建仓库中派生并提交：

```text
web/build/icon.png
web/build/icon.icns
web/build/icon.ico
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
~/Library/Application Support/Maverella/rag-data/
```

Windows：

```text
%APPDATA%\Maverella\rag-data\
```

目录结构：

```text
rag-data/
  data/
    raw/
    knowledge_bases/
    ops.sqlite3
    desktop-settings.json
  models/
    huggingface/
  logs/
```

这样做的目的：

- App 升级时不覆盖用户数据。
- 用户上传的文档、索引、设置和 SQLite 数据库都保存在个人目录。
- DMG/EXE 不依赖开发机路径。

## 构建命令

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

Windows 产物必须在 Windows 环境构建，因为 PyInstaller 需要生成 `maverella-backend.exe`，Electron native 包也与平台相关。macOS 上运行该命令会被 `scripts/assert_windows_build.mjs` 阻止，避免生成看似完整但后端不可执行的安装包。

## 已验证行为

当前 macOS 构建目标：

- DMG 能成功生成。
- App 包内存在 `Resources/backend/maverella-backend`。
- 将 App 复制到其他目录后仍能启动，不依赖开发机项目路径。
- 启动后 `127.0.0.1:8765/health` 可响应。
- 前端 `127.0.0.1:3765/api/auth/session` 返回桌面本机用户。

## 当前限制

- macOS 未做 Developer ID 签名和 notarization，分发给陌生机器时可能需要用户右键打开。
- 后端目前使用 PyInstaller `--onefile`，每次启动会先解压运行时，因此冷启动时间相对固定。
- Windows EXE 仍需在 Windows 环境单独构建和验证。
- BGE 权重不随 DMG/EXE 分发，首次使用本地 BGE 时需要联网下载。

## 后续优化

- 将 PyInstaller 从 `onefile` 改为 `onedir`，减少每次启动解压开销。
- 配置 macOS Developer ID 签名和 notarization。
- 增加 Windows CI 构建与 NSIS 安装验证。
- 启用 `asar` 并精确 `asarUnpack`，减小包结构暴露面。
