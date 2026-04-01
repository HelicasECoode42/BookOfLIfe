<<<<<<< HEAD

# 温伴项目本地运行与 AI 测试说明

这份文档是给项目组成员使用的。

目标很简单：

1. 把项目在自己电脑上跑起来
2. 能正常打开网页
3. 能让 AI 正常回复
4. 能按统一方式测试 AI 的表现
5. 能把自己的修改提交到 GitHub 并发起 PR

---

## 1. 项目是什么

这个项目目前分成两部分：

- 前端页面：`index.html`、`chat.html`、`memory.html`、`memory-map.html` 等
- 本地后端服务：`server.js`

前端页面会请求本地后端：

- `http://localhost:3001`

所以必须先把后端跑起来，否则页面里的 AI 能力会失效。

---

## 2. 运行前需要准备什么

请先确认自己电脑上已经有下面这些工具：

### 2.1 安装 Node.js

建议安装较新的 Node.js 版本。

检查方法：

```bash
node -v
npm -v
```

如果能看到版本号，就说明已经装好了。

如果没有，请先安装 Node.js。

---

## 3. 拿到项目代码

如果你已经有项目文件夹，可以直接跳过这一步。

如果你要从 GitHub 拉下来：

```bash
git clone 你的仓库地址
cd 你的项目文件夹
```

本项目当前主目录里能看到这些文件：

- `package.json`
- `server.js`
- `script.js`
- `index.html`
- `chat.html`
- `memory.html`

---

## 4. 安装依赖

第一次运行时，需要先安装依赖：
=======
# 温伴 Demo

温伴是一个围绕“陪伴式对话 + 记忆整理 + 人生书页”设计的原型系统。

当前这个仓库已经不是只有前端页面的静态 demo，而是包含一套可运行的本地前后端：

- 前端页面：聊天、候选草稿、记忆图谱、设置
- 后端服务：AI 代理、结构化接口、状态持久化、回复 trace 落盘
- 本地状态：会把聊天、候选线索、活跃事件、修订日志、事实层等写到服务端 `data/` 目录

## 原型边界

当前版本明确是：

- 单用户本地原型
- 适合组内测试与答辩演示
- 文件型持久化，不是正式数据库系统

当前版本还不是：

- 多用户产品
- 商业级部署方案
- 完整账号与权限系统
- 正式隐私合规方案

## 当前能力

- 对话时先走 `reply-plan`，再生成正式回复
- 支持时间修订，如“不是今天，是昨天”
- 支持人物修订，如“不是朋友A，是朋友B”
- 支持短句跟随，如围绕同一事件接“活动内容”“感受”
- 支持人物别名归并，如“别名A就是朋友A”
- 支持候选线索整理、草稿确认、人生线摘要
- 支持服务端状态恢复与 reply trace 持久化

## 项目结构

- [index.html](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/index.html)
  封面页 / Demo 首页
- [chat.html](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/chat.html)
  温伴聊天页
- [memory.html](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/memory.html)
  候选草稿与记忆页
- [memory-map.html](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/memory-map.html)
  人物 / 时间 / 线索图谱
- [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/script.js)
  前端主逻辑
- [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/server.js)
  本地后端服务
- [docs/](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/docs)
  分阶段设计说明
- [scripts/stage2_smoke_check.mjs](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/scripts/stage2_smoke_check.mjs)
  前端逻辑 smoke
- [scripts/stage9_backend_smoke.mjs](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/scripts/stage9_backend_smoke.mjs)
  后端持久化 smoke

## 运行方式

### 1. 安装依赖
>>>>>>> e751138 ( 照片墙修改)

```bash
npm install
```

<<<<<<< HEAD
如果依赖已经装过，一般不需要重复安装。

---

## 5. 配置 API Key

这个项目的后端会调用 DeepSeek，所以本地必须配置环境变量：

- `DEEPSEEK_API_KEY`

### 5.1 最简单的方法：新建 `.env`

在项目根目录新建一个文件：

```bash
.env
```

内容写成下面这样：
=======
### 2. 配置环境变量

在项目根目录新建 `.env`：
>>>>>>> e751138 ( 照片墙修改)

```env
DEEPSEEK_API_KEY=你的key
```

<<<<<<< HEAD
注意：

