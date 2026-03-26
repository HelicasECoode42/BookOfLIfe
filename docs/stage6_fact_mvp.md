# Stage 6 长期事实层 MVP

Stage 6 的目标是把长期事实升级门槛收紧，避免一次对话就污染长期层。

这一版仍然只做本地 MVP，不进入后端事实库。

## 已落地

- 新增本地事实存储：
  - `localFacts`
- 新增最小事实对象：
  - `id`
  - `predicate`
  - `object`
  - `factType`
  - `confidence`
  - `stability`
  - `status`
  - `evidenceEventIds`
- 本地事实会从正式记忆和候选线索重建

## 当前门槛

- 1 条独立证据：`proposed`
- 2 条独立证据：`supported`
- 3 条及以上：`active`

## 当前允许进入的事实类型

- 高频人物
- 稳定生活主题

说明：

- 稳定互动偏好当前仍主要来自已有 profile 侧输入
- 这一版先把“单次人物提到不升级”这个脏点堵住

## 回答层使用规则

当前 `retrieveRelevantProfileSignals()` 只会额外读取：

- `active`
- 高置信 `supported`

不会直接把 `proposed` 事实喂给回答层。

## 验证覆盖

- 单次 `赵姐` 提到 -> `proposed`
- 两次独立 `赵姐` 提到 -> `supported`
- `supported` 事实才允许进入回答侧信号

当前可视为 Stage 6 MVP 已过闸门。
