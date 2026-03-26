# Stage 2 改造设计

这份文档是从 Stage 0 和 Stage 1 进入真正实施前的桥接文档。

目标不是立刻改完所有问题，而是明确：

1. 当前代码链路是什么
2. 它和目标架构差在哪里
3. 第一批代码改造只改什么
4. 每个改动对应验证哪些 case
5. 哪些内容现在明确不碰

这份文档只服务于 **Stage 2：重构 AI 推理顺序，不改后端持久化**。

---

## 一、Stage 2 的目标

Stage 2 的目标不是引入完整事件数据库，也不是完成最终记忆系统。

Stage 2 只做一件事：

**把当前“先回复、后记忆”的松散链路，改造成“先判断、再受控回复、再更谨慎地产生候选记忆”的链路。**

换句话说：

- 先让 AI 不再明显接错时间
- 先让 AI 被纠正后真的能收回旧理解
- 先让 AI 不再把元对话和产品状态问题拉回生活记忆

---

## 二、当前代码现状

基于当前项目代码，主链路如下：

### 前端主入口

`talk()`  
位置：[script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L3314)

当前执行顺序：

1. 读取输入
2. 先写入 chat history
3. `buildChatRetrieval(text)`
4. `requestReplyPlan(text, retrieval)`
5. `requestAI(text, retrieval, replyPlan)`
6. `requestChatRecap(text, finalReply, retrieval)`
7. `requestMemoryFilter(text, retrieval, replyPlan)`
8. 若 `memorySignal=true` 则 `upsertMemoryCandidate(...)`

### 前端相关函数

- `requestReplyPlan()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L489)
- `buildLocalMemoryFilter()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L592)
- `requestMemoryFilter()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L662)
- `requestAI()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L3165)

### 服务端接口

