# LifeBook 人生之书 · Personal Memory Agent

LifeBook 是一个面向个人长期记忆场景的 AI Agent 应用原型。项目以自然聊天为入口，帮助用户把零散生活片段整理为可确认、可检索、可回看的长期记忆。

本版本将原先固定顺序的 AI API 调用链升级为 **Personal Memory Agent**：LLM 不再每轮固定执行完整管线，而是通过 `AgentLoop + ToolRegistry` 按输入类型选择工具，例如记忆检索、时间轴查询、对话式澄清、候选记忆生成或直接回复。

> 当前状态：Agent stable / demo-ready version。适合本地运行、项目展示、简历与实训提交；尚未定位为生产级多用户服务。

---

## 核心能力

- **Agent 工具调用循环**：基于 `AgentLoop` 实现 Thought / Action / Observation 多步执行。
- **ToolRegistry 执行约束**：统一管理工具注册、schema 校验、风险拦截和 blocked tools。
- **长期记忆写入边界**：Agent 只能写入 `pending_user_confirmation` 候选记忆，不能直接写 `confirmedFacts`。
- **分层记忆检索**：`MemoryStore` 为搜索结果标记 `memoryLayer`、`trustLevel`、`answerPolicy`，区分 confirmed facts、saved memories、pending candidates、daily logs、photos 和 summaries。
- **对话式澄清**：支持 person alias、time ambiguity、pronoun reference、timeline conflict 等 clarification 类型。
- **时间轴查询**：支持按人物查询 timeline，包含 `timeRange`、fuzzy items 和 potential conflicts。
- **SSE 流式 Agent 反馈**：提供 `/api/agent/stream`，可向前端返回 step / final / error 事件。
- **移动端产品壳**：保留原 `app.html` 主前端与 Capacitor iOS 封装链路。
- **Eval / Smoke 测试**：覆盖 prompt injection、candidate answer policy、alias、timeline、clarification、policy gate 等关键边界。

---

## 技术栈

| 模块 | 技术 |
|---|---|
| 后端 | Node.js, Express |
| 大模型 | DeepSeek API |
| Agent | AgentLoop, ToolRegistry, LifebookTools |
| 记忆检索 | MemoryStore, layered retrieval, alias expansion |
| 前端 | HTML, CSS, JavaScript |
| 移动端 | Capacitor, iOS |
| 数据存储 | Local JSON state |
| 测试 | Node scripts, smoke tests, eval harness |

---

## 项目结构

```text
.
├── app.html                    # 主聊天 App / Capacitor 入口页面
├── memory.html                 # 忆光：写记忆入口
├── memory-map.html             # 记忆图谱与时间线页面
├── index.html                  # 封面页
├── setting.html                # 设置页
├── server.js                   # Express 后端与 AI API / Agent API
├── agent/
│   ├── AgentLoop.js            # Agent 主循环
│   ├── ToolRegistry.js         # 工具注册、schema 校验、risk gate
│   ├── LifebookTools.js        # search_memory / get_timeline / clarification 等工具
│   └── AgentTrace.js           # Agent trace 清洗与记录
├── memory/
│   ├── MemoryStore.js          # 分层记忆检索、timeline、alias expansion
│   └── CandidateNormalizer.js  # 候选记忆归一化
├── config/
│   ├── event_types.json
│   ├── fact_semantics.json
│   └── person_aliases.json
├── scripts/
│   ├── build_mobile_web.mjs
│   ├── stage19_agent_eval.mjs
│   ├── stage21_policy_retrieval_smoke.mjs
│   ├── stage22_layered_memory_smoke.mjs
│   ├── stage22_timeline_endpoint_smoke.mjs
│   └── stage23_clarification_smoke.mjs
└── eval/
    └── agent_memory_cases.json
```

`data/`、`uploads/`、`.env`、`node_modules/` 默认不提交到 GitHub。

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env`：

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat
PORT=3001
```

没有 `DEEPSEEK_API_KEY` 时，普通本地页面和部分 smoke 仍可查看，但 `/api/agent` 与真实 LLM eval 需要 API key。

### 3. 启动服务

```bash
npm start
```

健康检查：

