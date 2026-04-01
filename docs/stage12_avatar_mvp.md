# Stage 12 Avatar MVP

这一阶段先把“温伴有自己的形象”这件事做成可运行 MVP。

## 目标

- 单独触发一次形象生成
- 结果落盘保存
- 首页 / 聊天页 / 设置页稳定展示
- 刷新后不丢

## 当前实现

### 服务端

- 新增接口：
  - `GET /api/avatar/capabilities`
  - `GET /api/avatar`
  - `POST /api/avatar/generate`
- 新增持久化字段：
  - `companionAvatar`
- 生成结果保存到 `uploads/`
- 当前默认生成器为 `local-svg`

### 前端

- 设置页新增“数字人形象”配置区
- 可填写：
  - 形象描述
  - 画面风格
  - 场景提示
- 点击后生成并保存
- 首页、聊天页和设置页会直接展示当前形象图
- 刷新后仍然可见

## 为什么先用 local-svg

这一阶段重点不是追求最终画质，而是先把下面这条链路跑通：

1. 前端触发
2. 服务端生成
3. 文件落盘
4. 状态持久化
5. 页面稳定回显

这样以后接 ComfyUI 或其他生图服务时，只需要替换服务端生成器，不需要重做页面和数据结构。

## 当前不做

- 实时换图
- 多张候选图挑选
- 高一致性角色训练
- 动态口型或动作驱动

## 验证

```bash
node --check server.js
node --check script.js
npm run stage12:avatar-smoke
```
