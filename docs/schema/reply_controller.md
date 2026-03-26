# reply_controller 字段定义

这份文档是 Stage 2 收口版的 `reply-plan` 字段定义。

目的：

- 把 `reply-plan` 从“轻量分类器”明确成“回答控制器”
- 让后续代码和 prompt 都围绕同一组字段工作

---

## 1. 最小字段集

### `responseMode`

取值示例：

- `small_talk`
- `chatting`
- `relationship_signal`
- `memory_narrative`
- `memory_capture`
- `emotional_support`

含义：

- 表示这一轮总体回复风格
- 解决“像平常聊天”还是“适合轻理一理”的问题

---

### `replyStrategy`

取值示例：

- `small_talk`
- `continue_event`
- `acknowledge_revision`
- `avoid_memory_claim`
- `clarify_time`
- `clarify_entity`

含义：

- 表示这一轮回复的核心动作
- 比 `responseMode` 更具体，直接约束主回复 prompt

---

### `isMetaConversation`

类型：

- `boolean`

含义：

- 当前输入主要在谈系统状态、记忆卡、产品反馈、理解边界

若为 `true`：

- 不主动召回旧生活事件
- 当前轮默认不进入生活候选记忆

---

### `correctionType`

取值：

- `none`
- `time`
- `entity`
- `scope`

含义：

- 这一轮是否在修订前面的理解

说明：

- `time`：修正时间
- `entity`：修正人物
- `scope`：修正理解范围或语义方向

---

### `shouldAvoidMemoryRecall`

类型：

- `boolean`

含义：

- 当前轮虽然可以回复，但不应主动提旧记忆

常见触发：

- 元对话
- 修订句
- 证据不足的“你记得吗”

---

### `hasTimeConflict`

类型：

- `boolean`

含义：

- 当前轮存在时间冲突或时间修订

作用：

- 主回复先承认修正
- 候选记忆层避免沿用旧时间

---

### `hasEntityConflict`

类型：

- `boolean`

含义：

- 当前轮存在人物冲突或人物修订

作用：

- 回复不继续沿用旧人物
- 当前活跃事件的人物字段应同步更新

---

### `timeAnchorLabel`

类型：

- `string`

示例：

- `今天`
- `昨天`
- `前天`
- `刚刚`
- `上周三`

含义：

- 当前轮可安全使用的原始时间锚

---

### `resolvedRelativeTime`

类型：

- `string`

示例：

- `2026-03-25`
- `2026-03-24`
- 空字符串

含义：

- 当前轮相对时间在 Stage 2 中能保守落下来的最小解析结果

说明：

- 解析不稳时允许留空
- Stage 2 不要求完整时间系统

---

### `isActiveEventFollowUp`

类型：

- `boolean`

含义：

- 当前输入更像是在补充上一件事，而不是新开话题

作用：

- 回复围绕当前活跃事件收敛
- 避免短句被误当成新事件

---

### `memorySignal`

类型：

- `boolean`

含义：

- 当前轮是否允许进入候选记忆过滤阶段

注意：

- 不是“必存”
- 只是“允许进一步判断”

---

## 2. 使用原则

Stage 2 的回答控制器遵守三条原则：

1. `replyStrategy` 决定回复主动作
2. `isMetaConversation / shouldAvoidMemoryRecall` 决定能不能拉旧记忆
3. `correctionType / hasTimeConflict / hasEntityConflict` 决定要不要先收回旧理解

如果这些字段互相冲突，优先级如下：

1. `isMetaConversation`
2. `correctionType`
3. `isActiveEventFollowUp`
4. `responseMode`

---

## 3. Stage 2 边界

这份字段定义只服务于 Stage 2。

它还不是：

- 正式 `time_ref`
- 正式 `event`
- 正式 `revision`

这些对象留到后续阶段单独建模。
