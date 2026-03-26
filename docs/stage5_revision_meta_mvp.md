# Stage 5 修订与元对话分流 MVP

Stage 5 的目标是让系统真正学会“被纠正后更新自己”，并把元对话从生活事件里分出来。

## 已落地

- 新增修订日志存储：
  - `revisionLogs`
- 时间修订会记录：
  - 旧时间
  - 新时间
  - 目标事件 id
- 人物修订会记录：
  - 旧人物
  - 新人物
  - 目标事件 id
- 元对话新增细分类型：
  - `product_state`
  - `stability_feedback`
  - `understanding_repair`

## 当前规则

- `没存档 / 点了忆光没保存 / 看不到卡片整理` -> `product_state`
- `闪退 / 版本 / 稳定性` -> `stability_feedback`
- `你没听懂 / 我不是这个意思 / 理解偏了` -> `understanding_repair`

## 当前效果

- 修订后旧值不会只在事件对象里悄悄被覆盖，已经会写入日志
- 元对话仍会被前置分流，不进入生活候选记忆

## 验证覆盖

- 时间修订会产生日志 `time_revision`
- 人物修订会产生日志 `entity_revision`
- 元对话会返回明确 `metaConversationType`

当前可视为 Stage 5 MVP 已过闸门。
