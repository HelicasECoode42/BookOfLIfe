# 长期事实对象 Schema

这份文档定义系统中的统一长期事实对象 `fact`。

长期事实用于承载：

- 高频人物
- 稳定互动偏好
- 稳定生活主题
- 经多事件支持的长期信息

---

## 一、最小 Schema

```json
{
  "fact_id": "fact_001",
  "subject": "user",
  "predicate": "often_mentions_person",
  "object": "赵姐",
  "label": "用户常提到赵姐",
  "fact_type": "relationship_pattern",
  "confidence": 0.81,
  "stability": "stable",
  "status": "active",
  "evidence_event_ids": ["event_002", "event_007", "event_012"],
  "first_seen_at": "2026-03-20T09:00:00+08:00",
  "last_confirmed_at": "2026-03-26T10:55:00+08:00",
  "last_revised_at": "",
  "notes": "多次在日常对话中提到"
}
```

---

## 二、字段定义

### `fact_id`

事实唯一标识符。

---

### `subject`

事实主语。

MVP 常见值：

- `user`
- 某人物 id

---

### `predicate`

事实谓词，建议使用稳定可枚举的动作或关系短语。

例如：

- `often_mentions_person`
- `prefers_gentle_confirmation`
- `frequently_recalls_people`

---

### `object`

事实宾语。

例如：

- `赵姐`
- `轻一点的确认方式`

---

### `label`

给 UI 或调试查看的短标签。

---

### `fact_type`

事实类型，枚举值建议：

- `relationship_pattern`
- `preference_fact`
- `life_theme_fact`
- `ongoing_state_fact`
- `interaction_fact`

---

### `confidence`

系统对事实成立的置信度。

---

### `stability`

稳定性等级，枚举值：

- `volatile`
- `emerging`
- `stable`

---

### `status`

事实状态，枚举值：

- `proposed`
- `supported`
- `active`
- `revised`
- `stale`
- `deprecated`

---

### `evidence_event_ids`

支撑该事实的事件 id 列表。

要求：

- 长期事实必须可回溯到事件证据

---

### `first_seen_at`

首次出现时间。

### `last_confirmed_at`

最近一次被新事件支持的时间。

### `last_revised_at`

最近一次被修订的时间。

### `notes`

辅助说明，不参与核心判断。

---

## 三、事实形成规则

### 基本门槛

长期事实默认至少满足：

1. 至少两个独立事件支持
2. 没有被最近修订否认
3. 语义足够稳定
4. 不是一次性偶然片段

### 升级流转

推荐状态流：

1. `proposed`
2. `supported`
3. `active`

若发生冲突：

- `revised`
- `stale`
- `deprecated`

---

## 四、MVP 允许的事实类型

第一版只建议允许以下三类进入长期事实层：

1. 高频人物
2. 稳定互动偏好
3. 稳定生活主题

---

## 五、禁止升级清单

以下内容默认禁止直接进入长期事实层：

1. 单次情绪
2. 一次忘记
3. 人格标签
4. 医疗或认知能力推断
5. 模型猜测出的关系性质

例如：

- `我突然想不起来` 不能升级成 `用户记忆力下降`

---

## 六、回答层使用规则

回答层默认只允许直接使用：

- `active`
- 高置信度 `supported`

对以下状态只能内部参考，不宜直接说出口：

- `proposed`
- `revised`
- `stale`

---

## 七、禁止事项

以下行为视为非法：

1. 单条事件直接升级为长期事实
2. 无事件证据的长期事实
3. 模型脑补关系后写入事实层
4. 被否认后仍维持 `active`
