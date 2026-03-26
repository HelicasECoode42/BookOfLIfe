# Stage 2 推理链收口

这份文档只描述 **Stage 2 当前已经落地的 AI 推理顺序**。

目标不是设计未来系统，而是明确：

1. 这一阶段回复前到底先做了什么
2. 哪些判断已经进入主链路
3. 哪些能力故意还没有推进到 Stage 3

---

## 1. 当前主链路

Stage 2 收口后的最小链路如下：

```text
用户输入
  -> 输入预处理
  -> 时间 grounding
  -> 事件链接判断
  -> 修订判断
  -> 回答策略选择
  -> 受控生成
  -> 生成后安全检查
  -> 回复落屏
  -> 回复后候选记忆过滤
```

对应代码位置：

- 主入口：`talk()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L3853)
- 前置信号检测：`detectTurnSignals()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L370)
- 本地回答控制器：`buildLocalReplyPlan()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L795)
- 主回复生成：`requestAI()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L3675)
- 生成后清洗：`sanitizeAssistantReply()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L3555)
- 候选记忆过滤：`buildLocalMemoryFilter()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L1022)
- 候选后处理：`postProcessMemoryCandidate()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js#L415)

---

## 2. 分步说明

### Step 1. 输入预处理

输入预处理当前做的是轻量结构化，不做复杂检索改造。

会先拿到：

- `queryFeatures.explicitPeople`
- `queryFeatures.timeRefs`
- `queryFeatures.intent`
- `queryFeatures.emotion`
- 最近聊天历史
- 当前活跃事件 `activeEvent`

这一步的目标不是下结论，而是把后面判断要用的材料先摆齐。

---

### Step 2. 时间 grounding

Stage 2 只做最小可用时间 grounding，不进入完整时间模块。

当前会输出：

- `timeAnchorLabel`
- `resolvedRelativeTime`

用途：

- 让“那是昨天的”“前天下棋”“刚刚打电话”这些高频相对时间先落到当前轮决策里
- 让回答层知道这轮是否已经有安全可用的时间解释

注意：

- Stage 2 不追求完整时间系统
- `小时候 / 上小学那几年 / 退休后` 这类更长期时间对象，留给 Stage 3

---

### Step 3. 事件链接判断

Stage 2 没有完整事件层，但已经有一个轻量 `activeEvent` 概念。

当前会判断：

- 这轮是不是在补充上一件事
- 这轮是不是一个新事件
- 当前事件的人物、动作、时间是否应更新

已经落地的典型能力：

- `广场舞`
- `舒服`
- `他约的我`

这类短句可以挂回当前活跃事件，不再被当成完全新话题。

---

### Step 4. 修订判断

Stage 2 已经把修订判断接入主链路，但还是轻量版。

当前识别的修订类型：

- `time`
- `entity`
- `scope`

目的：

- 当用户说“那是昨天的”时，先承认旧时间错了
- 当用户说“不是赵姐，是李阿姨”时，先承认旧人物错了
- 当用户说“你没听懂”“不是这个意思”时，先收回旧理解

这一步的关键不是“道歉”，而是 **切换回答路径**。

---

### Step 5. 回答策略选择

Stage 2 的 `reply-plan` 现在已经承担“回答控制器”的职责。

最终回复不允许无条件自由发挥，而是必须带着这些控制量进入生成：

- 当前是否元对话
- 当前是否发生时间修订
- 当前是否发生人物修订
- 当前是否应避免召回旧记忆
- 当前是否只是活跃事件补充
- 当前应走什么 `replyStrategy`

这一步的目标是：

- 让模型先判断，再开口
- 不再把“回答风格”和“事实判断”混在一起

---

### Step 6. 受控生成

Stage 2 的主回复 prompt 已经收紧成“可用事实白名单”模式。

回复只允许读取：

- 当前输入
- 当前活跃事件摘要
- 可安全使用的时间解释
- 明确召回到的长期事实
- 当前回答策略

不允许做的事：

- 把助手上一轮猜的内容继续当事实
- 把代词直接当成确认人物
- 在元对话里召回旧生活事件
- 在修订后继续沿用旧时间或旧人物

---

### Step 7. 生成后安全检查

Stage 2 已经有一层本地生成后自检。

当前会拦截：

- 无依据的旧记忆声明
- 无依据的人物复用
- 跟活跃事件完全脱节的泛化回复
- 明显复读用户原句但没有新增价值的回复

失败时的降级策略：

- 清空不安全回复
- 退回 `fallbackReply()`

这就是 Stage 2 的“规则托底”。

---

### Step 8. 回复后候选记忆过滤

记忆处理现在已经被放到回复之后，并且单独过筛。

过滤门槛包括：

- 元对话不进生活候选
- 纯修订句不进候选
- 代词人物不直接入 `people`
- 混合多个时间片段的句子先不自动压成单张草稿卡

这一步的目标不是“多存”，而是“少错存”。

---

## 3. Stage 2 明确不做的事

这些内容已经确认不属于本阶段收口：

- 不改数据库
- 不引入复杂时间对象持久化
- 不引入正式事件状态机落库
- 不做 revision 日志持久化
- 不做复杂检索系统
- 不做多 agent 编排

这些都留到后续阶段。

---

## 4. Stage 2 完成定义

只有下面这些都成立，才算 Stage 2 过关：

1. “那是昨天的” 不再被继续接成今天
2. 用户纠正后，回答会先承认修正
3. 元对话不轻易进入人生记忆
4. 不确定时会收口，不继续脑补

目前这四条已经进入自动 smoke 和真实样例回归。
