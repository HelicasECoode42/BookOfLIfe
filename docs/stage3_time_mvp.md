# Stage 3 时间模块 MVP

这份文档描述当前已经落地的 Stage 3 第一版时间模块。

范围只覆盖你定义的 MVP，不进入后端持久化与长期时间语义。

---

## 1. Stage 3 目标

Stage 3 的目标不是“再补几个时间词”，而是把时间变成系统内部的一级对象。

当前这一版已经做到：

1. 独立时间词检测入口
2. 相对时间到绝对时间的基础映射
3. 人生阶段时间的保守标注
4. 时间置信度输出
5. 与当前活跃事件的时间冲突检测
6. 面向回答层的时间使用策略输出

---

## 2. 当前已实现的时间对象

新增的最小时间对象结构：

```json
{
  "rawText": "昨天",
  "normalizedLabel": "昨天",
  "timeType": "relative_day",
  "resolvedDate": "2026-03-25",
  "lifeStageLabel": "",
  "confidence": 0.96,
  "anchorSource": "relative_day"
}
```

当前代码位置：

- `parseTimeRef()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js)
- `buildReplyTimeStrategy()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js)
- `detectTimeConflictWithActiveEvent()`  
  [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js)

---

## 3. 当前支持的时间表达

### 相对日

- 今天
- 今儿
- 昨天
- 前天
- 大前天
- 明天
- 后天
- 刚刚
- 刚才
- 这会儿
- 前两天
- 前三天

### 模糊近期

- 最近
- 前几天
- 上次
- 那次
- 那会儿

### 相对周内星期

- 这周三
- 本周三
- 上周三
- 下周五

### 周期性表达

- 每周四

### 人生阶段

- 小时候
- 上小学

---

## 4. 当前输出给回答层的字段

Stage 3 MVP 已经把这些字段接进 `reply-plan`：

- `timeRef`
- `timeConfidence`
- `conflictDetected`
- `revisionNeeded`
- `replyTimeStrategy`

其中：

### `timeRef`

当前轮可安全使用的最小时间对象。

### `timeConfidence`

0 到 1 之间。

高置信示例：

- 昨天
- 前天
- 刚刚

中低置信示例：

- 前几天
- 上次
- 那会儿

### `conflictDetected`

当前时间解释是否与活跃事件时间不一致。

### `revisionNeeded`

当前轮是否应修正旧事件时间。

### `replyTimeStrategy`

当前支持的取值：

- `use_resolved_time`
- `use_relative_label_only`
- `acknowledge_uncertainty`
- `revise_active_event_time`
- `no_time_anchor`

---

## 5. 当前做到什么程度

如果按 Stage 3 MVP 估算，目前大约完成到 `70% 到 80%`。

### 已完成

- 时间对象结构已建
- 高低置信时间已经区分
- 人生阶段时间不再硬转具体年份
- 活跃事件冲突检测已接入
- 回答层时间策略已接入
- 自动 smoke 已覆盖核心样例

### 还没做的

- 时间对象持久化
- 正式的 revision 日志
- 更复杂的长期时间语义
- 多时间片段自动拆分成多个事件
- 时间对象与记忆候选的完整结构化联动

这些内容不适合在当前 MVP 阶段硬塞进去。

---

## 6. 与后端的边界

长期时间语义和持久化层，后面会更偏后端/状态层：

- 时间对象入库存储
- revision 历史保留
- 时间线合并与查询
- 长期 life stage 聚合

这一版 Stage 3 先只做：

- 前端 AI 可用的时间对象
- 回答前决策所需的最小时间能力

---

## 7. 当前验证结果

本地已通过：

```bash
node --check script.js
node --check server.js
npm run stage2:smoke
```

当前 smoke 已覆盖：

- `昨天` 稳定解析
- `前天` 修订建议
- `下周五` 相对周内日期解析
- `每周四` 周期性表达
- `小时候` 只保守标注 life stage
- 时间冲突触发 `acknowledge_uncertainty`

---

## 8. 下一步建议

如果继续推进 Stage 3，建议顺序如下：

1. 把 `timeRef` 正式接进 `memory-filter`
2. 把候选记忆的时间字段从字符串提升成结构对象
3. 让一句话里的多时间片段能拆成多个候选事件
4. 再考虑后端持久化与 revision 日志