- `/api/reply-plan`  
  [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js#L581)
- `/api/memory-filter`  
  [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js#L660)
- `/api/ai`  
  [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js#L146)
- `/api/chat-recap`  
  [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js#L509)

---

## 三、当前链路与目标架构的差距

### 1. 没有显式时间对象进入主决策

当前系统虽然有 `timeRefs`，但它们更多是：

- 文本特征
- prompt 辅助信息

而不是一个真正的 `time_ref` 对象。

缺口：

- 没有明确 `resolved_time`
- 没有 `time_confidence`
- 没有 `anchor_source`
- 没有 `time conflict` 输出

结果：

- “今天/昨天” 能被看到，但不一定会被真正用于决策和修订

---

### 2. 没有显式事件动作

当前系统直接从用户输入生成候选记忆，没有先输出：

- `create_new_event`
- `attach_to_existing_event`
- `revise_existing_event`
- `uncertain`

结果：

- 同一件事容易碎成多条候选
- 纠错后没有真正修正旧候选

---

### 3. 没有显式修订对象

当前系统能“口头承认理解偏了”，但没有独立的 revision 层。

结果：

- 旧理解容易残留
- 回答里会继续带回旧人物或旧时间
- 候选记忆不会自动失效或被改写

---

### 4. 元对话与生活事件仍混线

当前 `/api/memory-filter` 虽然已经有“不要把元对话写进记忆”的规则，但还不够强。

结果：

- “没来得及存档”
- “我看不到卡片整理”
- “你没听懂”

仍然会被旧生活事件召回干扰。

---

### 5. reply-plan 还不是真正的控制器

当前 `replyPlan` 只输出：

- `responseMode`
- `selfJudgment`
- `replyGoal`
- `memorySignal`
- `reason`
- `shouldAsk`
- `suggestedQuestion`

缺少更关键的控制字段：

- 是否发生时间冲突
- 是否发生人物冲突
- 是否是元对话
- 是否应显式承认修订
- 是否禁止使用旧记忆

---

## 四、Stage 2 第一批只解决的三类问题

第一批不追求全功能，只解决最致命、且已经被真实测试击中的问题。

### 问题 A：时间纠错不能真正落地

对应高优先级 case：

- Case 01
- Case 26

目标：

- 用户说“那是昨天的”时，系统不仅在回复里承认，还要让候选记忆和当前判断切到昨天

---

### 问题 B：人物纠错和代词残留

对应高优先级 case：

- Case 07
- Case 26

目标：

- 用户说“不是赵姐，是李阿姨”后，当前事件语义不再保留赵姐
- `她` 不能直接固化成候选记忆的人物字段

---

### 问题 C：元对话和产品状态错召回生活记忆

对应高优先级 case：

- Case 10
- Case 23
- Case 27
- Case 28

目标：

- “没存档”“看不到卡片整理”“点了忆光没保存” 这类输入应优先视为元对话或产品状态
- 当前轮不应主动召回赵姐、跳舞、出门等旧生活事件

---

## 五、Stage 2 不做的事

这一阶段明确不做这些，避免膨胀：

1. 不改数据库或后端持久化结构
2. 不做正式 `event / fact / revision` 落库
3. 不做复杂 embedding 或 RAG 重构
4. 不重写 UI
5. 不引入多 agent 架构
6. 不解决“稍后看”可见性对应的前端状态存储问题

说明：

- Case 28 会被记录为高优先级问题，但在 Stage 2 第一批里只解决“AI 正确识别它是产品状态问题”
- “稍后看真正可见” 更接近后续产品状态机和存储问题

---

## 六、Stage 2 目标链路

第一批重构后，目标顺序应变成：

1. 输入预处理
2. 时间判断
3. 修订判断
4. 元对话判断
5. 回答策略选择
6. 受控回复生成
7. 候选记忆过滤
8. 候选记忆二次约束

与目标蓝图相比，这仍然是简化版，但已经比当前链路更稳。

---

## 七、具体改造点

### 1. 扩展 reply-plan 输出

当前位置：

- 前端调用：[script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L489)
- 服务端定义：[server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js#L95)
- 服务端接口：[server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js#L581)

新增字段建议：

- `isMetaConversation`
- `correctionType`
- `shouldAvoidMemoryRecall`
- `timeAnchorLabel`
- `resolvedRelativeTime`
- `hasTimeConflict`
- `hasEntityConflict`
- `replyStrategy`

说明：

- Stage 2 不要求这些字段都完美稳定
- 但至少要让主回复和候选记忆生成不再完全盲飞

---

### 2. 在前端加入本地时间锚构造

建议新增一个本地辅助对象，先不用落库：

- `currentDate`
- `currentDateTime`
- `timezone`
- `yesterday`
- `dayBeforeYesterday`

作用：

- 每次请求 `/api/reply-plan` 和 `/api/memory-filter` 时都显式带上
- 让模型不是“隐约知道今天”，而是收到明确锚点

说明：

- 这是 Stage 2 中最小的 `time_ref` 过渡版本

---

### 3. 加一个轻量本地修订检测器

位置建议：

- 前端，`talk()` 前后链路中新增本地函数

优先检测：

- `不是今天，是昨天`
- `不是赵姐，是李阿姨`
- `不是这次，是上次`
- `你没听懂`
- `我不是这个意思`

作用：

- 即使模型判断不稳定，也先给 reply-plan 和 memory-filter 一个硬信号

---

### 4. 强化 memory-filter 的门槛

当前问题：

- 代词 `她` 会直接进入人物字段
- 元对话会穿透到候选记忆层

改造方向：

- `people` 只允许明确人物实体
- 纯代词不允许直接作为人物落地
- 若是元对话或产品反馈，`memorySignal` 必须强制为 false
- 若当前轮主要是纠错，且没有新生活事实，不进候选记忆

这部分要同时改：

- 本地 fallback：`buildLocalMemoryFilter()`
- 服务端 `/api/memory-filter`

---

### 5. 在主回复 prompt 中加入硬约束

当前主回复 prompt 位置：

- [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L3214)

需要加的硬约束：

1. 当 `isMetaConversation = true` 时，不要主动召回旧生活事件
2. 当 `hasTimeConflict = true` 时，先承认时间修正
3. 当 `hasEntityConflict = true` 时，先承认人物修正
4. 当 `shouldAvoidMemoryRecall = true` 时，不得主动补旧回忆
5. 当人物尚未明确时，不得把“她”当成确认人物

---

### 6. 候选记忆生成后增加本地二次约束

即使 `/api/memory-filter` 给出结果，前端落地前也应再过一层本地约束。

建议新增一个后处理函数，例如：

- `postProcessMemoryCandidate(candidate, text, replyPlan, retrieval)`

至少处理：

- 若人物字段只含代词，则清空人物或改为待确认
- 若当前轮被判定为元对话，则强制 `memorySignal=false`
- 若当前轮是纠错句但没新增生活事实，则强制不进候选
- 若当前轮纠正了旧时间，旧的“今天”类候选应被降级或覆盖

---

## 八、第一批实施顺序

建议按这个顺序做代码改造。

### Step 1

扩展 `reply-plan` 字段和 prompt

目的：

- 先让系统知道当前轮是不是元对话、是不是纠错、是否应避免召回旧记忆

回测 case：

- Case 10
- Case 23
- Case 27

---

### Step 2

加入本地时间锚与轻量修订检测

目的：

- 先把“昨天/今天”“不是赵姐，是李阿姨”这些硬纠错变成结构化信号

回测 case：

- Case 01
- Case 07
- Case 26

---

### Step 3

强化 `/api/memory-filter` 与 `buildLocalMemoryFilter()`

目的：

- 防止代词人物入库
- 防止元对话进入候选记忆

回测 case：

- Case 10
- Case 15
- Case 26
- Case 27
- Case 28

---

### Step 4

加入候选记忆后处理与冲突覆盖

目的：

- 让“昨天纠正今天”在候选层真正生效

回测 case：

- Case 01
- Case 26

---

### Step 5

收紧主回复 prompt

目的：

- 把“道歉模板”变成真正的路径切换

回测 case：

- Case 07
- Case 23
- Case 27

---

## 九、代码映射清单

### 前端优先改动

1. `requestReplyPlan()`  
   [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L489)

2. `buildLocalMemoryFilter()`  
   [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L592)

3. `requestMemoryFilter()`  
   [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L662)

4. `requestAI()`  
   [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L3165)

5. `talk()`  
   [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L3314)

### 服务端优先改动

1. `normalizeReplyPlan()`  
   [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js#L95)

2. `normalizeMemoryFilter()`  
   [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js#L107)

3. `/api/reply-plan`  
   [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js#L581)

4. `/api/memory-filter`  
   [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js#L660)

服务端 `/api/ai` 暂时不需要改接口形式，但主回复 prompt 的入参和文本内容要变。

---

## 十、Stage 2 的验收标准

第一批完成后，不要求系统“完整拥有事件层”，但至少要满足：

1. Case 01 不再继续保留错误“今天”线
2. Case 07 不再继续保留错误人物
3. Case 10、23、27 不再默认召回赵姐/跳舞/出门等旧生活事件
4. Case 26 中 `她` 不再直接作为人物进入候选记忆
5. 用户说“你没听懂”后，回复路径应明显收口

如果这些达不到，就说明 Stage 2 第一批还没过。

---

## 十一、当前不解决但已记录的问题

以下问题已确认存在，但不属于 Stage 2 第一批主目标：

### 1. “稍后看”在忆光中不可见

对应：

- Case 28

这更像产品状态机和持久化问题，后续需要单独处理。

### 2. 回复可能重复渲染或重复提交

在真实测试中出现了重复回复片段，这更偏工程稳定性，需要后续单独排查：

- 请求是否重复发送
- 页面刷新是否重放
- 渲染是否重入

这也不属于 Stage 2 第一批核心认知改造。

---

## 十二、下一步执行建议

这份设计确认后，后续实际实施建议按两步走：

1. 先做 **Stage 2 第一批代码改造**
2. 每完成一个 Step 就回测对应 case

推荐最小实施序列：

1. `reply-plan` 增强
2. 本地时间锚 + 修订检测
3. `memory-filter` 收紧
4. 候选记忆后处理
5. 主回复 prompt 收口

如果你确认这份设计，我下一步就会开始真正动代码，从 **Step 1：增强 reply-plan** 开始。
