# Stage 7-9: Fact Layer, Confirmation, Consistency

这份文档把 Stage 6 之后继续推进的三个模块收成一条连续链路：

1. Stage 7：事实提取层 `Fact DB`
2. Stage 8：反向确认 `needsConfirmation`
3. Stage 9：多轮一致性检查 + 人物别名归并 + 事件槽位补齐

## 1. 当前目标

不是直接把所有后端持久化一次做完，而是在现有前端本地链路里先把 AI 的“可用事实”和“不确定时的行为”收紧：

- 不让长期画像继续直接吃生聊天
- 不让人物别名继续裂成两个人
- 不让代词补充句继续掉失人物槽位
- 不让明显矛盾的时间/人物补充被直接接过去

## 2. 新增数据层

### Person Alias Map

本地新增：

- `life_book_person_aliases_v1`

结构：

- `canonicalId`
- `displayName`
- `aliases`
- `confidence`
- `evidenceCount`
- `updatedAt`

用途：

- 把 `老徐 / 清江移步` 这类显式同一人做归并
- 统一 active event、candidate、memory、fact 的人物名

### Fact Database

本地新增：

- `life_book_fact_database_v1`

结构：

- `subjectId`
- `subjectType`
- `predicate`
- `object`
- `canonicalObjectId`
- `factType`
- `verificationStatus`
- `confidence`
- `aliases`
- `evidenceIds`
- `lastSeenAt`
- `notes`

当前 fact type：

- `relationship_pattern`
- `life_theme_fact`
- `alias_fact`
- `event_slot_fact`

## 3. Stage 7 已落地内容

### 事实层重构

原来的 `localFacts` 还只是一个本地统计层。现在变成两层：

- `localFacts`：聚合支持证据
- `factDatabase`：提供给回复层使用的事实层

### verified 规则

目前以下内容会进入 `verified`：

- 明确的 alias merge
- 已经达到稳定支持阈值的人物/主题事实
- 活跃事件里高置信或被修订确认过的时间/人物槽位

### 回复层约束

`retrieveRelevantProfileSignals()` 现在优先只读 `verified` 事实，不再把未验证的统计项直接当安全事实使用。

## 4. Stage 8 已落地内容

### needsConfirmation

`replyPlan` 新增：

- `needsConfirmation`
- `confirmationPrompt`
- `consistencyWarnings`

当前触发条件：

- 当前句里只有代词，但没有足够上下文确定人物
- 一句话里出现多个候选人物，且不是显式纠正句
- 当前补充和活跃事件的时间/人物出现冲突，但用户并没有明确说“我在纠正你”

### 回复执行

如果 `needsConfirmation = true`，回复层会优先直接发出确认句，而不是假装自己已经懂了。

## 5. Stage 9 已落地内容

### 人物别名归并

新增显式 alias merge 识别：

- `X 就是 Y`
- `叫她 X`
- `备注为 X`
- `改叫 X`

识别到后会执行：

1. 更新 alias map
2. 回写 memories / candidates / active event 中的人物名
3. 重建 fact DB

### 事件槽位补齐

当前轮如果没有明确人物，但满足以下条件，会自动补齐人物槽位：

- 是对上一轮问题的短回答，且目标槽位是人物
- 是代词补充句，且 active event 已有稳定人物

这样可以把：

- `今天写好啦！早上写的，去给她过生日，刚回来`

继续挂到：

- `清江移步 / 老徐`

这条活跃事件上，而不是再生成一张“还缺人物”的低质量卡片。

### 一致性检查

当前先做保守版：

- 只检查和 `activeEvent` 的人物/时间冲突
- 不直接替用户裁定
- 一旦冲突且不是显式修订，就转成温和确认

## 6. 自动回归

已补 smoke 覆盖：

- `needsConfirmation`
- `verified fact` 可被召回
- alias merge 生效
- pronoun slot fill 生效

命令：

```bash
node scripts/stage2_smoke_check.mjs
```

## 7. 还没做的部分

这轮还没把下面这些推进到后端持久化层：

- 服务器侧的完整 Fact DB 持久化
- 更长跨度的跨天一致性比对
- location slot 的结构化解析
- 更完整的事件图谱与 event-to-event merge

这些更适合在后续后端阶段继续做，而不是现在硬塞进前端本地链路。