- 不要加多余空格
- 不要把 `.env` 发到群里
- 不要提交到公共仓库

---

## 6. 启动后端服务

在项目根目录运行：
=======
### 3. 启动后端
>>>>>>> e751138 ( 照片墙修改)

```bash
npm start
```

<<<<<<< HEAD
这个命令等价于：

```bash
node server.js
```

正常情况下会启动本地服务，端口是：
=======
后端默认运行在：
>>>>>>> e751138 ( 照片墙修改)

```text
http://localhost:3001
```

<<<<<<< HEAD
### 6.1 如果出现这个报错

```text
Error: listen EADDRINUSE: address already in use :::3001
```

意思是：

- 3001 端口已经被别的进程占用了
- 通常是你之前已经启动过一次，没有关掉

先查是谁占用了 3001：

```bash
lsof -i :3001
```

然后结束那个进程：

```bash
kill -9 进程号
```

再重新运行：

```bash
npm start
```

---

## 7. 打开前端页面

### 推荐方式：用 VS Code 的 Live Server

不要直接双击 `index.html`。

更稳妥的方式：

1. 用 VS Code 打开项目文件夹
2. 安装 `Live Server` 插件
3. 右键 `index.html`
4. 点击 `Open with Live Server`

页面一般会在类似下面的地址打开：

```text
http://127.0.0.1:5500/index.html
```

只要后端已经在跑，页面里的 AI 请求就能正常发到：

```text
http://localhost:3001
```

### 也可以直接打开的页面

项目里目前常用页面有：
=======
### 4. 打开前端

推荐用 VS Code 的 Live Server 打开 [index.html](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/index.html)。

也可以直接打开以下页面：
>>>>>>> e751138 ( 照片墙修改)

- `index.html`
- `chat.html`
- `memory.html`
- `memory-map.html`
<<<<<<< HEAD
- `setting.html`

通常测试 AI 对话时，先开：

- `index.html`
- 或 `chat.html`

---

## 8. 启动后如何确认有没有跑对

请按下面顺序检查。

### 8.1 检查后端是否正常

浏览器打开：
=======

## 快速检查

### 健康检查

打开：
>>>>>>> e751138 ( 照片墙修改)

```text
http://localhost:3001/api/health
```

<<<<<<< HEAD
如果能看到类似下面的 JSON：
=======
如果返回：
>>>>>>> e751138 ( 照片墙修改)

```json
{
  "ok": true,
<<<<<<< HEAD
  "model": "...",
=======
>>>>>>> e751138 ( 照片墙修改)
  "hasApiKey": true
}
```

<<<<<<< HEAD
说明后端是通的。

### 8.2 如果 `hasApiKey` 是 `false`

说明：

- 你的 `.env` 没配置好
- 或者 key 没读进去

这时 AI 相关功能会失败。

请回到第 5 步重新检查。

### 8.3 检查前端是否正常

进入网页后，尝试输入一句简单的话：

```text
你好啊
```

如果页面能正常显示用户消息和 AI 回复，说明主链路正常。

---

## 9. 本地自动检查怎么跑

项目里现在有一个 smoke test：
=======
说明后端已启动且 key 正常。

### 自动检查

前端逻辑 smoke：
>>>>>>> e751138 ( 照片墙修改)

```bash
npm run stage2:smoke
```

<<<<<<< HEAD
它会跑一些基础检查，比如：

- 时间修订
- 人物修订
- 活跃事件跟随
- alias 归并
- 候选卡聚合

如果输出是：

```text
stage2 smoke check passed
```

说明基础逻辑没有明显断掉。

### 9.1 建议每次改代码后都跑这两个

```bash
node --check script.js
npm run stage2:smoke
```

第一个检查语法。

第二个检查关键功能。

## 10. 测试时请怎么记录问题

每次发现问题，尽量按这个格式记录：

### 10.1 记录模板

```text
【测试主题】
比如：时间修订 / 人物修订 / alias / 短句跟随 / 元对话

【输入对话】
把完整对话复制出来

【实际结果】
AI 是怎么回的
候选卡是怎么出的

【期望结果】
你本来觉得它应该怎么回

【补充信息】
有没有闪退
有没有刷新
有没有出现重复卡片
```

