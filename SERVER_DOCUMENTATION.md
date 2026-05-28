# 忆光应用 - Server.js 文档

## 📋 项目概述

这是一个基于 **Node.js + Express + DeepSeek LLM** 的智能记忆管理后端服务。核心功能是帮助用户记录、整理、理解和回顾生活中的重要时刻和人物关系。

**关键技术栈**：
- 框架：Express.js
- AI模型：DeepSeek API（深度思考的大语言模型）
- 数据存储：JSON 文件（app_state.json, reply_traces.json）
- 语音/头像：支持可配置的 ASR（语音识别）和 TTS（文本转语音）服务

---

## 🏗️ 系统架构和核心概念

### 数据流七层模型

```
用户输入 (Chat)
    ↓
对话决策层 (reply-plan) → 决策用户这轮怎么回复
    ↓
记忆整理层 (memory-draft, memory-structure) → 整理成初步记忆片段
    ↓
记忆沉淀层 (confirmed-facts, memory-summary) → 确认并总结为持久事实
    ↓
叙事生成层 (chapter-compose, life-summary-compose, profile-insights) → 生成叙事和画像
    ↓
用户展示 (Photos, Avatar, Daily Recap)
```

### 核心名词解释

| 名词 | 含义 | 存储位置 |
|------|------|--------|
| **Trace** | 单轮对话的完整记录（用户输入、AI回复、回复决策、检索结果） | reply_traces.json |
| **memoryCandidates** | 候选记忆（从对话中初步提取，还未确认） | app_state.json |
| **confirmedFacts** | 已确认的持久事实（用户确认后存储） | app_state.json |
| **replyPlan** | 回复规划（AI生成的本轮回复策略） | trace 中 |
| **lifeSummaries** | 人生线摘要（人物线、时间线、情绪线） | app_state.json |
| **profileInsights** | 用户画像（说话风格、喜好、习惯等） | app_state.json |

---

## 📡 API 端点完整清单

### 一、系统基础接口

#### 1. `/api/health` [GET]
- **功能**：服务器健康检查
- **返回**：`{ status: 'ok', timestamp }`
- **用途**：验证服务是否正常运行

#### 2. `/api/state` [GET]
- **功能**：获取完整应用状态
- **返回**：app_state.json 的全部内容
- **包含数据**：记忆、对话、设置、用户画像等

#### 3. `/api/state/bootstrap` [POST]
- **功能**：初始化应用状态（第一次启动时调用）
- **入参**：可选的初始化数据
- **返回**：初始化后的 app_state

#### 4. `/api/state/:key` [PUT]
- **功能**：更新 app_state 中的单个键（如 memories、settings）
- **入参**：`{ [key]: value }`
- **返回**：更新后的状态

---

### 二、记忆管理接口

#### 整理层（初步处理）

#### 5. `/api/memory-draft` [POST] ⭐
- **功能**：生成记忆草稿（从零散对话整理成一页记忆）
- **入参**：
  ```json
  {
    "text": "用户输入文本",
    "source": "来源标识",
    "context": { "candidateId": "...", "relatedTurns": [...] }
  }
  ```
- **输出**：
  ```json
  {
    "title": "记忆标题",
    "content": "整理后的记忆文本",
    "summary": "30-50字摘要",
    "mood": "心情标签",
    "tags": ["标签数组"]
  }
  ```
- **LLM 角色**：整理者（清理、不编造、只整理已有线索）

#### 6. `/api/memory-structure` [POST] ⭐
- **功能**：抽取记忆的结构化信息（人物、时间、地点、事件）
- **入参**：
  ```json
  {
    "text": "回忆文本",
    "title": "标题",
    "mood": "心情",
    "source": "来源"
  }
  ```
- **输出**：
  ```json
  {
    "title": "标题",
    "summary": "概括",
    "mood": "心情",
    "people": [{ "name": "姓名", "relation": "关系", "role": "角色" }],
    "timeRefs": ["时间标签数组"],
    "locations": ["地点数组"],
    "actions": ["动作数组"],
    "timelineDate": "YYYY-MM-DD 或 YYYY-MM 或 YYYY",
    "timelineLabel": "展示用时间文本（如'1984年秋天'）",
    "timeAccuracy": "exact|approx|unknown",
    "followUpQuestion": "如果时间模糊，给出追问",
    "eventType": "标准事件类型（从 config/event_types.json）",
    "eventCategory": "大类（家庭、工作、爱好等）",
    "tags": ["标签"]
  }
  ```
