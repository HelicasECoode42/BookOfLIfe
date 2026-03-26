# 回答策略与安全等级 Schema

这份文档定义系统中的统一回答策略 `reply_strategy` 与安全等级 `memory_safety_level`。

目标：

- 先决定怎么答，再生成回复
- 保证自然表达受控
- 避免低置信度记忆被说成事实

---

## 一、回答策略枚举

回答策略只允许从以下枚举中选择：

- `small_talk`
- `gentle_acknowledgment`
- `continue_event`
- `clarify_time`
- `clarify_entity`
- `gently_probe`
- `memory_recap`
- `acknowledge_revision`
- `state_uncertainty`
- `avoid_memory_claim`

---

## 二、策略定义

### `small_talk`

用于：

- 寒暄
- 短附和
- 无新信息输入

要求：

- 不触发记忆式回答
- 不主动整理成事件

---

### `gentle_acknowledgment`

用于：

- 有情绪但信息不多
- 需要先接住用户表达

---

### `continue_event`

用于：

- 当前存在较明确活跃事件
- 用户在继续讲这件事

---

### `clarify_time`

用于：

- 时间是理解当前事件的关键
- 时间解析有冲突或含糊

---

### `clarify_entity`

用于：

- 人物或对象指代不明确

---

### `gently_probe`

用于：

- 已有一定事件线索
- 只差一个小口子就能更稳

要求：

- 只能追问一个最小问题

---

### `memory_recap`

用于：

- 已确认事件可轻量回顾
- 适合温和总结

---

### `acknowledge_revision`

用于：

- 用户刚纠正系统
- 当前轮必须先承认修正

这是高优先级策略。

---

### `state_uncertainty`

用于：

- 系统不能稳定确定时间或事件
- 不应继续装作记得

---

### `avoid_memory_claim`

用于：

- 元对话
- 产品反馈
- 当前轮不适合使用记忆能力

---

## 三、回答安全等级

对可用上下文中的字段，统一分 3 级：

- `A`
- `B`
- `C`

---

### A 级：可直接说

来源：

- 用户本轮明确说出的内容
- 高置信度当前事件字段
- `active` 长期事实

用法：

- 可自然写入回复

---

### B 级：只能保守说

来源：

- 中等置信度时间解释
- 部分确认事件字段
- `supported` 但尚未完全稳定的长期事实

用法：

- 必须加保守措辞

例如：

- `像是`
- `我先按这条线记着`
- `听起来像`

---

### C 级：不能直接说

来源：

- 模型推测
- 刚被修订掉的旧信息
- 未确认检索结果
- 高风险人格或关系推断

用法：

- 只能内部参考
- 不能直接写入回复

---

## 四、回答前检查项

生成最终回复前，必须检查：

1. 是否使用了已被修订掉的旧字段
2. 是否把 B 级信息说成确定事实
3. 是否把 C 级信息直接输出
4. 是否把单次事件误说成长期事实
5. 是否在元对话中冒充记忆能力

若失败，必须降级回答策略。

---

## 五、策略优先级建议

当多种策略同时可能成立时，优先级建议如下：

1. `acknowledge_revision`
2. `state_uncertainty`
3. `clarify_time`
4. `clarify_entity`
5. `continue_event`
6. `gently_probe`
7. `memory_recap`
8. `gentle_acknowledgment`
9. `small_talk`
10. `avoid_memory_claim`

注：

- 实际业务可把 `avoid_memory_claim` 设为硬约束，而不是常规排序项

---

## 六、禁止事项

以下行为视为非法：

1. 未先选策略就直接生成回复
2. 使用 C 级信息直接说出口
3. 用户刚纠正时不使用 `acknowledge_revision`
4. 明显不确定时不使用 `state_uncertainty`
5. 元对话场景下强行做记忆式回顾
