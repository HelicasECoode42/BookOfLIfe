# Stage 9 Backend Persistence

这一阶段把此前主要存在前端 `localStorage` 里的核心对象，下沉到服务端文件存储。

## 当前完成范围

服务端新增文件存储：

- `data/app_state.json`
- `data/reply_traces.json`

服务端新增接口：

- `GET /api/state`
- `POST /api/state/bootstrap`
- `PUT /api/state/:key`
- `POST /api/traces`

当前持久化对象：

- `memories`
- `chat`
- `profile`
- `settings`
- `lastChatRecap`
- `memoryCues`
- `strategyTrail`
- `memoryCandidates`
- `lifeSummaries`
- `activeEventContext`
- `revisionLogs`
- `localFacts`
- `factDatabase`
- `personAliases`
- `memoryDraft`

当前持久化 trace：

- `userText`
- `assistantReply`
- `replyPlan`
- `retrieval`
- `safetyCheck`
- `activeEvent`

## 前端改动

前端启动时：

1. 先请求 `/api/state`
2. 把服务端状态恢复到本地缓存
3. 再执行原来的 seed / render 流程
4. 最后把本地缺失但服务端为空的默认状态 bootstrap 到服务端

前端后续写入时：

- 仍保留本地缓存作为即时读写层
- 但 `writeStorage()` 会异步把关键状态同步到 `/api/state/:key`

## 这样做的目的

- 页面刷新后恢复聊天、候选卡、事件、修订、事实层
- 多轮测试时不再只靠浏览器本地状态
- 为后续真正的数据库和冲突回放打基础

## 当前仍未完成的部分

- 真正的数据库存储
- 多用户隔离
- 服务端主导的事实/事件计算
- 后端 conflict replay 界面
- 细粒度版本化与回滚

## 验证

语法检查：

```bash
node --check server.js
node --check script.js
```

前端本地逻辑 smoke：

```bash
npm run stage2:smoke
```

后端持久化 smoke：

```bash
npm run stage9:backend-smoke
```