- **LLM 角色**：分析器（抽取元数据、不编造、保守处理）

---

#### 沉淀层（确认和长期存储）

#### 7. `/api/confirmed-facts/confirm` [POST] ⭐
- **功能**：确认候选记忆为正式事实（或合并到现有事实）
- **入参**：
  ```json
  {
    "candidateId": "候选ID",
    "candidate": { "id": "...", "summary": "...", "people": [...] },
    "editedText": "用户编辑后的文本"
  }
  ```
- **处理逻辑**：
  - 如果是 `merge_suggestion` 类型，将新事实合并到 `mergeTargetFactId`
  - 否则作为新事实保存
- **返回**：更新后的 confirmedFacts 列表

#### 8. `/api/confirmed-facts/update` [POST]
- **功能**：更新已确认事实（修正信息、添加上下文）
- **入参**：
  ```json
  {
    "factId": "事实ID",
    "updates": { "title": "...", "summary": "..." }
  }
  ```
- **返回**：更新后的事实对象

#### 9. `/api/memory-summary` [POST] ⭐
- **功能**：为某个人物生成整理摘要（关系、印象、共同时刻）
- **入参**：
  ```json
  {
    "personName": "人物名称",
    "memories": [
      {
        "title": "记忆标题",
        "timelineLabel": "时间",
        "actions": ["事件1", "事件2"],
        "content": "记忆内容"
      }
    ]
  }
  ```
- **输出**：
  ```json
  {
    "summary": "60-100字人物整理",
    "relationLabel": "关系简述（如'常一起跳舞的朋友'）",
    "personImpression": "这个人在回忆里的样子",
    "sharedMoments": ["共同做过的事1", "共同做过的事2"],
    "userView": "用户怎么看这个人",
    "personView": "这个人怎么对用户",
    "openQuestions": ["需要补充的信息"]
  }
  ```
- **LLM 角色**：总结者（只基于回忆，不编造）

---

#### 叙事生成层（高层合成）

#### 10. `/api/chapter-compose` [POST] ⭐
- **功能**：为人物生成"篇章"（人物传记式叙事）
- **入参**：
  ```json
  {
    "personName": "人物名称",
    "memories": [...]
  }
  ```
- **输出**：
  ```json
  {
    "title": "篇章标题（如'赵姐篇'）",
    "narrative": "120-220字叙述，像产品里的人物传记",
    "timeline": "这些事迹大致集中在哪个阶段",
    "anchors": ["关键片段1", "关键片段2"],
    "openThreads": ["还值得补充的线索"]
  }
  ```
- **LLM 角色**：叙事者（合成故事、不编造、语气朴素）

#### 11. `/api/life-summary-compose` [POST] ⭐
- **功能**：整理"人生线摘要"（把所有记忆组织成人物线、时间线、情绪线）
- **入参**：
  ```json
  {
    "memories": [...],
    "candidates": [...],
    "localSummaries": [...]
  }
  ```
- **输出**：
  ```json
  {
    "summaries": [
      {
        "id": "unique-id",
        "type": "person_line|timeline_line|emotion_line",
        "label": "人物名|时间标签|情绪标签",
        "summary": "40-90字摘要",
        "evidenceCount": 数字,
        "people": ["人物"],
        "tags": ["标签"],
        "updatedAt": "时间戳"
      }
    ]
  }
  ```
- **LLM 角色**：架构师（构建人生脉络、不编造）

#### 12. `/api/profile-insights` [POST] ⭐
- **功能**：提炼用户画像（性格、喜好、习惯、重要人物等）
- **入参**：
  ```json
  {
    "text": "当前输入文本",
    "history": ["对话历史"],
    "memories": ["相关记忆"]
  }
  ```
