# Stage 11 Photo Wall MVP

这一阶段只做轻量照片墙，不做图片理解和重媒体后端。

## 目标

- 本地上传图片
- 文件真实落盘
- 元数据持久化
- 人生之书页面立即展示缩略图
- 允许手动挂到人物或某一页记忆

## 当前完成

### 服务端

- 新增静态资源目录 `uploads/`
- 新增图片接口：
  - `GET /api/photos`
  - `POST /api/photos`
  - `PUT /api/photos/:id`
  - `DELETE /api/photos/:id`
- 图片元数据写入现有 `app_state.json` 的 `photos` 字段
- 服务端可直接回放已上传图片，刷新后不丢

### 前端

- 人生之书页面新增照片上传区
- 可选择：
  - 挂到人物
  - 挂到某条记忆
  - 填一句备注
- 上传成功后立即在照片墙里显示
- 已挂到人物的照片会优先出现在人物相册卡片上
- 支持删除照片
- 支持改人物挂接

## 设计取舍

- 不引入数据库
- 不做 OCR
- 不做自动人物识别
- 不做自动按时间分类
- 不做阻塞聊天的图片处理链

这保证了：

- 照片墙是独立增强层
- 出问题也不会拖垮聊天主链
- 上传与展示可以作为 Demo 能力稳定演示

## 验证

```bash
node --check script.js
node --check server.js
npm run stage9:backend-smoke
npm run stage11:photo-smoke
```
