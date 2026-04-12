# 温伴忆光 iOS / TestFlight 打包说明

这份说明只写当前仓库已经具备的打包链路，以及还需要人工完成的 Apple 环节。

## 当前已经接好的部分

- Capacitor iOS 工程已创建：
  - `ios/App`
- 移动端静态包构建脚本已接好：
  - `npm run build:mobile-web`
- iOS 同步脚本已接好：
  - `npm run cap:sync:ios`
- iOS 基础权限文案已写入：
  - 相机
  - 麦克风
  - 相册读取
  - 相册写入
  - 语音识别

## 当前项目结构

- Web 入口页面：
  - `app.html`
- 移动打包输出目录：
  - `mobile_web/`
- iOS 原生工程：
  - `ios/App/`

## 打包前必须确认

### 1. 后端地址

当前移动构建支持通过环境变量注入 API 地址：

```bash
APP_API_BASE_URL=https://你的后端域名 npm run cap:sync:ios
```

如果不传：

- 桌面本地开发会默认指向 `localhost:3001`
- 真机 App 不应该继续使用 `localhost:3001`

所以要上 TestFlight，必须先有一个可访问的后端地址。

### 2. OpenAI / 服务端环境变量

确认服务端部署时已经配置：

- `OPENAI_API_KEY`
- 其他你们后端依赖的语音或图像服务参数

### 3. Apple 侧资料

需要你们自己准备：

- Apple Developer 账号
- App Store Connect 中的新 App 记录
- Bundle ID：
  - `com.helicase.wenbanyiguang`
- 签名团队与证书

## 本地同步步骤

### 1. 进入项目目录

```bash
cd /Users/wangyufan/Desktop/HelicasE/大学生创新创业/verson_app
```

### 2. 生成移动端资源并同步到 iOS

```bash
APP_API_BASE_URL=https://你的后端域名 npm run cap:sync:ios
```

### 3. 打开 Xcode

```bash
npm run cap:open:ios
```

## Xcode 内需要做的事

### 1. 选择 Team

在 `Signing & Capabilities` 中：

- 选择开发团队
- 确认 Bundle Identifier 正确

### 2. 修改版本号

在 Xcode 的 target 里更新：

- Version
- Build

### 3. 检查权限文案

当前已写入 `Info.plist`，上线前只需要再检查措辞是否符合答辩或上架版本。

### 4. Archive

在 Xcode 中：

1. 选择真机或 Any iOS Device
2. `Product` -> `Archive`

### 5. 上传 TestFlight

在 Organizer 中：

1. `Distribute App`
2. `App Store Connect`
3. `Upload`

## 当前还不是自动完成的部分

这些环节仍然需要人工：

- 真正部署后端
- 配置 HTTPS 域名
- Xcode 签名
- 上传到 App Store Connect
- 填写 TestFlight 测试说明
- 更换正式 App Icon / Splash

## 当前建议的提交流程

1. 先部署后端
2. 用 `APP_API_BASE_URL` 重新执行 `npm run cap:sync:ios`
3. 在真机上跑一轮聊天 / 忆光 / 照片库
4. 检查上传照片、生成形象、对话主链都通
5. 再 Archive 并上传 TestFlight

## 当前可用的验证命令

```bash
node --check script.js
npm run build:mobile-web
npm run stageM2:app-smoke
npm run stage11:photo-smoke
npm run stage13:integration-smoke
npm run stageM3:ios-smoke
```