- **输出**：
  ```json
  {
    "speakingStyle": "说话方式",
    "worldview": "世界观",
    "likes": ["喜欢1", "喜欢2"],
    "dislikes": ["不喜欢1"],
    "habits": ["习惯1"],
    "goals": ["目标1"],
    "importantPeople": ["重要人物"],
    "keyMemories": ["关键记忆主题"],
    "userStyle": {
      "talkingPace": "说话节奏",
      "reactsWellTo": ["适合用这种方式回复"],
      "reactsPoorlyTo": ["避免这种方式"],
      "anchorTopics": ["拿手话题"],
      "humorStyle": "幽默风格"
    }
  }
  ```
- **LLM 角色**：画像师（提炼稳定信息、不编造一次性情绪）

---

### 三、对话和决策接口

#### 13. `/api/reply-plan` [POST] ⭐ **核心接口**
- **功能**：为本轮对话生成回复规划（决策应该怎么回复）
- **入参**：
  ```json
  {
    "text": "用户输入",
    "retrieval": {
      "activeEvent": { 当前正在讨论的事件 },
      "verifiedFacts": [...],
      "eventAnalysis": { 词性标注和事件分析 },
      "shortTurnAnalysis": { 短句类型分析 }
    },
    "history": [历史对话]
  }
  ```
- **输出**：
  ```json
  {
    "responseMode": "small_talk|emotional_support|chatting|relationship_signal|memory_narrative|memory_capture",
    "replyStrategy": "small_talk|gentle_acknowledgment|continue_event|clarify_time|...",
    "replyGoal": "本轮回复该完成什么",
    "memorySignal": boolean,
    "shouldAsk": boolean,
    "suggestedQuestion": "如果需要，建议什么问题",
    "timeRef": { 时间引用详情 },
    "needsConfirmation": boolean,
    "confirmationPrompt": "确认问句",
    "isActiveEventFollowUp": boolean,
    "hasTimeConflict": boolean,
    ...（共25+个字段）
  }
  ```
- **LLM 提示词特点**：
  - 强调不编造、不扩写用户短句
  - 区分元对话vs实质对话
  - 检测时间/人物冲突
  - 指导何时介入、何时顺聊
  - 规则：寒暄→small_talk，情绪→emotional_support，人物→relationship_signal
- **LLM 角色**：对话策略师（判断每轮该怎么回应）

#### 14. `/api/chat-recap` [POST]
- **功能**：为整段对话生成回顾和摘要
- **入参**：
  ```json
  {
    "text": "摘要题目/需求",
    "reply": "之前的AI回复",
    "retrieval": { 上下文 },
    "history": [对话历史]
  }
  ```
- **用途**：在一段对话结束后，为用户总结"我们聊了什么"

#### 15. `/api/memory-filter` [POST]
- **功能**：从对话中筛选出可能值得记忆的内容（候选记忆）
- **入参**：对话文本和上下文
- **输出**：
  ```json
  {
    "filteredText": "筛选出的核心内容",
    "memorySignal": boolean,
    "candidateType": "线索类型",
    "confidence": 置信度,
    "people": ["涉及人物"],
    "timeRef": { 时间信息 },
    ...
  }
  ```
- **用途**：从噪音中过滤出真正值得沉淀的内容

#### 16. `/api/memory-review` [POST]
- **功能**：在对话过程中动态判断是否应该提醒用户整理新记忆
- **入参**：`{ conversationId, messages, existingCandidates, memories }`
- **输出**：
  ```json
  {
    "summary": "整段对话的新记忆总结",
    "shouldRemind": boolean,
    "sourceText": "最能代表的原始文本",
    "people": ["人物"],
    "timeLabel": "时间标签"
  }
  ```
- **LLM 逻辑**：
  - 不是每句话都要提取（避免过度记忆）
  - 只有跨多轮稳定出现的人物/事件才提醒
  - 寒暄、口头禅、单句情绪不触发提醒

#### 17. `/api/memory-review-graph` [POST]
- **功能**：生成记忆关系图（人物关系、事件关联等）
- **用途**：可视化记忆网络

#### 18. `/api/daily-recap` [POST]
- **功能**：生成每日回顾
- **输出**：当天聊天和记忆的汇总

#### 19. `/api/ai` [POST]
- **功能**：通用AI对话接口（除了特定决策外的其他AI调用）
- **用途**：灵活处理各种AI任务