```bash
curl http://127.0.0.1:3001/api/health
```

打开页面：

```text
http://127.0.0.1:3001/app.html
```

---

## 关键 API

| API | 说明 |
|---|---|
| `GET /api/health` | 服务健康检查 |
| `GET /api/state` | 获取本地应用状态 |
| `POST /api/reply-plan` | 固定管线中的回复策略规划 |
| `POST /api/memory-filter` | 判断输入是否适合作为记忆候选 |
| `POST /api/memory-draft` | 生成记忆草稿 |
| `POST /api/memory-structure` | 抽取人物、时间、地点、动作等结构 |
| `POST /api/confirmed-facts/confirm` | 用户确认候选后写入长期事实 |
| `POST /api/agent` | Agent 一次性执行并返回 final |
| `POST /api/agent/stream` | Agent SSE 流式 step / final / error |
| `GET /api/timeline` | 按人物和时间范围查询时间轴 |

---

## Agent 设计边界

### Agent 可以做

```text
search_memory
get_timeline
plan_reply
filter_memory_signal
draft_memory_page
structure_memory
manage_clarification
append_candidate_memory
```

### Agent 不可以做

```text
write_confirmed
append_confirmed_fact
delete_memory
read_secret
export_secret
```

长期事实写入必须经过用户确认。`append_candidate_memory` 只会写入候选记忆：

```text
memoryCandidates(status = pending_user_confirmation)
```

不会直接写入：

```text
confirmedFacts
```

---

## 验证命令

当前稳定版通过了以下验证：

```bash
npm run stage9:backend-smoke
npm run stage19:agent-eval
npm run stage21:policy-retrieval-smoke
npm run stage22:layered-memory-smoke
npm run stage22:timeline-endpoint-smoke
npm run stage23:clarification-smoke
npm run stageM2:app-smoke
npm run build:mobile-web
```

语法检查：

```bash
node --check server.js
node --check agent/AgentLoop.js
node --check agent/ToolRegistry.js
node --check agent/LifebookTools.js
node --check memory/MemoryStore.js
node --check scripts/stage23_clarification_smoke.mjs
```

### 当前已确认结果

```text
stage9 backend smoke                  passed
stage19 scripted agent eval            20/20 passed
stage21 policy retrieval smoke         passed
stage22 layered memory smoke           passed
stage22 timeline endpoint smoke        passed 6/6
stage23 clarification smoke            passed
stageM2 app shell smoke                passed
build:mobile-web                       passed
```

真实 LLM eval 需要配置 `DEEPSEEK_API_KEY`：

```bash
npm run stage19:agent-eval-real
```

---

## 移动端构建

构建 `mobile_web/`：

```bash
npm run build:mobile-web
```

同步 iOS：

```bash
npm run cap:sync:ios
```

打开 Xcode：

```bash
npm run cap:open:ios
```

---

## Demo 场景

### 1. 普通记忆候选

```text
用户：今天碰到老张了，他说纺织厂那几年真快。
Agent：检索老张相关记忆，判断为可沉淀候选，写入 pending candidate。
用户确认后：候选才进入 confirmedFacts。
```

### 2. 人名澄清

```text
用户：张伯最近身体不好。
Agent：你说的张伯，是之前提到的老张吗？
用户：对，就是他。
Agent：更新 sessionAliases，但不写长期事实。
```

### 3. 时间线冲突

```text
用户：老张退休那年是不是还和我出过差？
Agent：查询 timeline，发现 potential conflict，发起澄清问题。
系统不会自动修改 confirmedFacts。
```

---

## 版本状态

```text
P0: Agent runtime / layered memory / alias / timeline / memory-map integration
P1: clarification state machine / session alias / time-pronoun-conflict clarification / eval 20 cases
P2: SSE streaming / app integration ready
```

当前版本适合作为：

```text
GitHub stable demo
实训 / 简历项目展示
Personal Memory Agent 架构样例
```

后续可继续推进：

```text
real LLM eval 最新结果记录
candidate confirmation UI 进一步产品化
长期 alias 持久化
Tool outputSchema validation
server.js services 拆分
```

---

## License

This project is currently for learning, research, and portfolio demonstration.