### 10.2 最重要的是保留完整上下文

不要只发一句：

```text
它又错了
```

这种信息不够。

最好把前后 5 到 10 轮一起发出来。

---

## 11. 常见问题排查

### 11.1 页面能打开，但 AI 不回复

先检查：

1. 后端有没有启动
2. `http://localhost:3001/api/health` 能不能打开
3. `.env` 里有没有 `DEEPSEEK_API_KEY`

### 11.2 页面回复很慢

先确认：

1. 后端是不是还活着
2. 网络是否正常
3. 是否是首次调用模型，稍慢是可能的

### 11.3 还是报 3001 端口占用

重复执行：

```bash
lsof -i :3001
kill -9 进程号
```

### 11.4 改了代码但页面没变化

试下面几个动作：

1. 刷新浏览器
2. 重新启动 Live Server
3. 重新启动 `npm start`
4. 清一下浏览器缓存

---

## 12. Git 基本提交流程

如果你改完代码，准备提交到自己的 GitHub 分支，可以按下面做。

### 12.1 先看当前状态

```bash
git status
```

### 12.2 切到自己的分支

如果已经有自己的分支：

```bash
git checkout 你的分支名
```

如果还没有，就新建一个：

```bash
git checkout -b 你的分支名
```

### 12.3 添加改动

```bash
git add .
```

如果你只想加部分文件，也可以逐个加：

```bash
git add script.js
git add server.js
git add scripts/stage2_smoke_check.mjs
```

### 12.4 提交

```bash
git commit -m "fix: improve ai event linking"
```

提交信息尽量写清楚这次改了什么。

### 12.5 推到远程

```bash
git push origin 你的分支名
```

### 12.6 去 GitHub 发 PR

1. 打开 GitHub 仓库页面
2. 找到刚刚 push 的分支
3. 点击 `Compare & pull request`
4. 填写标题和描述
5. 发起 PR

---

## 13. PR 描述建议怎么写

建议按这个模板：

```text
这次改了什么：
- 修了什么问题
- 加了什么能力

怎么验证：
- node --check script.js
- npm run stage2:smoke
- 手动测试了哪些对话

还有什么没做：
- 哪些问题还没收尾
```

---

## 14. 推荐测试习惯

每次改动后，建议固定按下面顺序：

1. `git status`
2. `node --check script.js`
3. `npm run stage2:smoke`
4. 手动测 2 到 3 组真实对话
5. 确认没问题再提交

---

## 15. 当前项目最值得重点测的方向

接下来最值得组员集中测试的是：

- 时间纠正后，AI 会不会继续沿用旧时间
- 人物纠正后，AI 会不会继续沿用旧人物
- `她/他` 这种短补充能不能正确挂回当前事件
- `朋友A / 别名A` 这种 alias 会不会裂成两个人
- 候选卡会不会把同一件事拆成多张
- 产品状态问题会不会被误收成生活记忆

---

## 16. 一句话版本

如果只记最关键的流程，就记这个：

```bash
npm install
```

新建 `.env`：

```env
DEEPSEEK_API_KEY=你的key
```

启动后端：

```bash
npm start
```

打开前端页面：

- 用 Live Server 打开 `index.html`

跑基础检查：

```bash
npm run stage2:smoke
```

改完提交：

```bash
git status
git add .
git commit -m "你的提交说明"
git push origin 你的分支名
```

然后去 GitHub 发 PR。
=======
后端持久化 smoke：

```bash
npm run stage9:backend-smoke
```

## Demo 演示路径

建议正式演示时按下面顺序走。

### 路径 1：从聊天到候选草稿

1. 打开封面页
2. 进入聊天页
3. 连续输入一段有时间、人物、事件的对话
4. 展示 AI 回复如何承认修订
5. 展示右侧或下方候选线索如何出现
6. 点击“收进这一页”生成草稿

适合展示：

- 对话控制
- 时间修订
- 人物修订
- 候选线索生成

### 路径 2：从候选线索到记忆页

1. 进入 [memory.html](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/memory.html)
2. 查看待整理线索
3. 点击“整理成草稿”
4. 查看人物、时间、事件抽取结果
5. 确认保留

适合展示：

