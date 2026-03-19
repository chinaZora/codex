# HR Agent Platform Monorepo

面向 HR 场景的 Agent 平台 MVP，采用 monorepo 组织，包含：

- `apps/api`: FastAPI 聚合层，提供 Agent、知识库、记忆、工具、审计、会话调试等 API。
- `apps/web`: Next.js 管理后台，提供 Dashboard、Agent 管理、Session 调试、知识源、审计日志等页面。
- `packages/*`: 运行时、模型网关、工具中心、知识服务、记忆服务、审计服务、共享 schema、IM adapter 等可复用模块。
- `infra/`: Docker 与开发脚本。
- `docs/`: PRD 与架构文档初稿。

## Quick Start

### 1. 后端

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
make api
```

API 默认启动在 `http://localhost:8000`，OpenAPI 文档位于 `/docs`。

### 2. 前端

```bash
npm install
make web
```

Web 默认启动在 `http://localhost:3000`。

### 3. Demo 数据

```bash
make bootstrap-demo
```

## 目录结构

```text
apps/
  api/
  web/
packages/
  agent-runtime/
  audit-service/
  im-adapter/
  knowledge-service/
  memory-service/
  model-gateway/
  shared-schema/
  tool-hub/
infra/
  docker/
  scripts/
docs/
  prd/
  architecture/
```

## Demo 场景

- 招聘群助手：候选人/JD 查询与群消息总结。
- 制度知识助手：制度问答与引用片段返回。
- 报表总结助手：日报/周报总结与 PPT 大纲草稿生成。

## 部署与运行文档

- 本地部署与运行指南：`docs/deployment/00-本地部署与运行指南.md`
