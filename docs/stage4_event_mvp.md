# Stage 4 事件层 MVP

Stage 4 的目标是让系统开始围绕“事件”而不是“句子”工作。

当前这一版已经在不改后端持久化的前提下，把现有 `activeEvent` 提升成了最小事件对象。

## 已落地

- `activeEvent` 新增最小字段：
  - `eventType`
  - `status`
  - `linkAction`
  - `timeRef`
  - `sourceTurnId`
- 当前输入会先判断事件动作：
  - `create_new_event`
  - `attach_to_existing_event`
  - `revise_existing_event`
  - `uncertain`
- 事件状态已接入：
  - `tentative`
  - `active`
  - `confirmed`
  - `revised`

## 当前行为

- 明确新事件句会切出新 active event
- 短补充句会挂回旧事件
- 时间或人物纠正会修订旧事件，而不是默认新建

## 验证覆盖

- `今天我做了红烧肉` -> `create_new_event`
- `舒服` / `他约的我` -> `attach_to_existing_event`
- `诶不对，我们是前天下棋的啊` -> `revise_existing_event`

## 仍未做

- 事件列表持久化
- 多事件并存管理
- merge / split 正式流转

当前可视为 Stage 4 MVP 已过闸门。
