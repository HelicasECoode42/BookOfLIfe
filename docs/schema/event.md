# 事件对象 Schema

这份文档定义系统中的统一事件对象 `event`。

事件是系统的第一记忆单元，用于承载：

- 当前或近期正在聊的一件事
- 一段可补充、可修订的生活片段
- 元对话或纠错片段

---

## 一、最小 Schema

```json
{
  "event_id": "event_001",
  "title": "昨天和赵姐出门的事",
  "summary": "用户提到昨天和赵姐出门，但暂时没想起具体去做什么。",
  "event_type": "daily_event",
  "status": "tentative",
  "people": ["赵姐"],
  "actions": ["出门"],
  "locations": [],
  "emotion": "平静",
  "time_ref": {},
  "source_turn_ids": ["turn_001", "turn_002"],
  "confidence": 0.72,
  "completeness": 0.45,
  "needs_followup": true,
  "followup_question": "你说的是昨天出门那次，后来是去办事还是去玩什么了吗？",
  "revision_of": null,
  "merged_from": [],
  "created_at": "2026-03-26T10:40:00+08:00",
  "updated_at": "2026-03-26T10:42:00+08:00"
}
```

---

## 二、字段定义

### `event_id`

唯一标识符。

建议格式：

- `event_<uuid>`
- `event_<timestamp>_<shortid>`

---

### `title`

对事件的简短标题，供内部展示和候选列表使用。

要求：

- 不要编造细节
- 不要下过重结论

---

### `summary`

事件的短摘要。

要求：

- 概括事实
- 不含未经确认的推断

---

### `event_type`

事件类型，枚举值：

- `daily_event`
- `life_story`
- `relationship_event`
- `emotional_episode`
- `preference_signal`
- `meta_conversation`
- `correction_episode`

说明：

- `meta_conversation` 用于“没存档、你还记得吗、你没听懂”等系统相关对话
- `correction_episode` 用于明确纠正模型或旧理解的场景

---

### `status`

事件状态，枚举值：

- `tentative`
- `active`
- `confirmed`
- `revised`
- `deprecated`
- `merged`
- `split`

说明：

- `tentative`：刚识别到的候选事件
- `active`：当前对话正在围绕它展开
- `confirmed`：核心字段相对稳定
- `revised`：被明确修订过

---

### `people`

事件相关人物列表。

要求：

- 优先用用户明确提到的人
- 不要根据模型猜测扩充

---

### `actions`

事件中的动作或行为列表。

例如：

- `出门`
- `通电话`
- `买菜`

---

### `locations`

地点列表。若无明确证据，可为空。

---

### `emotion`

当前事件承载的主要情绪线索。

要求：

- 只表示当前片段中的表达情绪
- 不能直接升格为长期人格判断

---

### `time_ref`

关联的时间对象，使用统一 `time_ref schema`。

---

### `source_turn_ids`

支持该事件的原始轮次 id 列表。

要求：

- 必须可追溯到原始输入

---

### `confidence`

系统对“这确实是一条独立事件”的信心。

---

### `completeness`

事件完整度。

说明：

- 完整度低不等于错误
- 一个事件可以高可信但低完整

---

### `needs_followup`

是否建议轻量追问补足事件。

---

### `followup_question`

建议的最小追问。

要求：

- 小
- 具体
- 不盘问

---

### `revision_of`

若该事件是某个旧事件的修订版本，可指向原事件 id。

MVP 阶段可为空，主要依赖 revision log。

---

### `merged_from`

若该事件由多个旧事件合并而来，记录旧事件 id 列表。

---

## 三、事件动作语义

当前输入与事件层的关系只能属于以下四类之一：

- `create_new_event`
- `attach_to_existing_event`
- `revise_existing_event`
- `uncertain`

说明：

- 任何事件处理逻辑都应先输出这四类之一

---

## 四、事件状态流转

推荐状态流如下：

1. `tentative`
2. `active`
3. `confirmed`
4. `revised`
5. `deprecated` 或保留为 `confirmed`

可选分支：

- 多事件合并 -> `merged`
- 一事件拆分 -> `split`

---

## 五、使用规则

### 1. 事件先于长期事实

单条输入最多先形成事件候选，不直接形成长期事实。

### 2. 事件允许不完整

允许只知道人物和时间，不知道具体动作。

### 3. 纠错优先修订事件

如果用户是在纠正旧理解，应优先修订既有事件，不优先新建。

### 4. 元对话与生活事件分流

以下内容优先考虑进入 `meta_conversation`：

- 没存档
- 你还记得吗
- 你没听懂
- 我刚刚说错了

---

## 六、禁止事项

以下行为视为非法：

1. 将寒暄句直接创建成事件
2. 将元对话直接写入生活事件
3. 用户纠错后仍沿用旧事件字段回答
4. 把猜测的人物或动作写入事件主字段
