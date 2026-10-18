# 三十八中BBS

合肥市第三十八中学BBS论坛系统

## 访问地址
- 线上: https://38middle.brightmoon.work
- 本地: http://localhost:3000

## 功能特性
- QQ频道自动同步（每60秒）
- 评论自动同步（每5分钟）
- 文件上传下载
- 用户签到系统
- 帖子点赞收藏
- 管理员权限管理

## 技术栈
- Node.js (零依赖)
- SQLite (JSON存储)
- Edge CDP (评论抓取)
- FRP (内网穿透)

## 本地部署

```bash
# 安装Node.js后
node src/app.js
```

## 目录结构
```
src/
├── app.js              # 主服务器
├── store.js            # 数据存储
├── render.js           # 页面渲染
├── upload-server.js    # 上传服务
├── auto_crawl.js       # 自动抓取
├── extract_comments.js # 评论提取
├── sync_comments.js    # 评论同步
└── public/             # 静态资源
```

## 许可证
内部使用
