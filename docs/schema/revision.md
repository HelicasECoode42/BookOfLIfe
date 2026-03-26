# 修订对象 Schema

这份文档定义系统中的统一修订对象 `revision`。

修订是系统的纠错机制核心，用来表达：

- 用户纠正了旧理解
- 系统需要更新某个事件字段
- 旧值必须保留，不能悄悄覆盖

---

## 一、最小 Schema

```json
{
  "revision_id": "rev_001",
  "target_event_id": "event_001",
  "revision_type": "time_revision",
  "field": "time_ref.resolved_time",
  "old_value": "2026-03-26",
  "new_value": "2026-03-25",
  "reason": "user_explicit_correction",
  "source_turn_id": "turn_010",
  "confidence": 0.98,
  "created_at": "2026-03-26T10:45:00+08:00"
}
```

---

## 二、字段定义

### `revision_id`

修订唯一标识符。

---

### `target_event_id`

被修订的事件 id。

说明：

- MVP 阶段修订只指向事件对象
- 后期可扩展为修订事实对象

---

### `revision_type`

修订类型，枚举值：

- `time_revision`
- `entity_revision`
- `action_revision`
- `location_revision`
- `scope_revision`
- `confidence_revision`

---

### `field`

被修订字段路径。

例如：

- `time_ref.resolved_time`
- `people[0]`
- `actions`

---

### `old_value`

旧值。

要求：

- 原样保留
- 不允许在修订后丢失

---

### `new_value`

新值。

---

### `reason`

修订原因，枚举值建议：

- `user_explicit_correction`
- `context_disambiguation`
- `time_grounding_update`
- `model_self_correction`

其中优先级最高的是：

- `user_explicit_correction`

---

### `source_turn_id`

触发修订的原始轮次 id。

---

### `confidence`

系统对这次修订成立的置信度。

---

### `created_at`

修订创建时间。

---

## 三、修订触发条件

以下表达默认高优先级触发修订判断：

- 不是今天，是昨天
- 不是赵姐，是李阿姨
- 不是去跳舞，是去办事
- 不是这次，是上次
- 我刚刚说错了
- 你理解偏了

---

## 四、修订动作规则

### 1. 修订优先于追加

当用户明确纠正时，应优先修订旧事件，而不是新建一条高度相似的新事件。

### 2. 旧值必须保留

系统必须知道自己改过什么，不能直接覆盖掉旧结论。

### 3. 回答必须使用新值

一旦修订成立，当前轮回答不得继续沿用旧值。

### 4. 回答中应承认修正

例如：

- `对，是昨天那次，不是今天。`

---

## 五、禁止事项

以下行为视为非法：

1. 用户明确纠正后不生成修订对象
2. 只改结果，不保留旧值
3. 修订成立后仍继续使用旧字段
4. 把不确定修订当作确定修订
