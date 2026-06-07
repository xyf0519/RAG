# 分支职责说明

`main` 是产品主干，默认保持 Web 工作台 + FastAPI RAG 后端的通用运行形态。通用产品能力、通用 UI 改进、测试和可选部署模板可以进入 `main`。

## main

保留：

- 邮箱注册登录、Session、用户资料和头像。
- 管理员、用户运维、知识库、文档上传/删除、索引、边界训练和 RAG 问答。
- 移动端和桌面浏览器都适用的响应式 Web UI。
- 默认 Docker、内网部署和可选公开部署模板。

不默认启用：

- 桌面端跳过登录或单用户权限模型。
- 阿里云某台机器的私有配置。
- `.env.production`、`.env.public-http`、安装包、构建产物和运行数据。

## feature/mobile-web-adaptation

移动端 Web 适配属于通用用户体验，确认不破坏桌面布局后可以合入 `main`。

## feature/web-aliyun-ecs-production

阿里云 ECS 公开部署分支。适合从中吸收部署模板、文档、备份脚本和环境示例。不要用该分支的环境假设覆盖 `main` 的默认开发和内网运行路径。

## feature/desktop-electron-local-rag

Electron 桌面端分支。桌面专用能力必须用 `APP_MODE=desktop` 或等价条件隔离，包括本机用户、跳过登录、Electron 打包、PyInstaller 后端和本地模型下载。合入 `main` 时不能改变默认 Web 鉴权和多用户权限模型。

## local/localhost-current

本地开发快照和说明分支。可吸收有价值的本地启动文档，但不作为长期功能开发主线。
