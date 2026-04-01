# Stage 10 Voice MVP

这一阶段先做低延迟语音 MVP，不把聊天主链拖慢。

## 当前完成

- 前端支持浏览器语音输入
- 前端支持回复后自动播报
- 设置页可控制：
  - 是否开启播报
  - 是否自动朗读回复
  - 识别后是否自动发送
- 聊天页加入语音状态提示
- 服务端新增 `GET /api/voice/capabilities`
  - 说明当前是浏览器 fallback
  - 为后续接 FunASR / 远端 TTS 预留配置边界

## 当前链路

1. 用户点击“听”
2. 浏览器 ASR 转文字
3. 文字进入现有 `talk()` 主链
4. AI 先返回文字
5. 若开启播报，再由浏览器 TTS 异步朗读

## 为什么这样做

- 主回复仍然优先走文字，不被语音阻塞
- 先拿到真实可用体验，再决定是否接更强 ASR/TTS
- 浏览器能力失败时，用户可以立即退回文字模式

## 这一阶段还没做

- 方言专项 ASR
- 服务端真实语音识别
- 更自然的高质量 TTS 音色
- 语音消息历史管理

## 验证

```bash
node --check script.js
node --check server.js
npm run stage2:smoke
npm run stage9:backend-smoke
```