#### 20. `/api/traces` [POST]
- **功能**：保存对话 trace（单轮对话的完整记录）
- **存储**：reply_traces.json
- **内容**：
  ```json
  {
    "traceId": "unique-id",
    "createdAt": "时间戳",
    "userText": "用户输入",
    "assistantReply": "AI回复",
    "replyPlan": { 回复规划 },
    "retrieval": { 检索信息 },
    "safetyCheck": { 安全检查结果 },
    "activeEvent": { 活跃事件上下文 }
  }
  ```

---

### 四、用户信息和设置接口

#### 21. `/api/user-card` [GET]
- **功能**：获取用户卡片（基本信息）
- **返回**：用户保存的个人信息摘要

#### 22. `/api/user-card` [PUT]
- **功能**：更新用户卡片
- **入参**：`{ name, bio, photo, ... }`

#### 23. `/api/privacy/summary` [GET]
- **功能**：获取隐私政策摘要
- **返回**：应用的数据隐私说明

---

### 五、多媒体接口

#### 24. `/api/photos` [GET]
- **功能**：获取所有已上传照片列表
- **返回**：照片元数据数组

#### 25. `/api/photos` [POST]
- **功能**：上传新照片
- **入参**：FormData 包含图片 + 元数据
- **处理**：保存到 uploads/ 目录，记录到 app_state.photos

#### 26. `/api/photos/:id` [PUT]
- **功能**：更新照片元数据（标签、说明等）
- **入参**：`{ label, description, mood, people, ... }`

#### 27. `/api/photos/:id` [DELETE]
- **功能**：删除照片

#### 28. `/api/avatar/capabilities` [GET]
- **功能**：获取头像生成能力（支持的模型和参数）
- **返回**：`{ provider, models: [...], features: [...] }`

#### 29. `/api/avatar` [GET]
- **功能**：获取当前保存的头像数据

#### 30. `/api/avatar/generate` [POST]
- **功能**：生成或更新用户头像（AI生成）
- **入参**：`{ style, description, mood, ... }`

#### 31. `/api/voice/capabilities` [GET]
- **功能**：获取语音服务能力
- **返回**：`{ asrProvider, ttsProvider, models: [...] }`
- **说明**：
  - ASR（Automatic Speech Recognition）：语音转文字
  - TTS（Text-To-Speech）：文字转语音
  - 提供者可配置为 browser（浏览器前端）、FunASR（开源）或其他

---

## 🔧 关键辅助函数

### 数据验证和规范化

| 函数 | 作用 |
|------|------|
| `normalizeReplyPlan(data)` | 验证和清理 reply-plan 输出 |
| `normalizeMemoryFilter(data)` | 验证和清理 memory-filter 输出 |
| `sanitizeTrace(trace)` | 验证和清理 trace 对象 |
| `sanitizeStringList(list, maxLen)` | 验证字符串数组 |
| `sanitizeConfirmedFact(fact, index)` | 验证和清理已确认事实 |

### 数据操作

| 函数 | 作用 |
|------|------|
| `readServerState()` | 从 app_state.json 读取完整状态 |
| `writeServerState(state)` | 写入 app_state.json |
| `patchServerState(patch)` | 部分更新 app_state（只更新指定字段） |
| `extractJsonBlock(text)` | 从 LLM 输出中提取 JSON |

### 分析和处理

| 函数 | 作用 |
|------|------|
| `extractEventAnalysis(text)` | 对输入文本进行事件和词性分析 |
| `interpretShortTurn(text, history, activeEvent)` | 分析短句的类型和意图 |
| `analyzeMemoryReviewEvidence(messages)` | 评估对话是否稳定到值得记忆 |
| `buildFactFromCandidate(candidate, editedText)` | 从候选生成确认事实对象 |

---

## 📊 数据存储结构

### app_state.json 的主要字段

