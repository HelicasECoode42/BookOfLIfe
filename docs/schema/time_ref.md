# 时间对象 Schema

这份文档定义系统中的统一时间对象 `time_ref`。

目标：

- 把时间从普通文本字段提升为一级对象
- 支持解析、比较、修订、检索
- 让回答层拿到的是“结构化时间依据”，不是一句模糊话

---

## 一、适用范围

`time_ref` 适用于以下对象：

- 当前输入解析结果
- 事件对象
- 修订对象中的时间字段
- 检索约束条件
- 回答层时间引用建议

---

## 二、最小 Schema

```json
{
  "time_id": "time_001",
  "raw_time_expr": "昨天",
  "normalized_time_expr": "昨天",
  "resolved_time": {
    "start": "2026-03-25T00:00:00+08:00",
    "end": "2026-03-25T23:59:59+08:00"
  },
  "time_granularity": "day",
  "time_type": "relative",
  "time_confidence": 0.96,
  "anchor_source": "system_clock",
  "timezone": "Asia/Shanghai",
  "display_label": "昨天",
  "needs_followup": false,
  "followup_question": "",
  "status": "resolved"
}
```

---

## 三、字段定义

### `time_id`

唯一标识符。

建议格式：

- `time_<uuid>`
- `time_<timestamp>_<shortid>`

---

### `raw_time_expr`

用户原话中的时间表达，原样保留。

例子：

- `昨天`
- `上次`
- `上小学那几年`
- `前几天`

---

### `normalized_time_expr`

轻度标准化后的时间表达。

作用：

- 去除冗余词
- 统一相似表达
- 便于规则匹配

例子：

- `昨天下午那会儿` -> `昨天下午`
- `前一阵子` -> `前阵子`

---

### `resolved_time`

内部标准时间区间。

格式：

```json
{
  "start": "ISO8601 datetime",
  "end": "ISO8601 datetime"
}
```

说明：

- 永远建议使用区间而不是单点
- 对无法精确解析的时间可为空

---

### `time_granularity`

时间粒度，枚举值：

- `moment`
- `hour`
- `day`
- `week`
- `month`
- `year`
- `life_stage`
- `unknown`

说明：

- `life_stage` 用于“小时候”“上小学那几年”这类人生阶段表达

---

### `time_type`

时间类型，枚举值：

- `absolute`
- `relative`
- `life_stage`
- `habitual`
- `unknown`

说明：

- `habitual` 适用于“最近总是”“以前经常”这类习惯性时间

---

### `time_confidence`

时间解释置信度，取值区间：

- `0.0 ~ 1.0`

建议规则：

- 明确日历日期：`0.95+`
- 昨天/今天/前天：`0.90+`
- 前几天/最近：`0.60 ~ 0.85`
- 上次/那会儿：`0.30 ~ 0.70`
- 人生阶段：视上下文而定

---

### `anchor_source`

这次时间解析的主要依据来源。

枚举值：

- `system_clock`
- `conversation_context`
- `event_context`
- `user_correction`
- `mixed`

---

### `timezone`

时区，必须显式记录。

例子：

- `Asia/Shanghai`
- `America/Los_Angeles`

---

### `display_label`

给 UI 和回答层用的人类可读标签。

例子：

- `昨天`
- `2026年3月25日`
- `上小学那几年`

---

### `needs_followup`

布尔值，表示是否需要追问补足时间。

---

### `followup_question`

如需补足时间，建议回答层可使用的最小追问。

例子：

- `你说的是昨天那次，还是更早前那回？`

---

### `status`

时间对象状态，枚举值：

- `resolved`
- `partially_resolved`
- `ambiguous`
- `revised`

---

## 四、使用规则

### 1. 只要出现时间词，必须生成 `time_ref`

即便最后解析不清，也要给出：

- `time_type`
- `time_granularity`
- `time_confidence`
- `status`

---

### 2. 相对时间必须结合系统当前时间

例如：

- 今天系统日期为 `2026-03-26`
- `昨天` -> `2026-03-25`

---

### 3. 人生阶段时间不能硬编具体年份

例如：

- `小时候`
- `上小学那几年`

这些表达默认落为：

- `time_type = life_stage`
- `time_granularity = life_stage`

---

### 4. 模糊时间允许保守落地

例如：

- `前几天`
- `上次`
- `那会儿`

可以只标注：

- `status = ambiguous`
- `needs_followup = true`

---

## 五、与其他对象的关系

### 与事件对象

每个事件对象最多有一个主时间对象 `time_ref`，但可以保留若干原始时间线索。

### 与修订对象

若用户纠正时间，应生成时间修订，更新事件中的 `time_ref`。

### 与回答层

回答层不能直接用原始时间词，需要用 `time_ref` 判断：

- 是否可作为确认事实说出口
- 是否只能保守引用

---

## 六、禁止事项

以下行为在系统中视为非法：

1. 用户说“小时候”，系统直接写成某年
2. 用户说“前几天”，系统编成具体日历日
3. 时间字段只存一段原话，不生成结构化对象
4. 不记录时区
5. 时间被纠正后悄悄覆盖，不留下修订痕迹
