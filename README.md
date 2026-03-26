
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

```bash
npm install
```

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

```env
DEEPSEEK_API_KEY=你的key
```

注意：

- 不要加多余空格
- 不要把 `.env` 发到群里
- 不要提交到公共仓库

---

## 6. 启动后端服务

在项目根目录运行：

```bash
npm start
```

这个命令等价于：

```bash
node server.js
```

正常情况下会启动本地服务，端口是：

```text
http://localhost:3001
```

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

- `index.html`
- `chat.html`
- `memory.html`
- `memory-map.html`
- `setting.html`

通常测试 AI 对话时，先开：

- `index.html`
- 或 `chat.html`

---

## 8. 启动后如何确认有没有跑对

请按下面顺序检查。

### 8.1 检查后端是否正常

浏览器打开：

```text
http://localhost:3001/api/health
```

如果能看到类似下面的 JSON：

```json
{
  "ok": true,
  "model": "...",
  "hasApiKey": true
}
```

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

```bash
npm run stage2:smoke
```

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