```javascript
{
  // 对话和记忆
  memories: [],                    // 已保存的长期记忆
  chat: [],                        // 当前对话
  conversations: [],               // 历史对话列表
  activeConversationId: "",        // 當前活跃对话ID
  memoryCandidates: [],           // 候选调用（未确认）
  confirmedFacts: [],             // 已确认的持久事实
  
  // 用户信息
  profile: { ... },               // 用户基本信息和设置
  userCard: { ... },              // 用户卡片
  
  // AI生成的高层总结
  lifeSummaries: [],              // 人生线摘要
  profileInsights: { ... },       // 用户画像
  
  // 音/视频和头像
  photos: [],                     // 照片列表
  companionAvatar: { ... },       // 伴侣（AI头像）
  
  // 对话辅助
  memoryCues: [],                 // 记忆线索（用于对话提示）
  strategyTrail: [],              // 最近回复策略记录（用于避免重复）
  activeEventContext: { ... },    // 当前讨论的事件上下文
  
  // 健康和日志
  healthProfile: { ... },         // 健康信息（用药、疾病等）
  dailyLogs: [],                  // 日志记录
  moodRecords: [],                // 情绪记录
  memoryDraft: [],                // 草稿区
  
  // 其他
  settings: { ... },              // 应用设置
  revisionLogs: [],               // 修订记录
  factDatabase: { ... },          // 事实库（备用存储）
  personAliases: { ... }          // 人物别名（同一人多种称呼）
}
```

### reply_traces.json

逐条保存每轮对话，包括：
- `traceId`, `createdAt`
- `userText`, `assistantReply`
- `replyPlan`：本轮回复决策
- `retrieval`：检索到的相关上下文
- `safetyCheck`：安全检查（要避免的回复）
- `activeEvent`：当时的活跃事件

---

## 🤖 LLM 集成详情

### 调用的 DeepSeek API

- **URL**：`https://api.deepseek.com/v1/chat/completions`
- **模型**：由 `DEEPSEEK_MODEL` 环境变量指定（默认 "deepseek-chat"）
- **认证**：`DEEPSEEK_API_KEY` 环境变量
- **格式**：标准 OpenAI ChatCompletion API（messages 格式）

### LLM 的 21 大使用场景

| 场景 | 端点 | 主要任务 | LLM 角色 |
|------|------|--------|---------|
| 1 | reply-plan | 判断本轮回复策略 | 对话策略师 |
| 2 | chat-recap | 对话总结 | 总结师 |
| 3 | memory-draft | 整理零散文本成一页记忆 | 整理师 |
| 4 | memory-structure | 抽取人物、时间、地点、动作 | 分析师 |
| 5 | memory-filter | 从对话筛选值得记忆的内容 | 过滤师 |
| 6 | memory-review | 判断是否应提醒整理新记忆 | 评估师 |
| 7 | memory-review-graph | 生成记忆关系图 | 图论师 |
| 8 | confirmed-facts/confirm | 构建确认事实对象（验证重复） | 验证师 |
| 9 | memory-summary | 为人物生成整理摘要 | 人物总结师 |
| 10 | chapter-compose | 为人物生成篇章（传记式） | 叙事师 |
| 11 | life-summary-compose | 生成人生线摘要（人物线/时间线/情绪线） | 架构师 |
| 12 | profile-insights | 提炼用户画像 | 画像师 |
| 13 | daily-recap | 每日回顾 | 日志师 |
| 14+ | ai | 其他AI对话 | 通用助手 |

### Prompt 工程特色

所有 prompt 都特别强调：
1. **不编造**：严禁编造没有出现过的事实
2. **保守倾向**：如果不确定，就留空或返回 false
3. **用户信息优先**：只基于用户说过的内容，不优化介绍语气
4. **防过度记忆**：不是每句话都要记，只记稳定、跨轮的信息
5. **结构化输出**：都要求返回 JSON，字段类型明确

---

## 🔐 安全和隐私

### 已实现的措施

1. **CORS 保护**：
   - 只允许指定来源（`ALLOWED_ORIGIN` 环境变量）
   - 也允许 localhost

2. **文件系统隔离**：
   - 照片上传到 `UPLOAD_DIR`
   - 所有状态写入 `DATA_DIR`
   - 防止目录遍历

3. **数据验证**：
   - 所有输入都要经过 sanitize 函数
   - 字符串/数组长度限制
   - 枚举字段值检查