- 对话片段如何进入记忆页
- 草稿确认机制
- AI 整理不是直接入库，而是先给用户确认

### 路径 3：从记忆页到图谱页

1. 进入 [memory-map.html](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/memory-map.html)
2. 切换人物 / 时间 / 人生线索
3. 展示同一条人物线如何逐渐成形
4. 展示时间片段和草稿如何被汇总

适合展示：

- 不是简单聊天记录堆积
- 系统正在把片段收成结构

## 推荐测试主题

组内测试时建议围绕以下几类问题：

- 时间修订：如“不是今天，是昨天”
- 人物修订：如“不是朋友A，是朋友B”
- 代词补槽：如“她就是那个过生日的朋友”
- 别名归并：如“别名A就是朋友A”
- 短句跟随：如“活动内容”“感受”“后来呢”
- 元对话分流：如“我点了忆光但没保存”
- 候选卡聚合：看同一事件会不会被拆成多张

## 后端当前状态

当前版本已经完成最小可用后端持久化：

- 服务端状态文件：`data/app_state.json`
- 回复 trace 文件：`data/reply_traces.json`

服务端可恢复的关键对象包括：

- 聊天记录
- 记忆候选
- 活跃事件
- 修订日志
- 事实层
- 人物别名
- 草稿状态

这意味着：

- 页面刷新后不再只靠浏览器本地缓存
- Demo 过程中的关键状态会保留
- 可以为后续正式数据库版本继续演进

## 数据与隐私说明

当前原型会在本地保存：

- 聊天记录
- 记忆候选与草稿
- 活跃事件与修订日志
- 事实层与 reply trace
- 上传照片
- 温伴形象图

这些内容都可能包含个人生活信息，因此当前仓库已经默认忽略：

- `.env`
- `data/`
- `uploads/`
- `.DS_Store`

最小安全边界：

- 服务端关闭 `x-powered-by`
- 原型版 CORS 只允许本地 / 指定来源
- 图片上传有限制

当前仍未完成：

- 多用户隔离
- 登录与鉴权
- 加密存储
- 用户删除与导出流程

详细说明见：

- [docs/stage14_minimum_security_and_user_plan.md](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/docs/stage14_minimum_security_and_user_plan.md)

## 已完成阶段

- Stage 2：回答控制器
- Stage 3：时间对象 MVP
- Stage 4：事件层 MVP
- Stage 5：修订机制与元对话分流
- Stage 6：长期事实层 MVP
- Stage 7：回答控制层与安全检查
- Stage 8：检索重排与时间优先召回
- Stage 9：后端持久化与状态恢复 MVP

## 当前仍未完成

当前后端仍是文件型持久化，不是正式数据库系统。

还没有做：

- 多用户隔离
- 真正数据库建模
- 后端主导的事件图谱计算
- trace 查询页
- 冲突回放 UI
- 运维级部署方案

## 常见问题

### 1. `npm start` 报端口占用

先查 3001：

```bash
lsof -i :3001
```

再结束旧进程：

```bash
kill -9 进程号
```

### 2. 页面能打开但 AI 不回复

优先检查：

- 后端是否在跑
- `.env` 是否配置了 `DEEPSEEK_API_KEY`
- `/api/health` 是否返回 `hasApiKey: true`

### 3. 页面刷新后内容不一致

当前版本会优先从后端恢复状态。

如果你之前在旧版本里跑过很多本地缓存，可以先清空浏览器本地缓存，再重新打开页面，让它按新的服务端状态同步。

## 参考文档

- [docs/stage2_execution_design.md](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/docs/stage2_execution_design.md)
- [docs/stage3_time_mvp.md](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/docs/stage3_time_mvp.md)
- [docs/stage4_event_mvp.md](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/docs/stage4_event_mvp.md)
- [docs/stage5_revision_meta_mvp.md](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/docs/stage5_revision_meta_mvp.md)
- [docs/stage6_fact_mvp.md](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/docs/stage6_fact_mvp.md)
- [docs/stage7_9_fact_confirmation_consistency.md](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/docs/stage7_9_fact_confirmation_consistency.md)
- [docs/stage9_backend_persistence.md](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/结题v1%20copy%202/docs/stage9_backend_persistence.md)
>>>>>>> e751138 ( 照片墙修改)
