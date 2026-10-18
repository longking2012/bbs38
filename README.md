# 三十八中BBS

合肥市第三十八中学BBS论坛系统

[![Online](https://img.shields.io/badge/status-online-green)](https://38middle.brightmoon.work)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-active-blue)](https://longking2012.github.io/bbs38)

## 线上访问

| 地址 | 说明 |
|------|------|
| https://38middle.brightmoon.work | 完整BBS（可发帖、回复） |
| https://longking2012.github.io/bbs38 | 静态展示页（GitHub Pages） |

## 功能特性

- **QQ频道同步** - 每60秒自动同步新帖子
- **评论同步** - 每5分钟自动同步频道评论
- **文件上传** - 图片、文档上传下载
- **用户系统** - 注册登录、签到、等级
- **互动功能** - 点赞、收藏、回复
- **管理员** - 置顶、加精、删除、封禁

## 技术栈

| 技术 | 用途 |
|------|------|
| Node.js | 后端服务（零依赖） |
| JSON存储 | 数据持久化 |
| Edge CDP | QQ频道评论抓取 |
| FRP | 内网穿透 |
| GitHub Pages | 静态展示 |
| GitHub Actions | 数据自动同步 |

## 目录结构

```
.
├── src/                  # BBS核心代码
│   ├── app.js            # 主服务器
│   ├── store.js          # 数据存储
│   ├── render.js         # 页面渲染
│   ├── upload-server.js  # 上传服务
│   ├── auto_crawl.js     # QQ频道自动抓取
│   ├── extract_comments.js # 评论提取
│   └── sync_comments.js  # 评论同步
├── pages/                # GitHub Pages静态站
│   ├── index.html        # 展示页面
│   └── data.json         # 数据文件（自动更新）
└── .github/workflows/    # GitHub Actions
    └── sync.yml          # 数据同步工作流
```

## GitHub Actions

每30分钟自动从线上BBS同步数据到GitHub Pages：

```
线上BBS → GitHub Actions → pages/data.json → GitHub Pages展示
```

## 许可证

内部使用