4. **隐私 API**：
   - `/api/privacy/summary`：獲取隱私政策
   - 所有数据本地存储，不上传到云端（除了调用 LLM 的那一刻）

---

## 🚀 环境配置

需要的环境变量：
```bash
# LLM
DEEPSEEK_API_KEY=your-api-key
DEEPSEEK_MODEL=deepseek-chat (可选, 默认 deepseek-chat)

# 服务器
PORT=3001
HOST=0.0.0.0
ALLOWED_ORIGIN=http://localhost:8080 (或应用前端地址)

# 文件系统
APP_DATA_DIR=./data
UPLOAD_DIR=./uploads

# 语音服务
ASR_PROVIDER=browser|funasr (默认 browser)
TTS_PROVIDER=browser|custom (默认 browser)
FUNASR_URL=http://localhost:8888 (如果用 FunASR)
TTS_SERVICE_URL=... (如果用自定义 TTS)
```

---

## 📈 典型工作流

### 案例：用户说"我和老徐打洛克王国很开心"

```
1. 用户问句 → /api/reply-plan
   └─ 输出：responseMode=memory_narrative, memorySignal=true, shouldAsk=false
   
2. AI 回复用户，同时提示用户可以保存这条记忆

3. 用户确认保存 → /api/memory-draft
   └─ 输出：整理成"老徐：游戏伙伴，一起打洛克王国，很开心。"
   
4. 系统调用 → /api/memory-structure
   └─ 输出：people=[{name: "老徐", relation: "游戏伙伴"}], 
             actions=["玩洛克王国"], mood="开心"
   
5. 用户确认 → /api/confirmed-facts/confirm
   └─ 写入 confirmedFacts 数组

6. 定期调用 → /api/memory-summary (personName="老徐")
   └─ 输出：人物整理"老徐是游戏伙伴，你们经常一起玩游戏…"

7. 定期调用 → /api/chapter-compose (personName="老徐")
   └─ 输出：人物篇"老徐篇：一个爱打游戏的朋友…"

8. 定期调用 → /api/life-summary-compose
   └─ 输出：person_line={type: "person_line", label: "老徐", summary: "…"}
```

---

## 🎯 答辩重点总结

### 核心创新点
1. **三层记忆架构**：整理→沉淀→叙事，循序渐进，避免一开始就硬记
2. **智能对话策略**：通过 reply-plan 决策每轮怎么回复，避免干扰用户
3. **防过度記憶**：明确的 memorySignal 判断，不是每都要記
4. **人生线脉络**：人物线、时间线、情绪线相互关联，支撑长期回顾
5. **用户画像**：从稳定信息提炼性格和偏好，用于个性化体验

### 技术亮点
1. **LLM 驱动的决策论**：每个决策都由 AI 做（不是硬规则）
2. **多维提示工程**：21 个场景各有定制的 system prompt
3. **JSON 严格验证**：所有 LLM 输出都要经过 normalize 函数
4. **链式调用**：reply-plan → memory-draft → memory-structure → confirmed-facts → summary
5. **可配置的外部服务**：ASR、TTS、LLM 都可以换公司的服务

### 常见答辩问题预案

**Q: 为什么要分三层记忆？**
A: 迎合人类记忆过程。初期是零散印象（整理层），逐步确认为稳定事实（沉淀层），最后形成叙事（生成层）。分层避免一开始就过度计算。

**Q: 怎么避免 AI 编造？**
A: 
- Prompt 明确强调"不编造"
- 规范化函数对枚举字段做值检查
- memorySignal 用来过滤噪音
- 一旦用户编辑，优先保存用户的版本

**Q: 怎么处理人物别名？**
A: personAliases 字段记录同一人的多种称呼（"老徐"→"徐老板"），confirmedFacts 合并逻辑会检测重复。

**Q: 隐私怎么保护？**
A: 
- 数据全部本地存储（JSON 文件）
- 只在调用 LLM 时发送文本，不发送整个 history
- 提供 /api/privacy/summary 告知用户

**Q: 怎么测试这些 LLM endpoints？**
A: 用 Postman/curl 调用，传入 json，检查 response 的 JSON 结构是否匹配。

---

*文档生成时间：2026年4月15日 | 基于 server.js 完整分析*
