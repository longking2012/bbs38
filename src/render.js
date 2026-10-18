'use strict';
// 渲染层：完整 BBS + 图片/头像 + @提及 + 表情 + 后台QQ桥接配置
const store = require('./store');
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

function md(s) {
  let t = esc(String(s == null ? '' : s));
  const blocks = [], inlines = [];
  t = t.replace(/```([\s\S]*?)```/g, (_, c) => { blocks.push(c.replace(/^\n/, '').replace(/\n$/, '')); return '\x00' + (blocks.length - 1) + '\x00'; });
  t = t.replace(/`([^`\n]+)`/g, (_, c) => { inlines.push(c); return '\x01' + (inlines.length - 1) + '\x01'; });
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="nofollow noopener">$1</a>');
  t = t.replace(/!\[([^\]]*)\]\((\/uploads\/[^\s)]+)\)/g, '<img src="$2" alt="$1" class="post-img" loading="lazy">');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  t = t.replace(/(^|[^@\w\u4e00-\u9fa5])@([A-Za-z0-9_\u4e00-\u9fa5]{2,16})/g, '$1<a class="mention" href="/@/$2">@$2</a>');
  t = t.split('\n').map(l => /^&gt; ?/.test(l) ? '<blockquote>' + l.replace(/^&gt; ?/, '') + '</blockquote>' : l).join('\n');
  t = t.replace(/\n/g, '<br>');
  t = t.replace(/\x01(\d+)\x01/g, (_, i) => '<code>' + inlines[i] + '</code>');
  t = t.replace(/\x00(\d+)\x00/g, (_, i) => '<pre><code>' + blocks[i] + '</code></pre>');
  return t;
}

function timeAgo(iso) { const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000; if (diff < 60) return '刚刚'; if (diff < 3600) return Math.floor(diff / 60) + '分钟前'; if (diff < 86400) return Math.floor(diff / 3600) + '小时前'; if (diff < 2592000) return Math.floor(diff / 86400) + '天前'; return d.toLocaleDateString('zh-CN'); }
function fmtDate(iso) { return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }

function avatar(name, img, size) {
  const sz = size === 'sm' ? ' sm' : '';
  if (img) return `<img class="avatar${sz}" src="${esc(img)}" alt="${esc(name || '')}" loading="lazy">`;
  const n = String(name || '?'); const initial = (n.trim().charAt(0) || '?').toUpperCase();
  let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360;
  return `<span class="avatar${sz}" style="background:hsl(${h},58%,46%)">${esc(initial)}</span>`;
}
function roleBadge(role) {
  if (!role || role === 'member') return '';
  if (role === 'bbs_owner') return '<span class="badge badge-owner">BBS主</span>';
  if (role === 'admin') return '<span class="badge badge-admin">管理员</span>';
  if (role === 'channel_owner') return '<span class="badge badge-channel">频道主</span>';
  return '';
}
function catPill(board) { if (!board) return ''; const c = board.color || '#7c818a'; return `<a class="cat-pill" style="--c:${esc(c)}" href="/b/${esc(board.slug)}"><span class="cat-dot"></span>${esc(board.name)}</a>`; }
function flags(t) { return [t.pinned ? '<span class="tag tag-pin">置顶</span>' : '', t.featured ? '<span class="tag tag-feat">精华</span>' : '', t.locked ? '<span class="tag tag-lock">锁</span>' : ''].join(''); }
function editorTools() { return '<div class="editor-tools"><button type="button" class="emoji-btn" title="表情">😀</button><label class="img-btn" title="插入图片"><span class="img-btn-text">🖼️</span><input type="file" accept="image/*" hidden></label></div>'; }
function levelBadge(lv) { if (!lv) return ''; return '<span class="level-badge" style="background:'+lv.color+'" title="'+lv.count+' 楼">'+lv.title+'</span>'; }
function likeBtn(kind, id, likes, userId) { var c=likes?likes.length:0; var lk=userId&&likes?likes.indexOf(userId)>=0:false; return '<form class="inline" method="post" action="/'+kind+'/'+id+'/like"><button type="submit" class="like-btn'+(lk?' liked':'')+'">👍 <b>'+c+'</b></button></form>'; }

function pager(page, pages, pageUrl) {
  if (pages <= 1) return '';
  const u = n => pageUrl.replace('{page}', n);
  let h = '<div class="pager">';
  h += page > 1 ? `<a class="pg" href="${u(page - 1)}">‹</a>` : '<span class="pg disabled">‹</span>';
  const range = [];
  if (pages <= 9) { for (let i = 1; i <= pages; i++) range.push(i); }
  else { range.push(1); if (page > 4) range.push('…'); for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) range.push(i); if (page < pages - 3) range.push('…'); range.push(pages); }
  range.forEach(n => { h += n === '…' ? '<span class="pg dots">…</span>' : (n === page ? `<span class="pg active">${n}</span>` : `<a class="pg" href="${u(n)}">${n}</a>`); });
  h += page < pages ? `<a class="pg" href="${u(page + 1)}">›</a>` : '<span class="pg disabled">›</span>';
  return h + '</div>';
}

// 侧边栏构建：左栏(用户信息+板块菜单) + 右栏(推荐+最新回复)
const CAT_ICONS = { press: '📰', daily: '🏫', curious: '🎁', wall: '📮', stars: '⭐', literary: '📖', study: '📚' };
function buildSidebars(opts) {
  const { user, boards, featured, recent, content } = opts;
  // 左栏
  let left;
  if (user) {
    left = `<div class="side-card user-card">${avatar(user.username, user.avatar, 'lg')}<div class="username">${esc(user.username)}</div><div class="user-welcome">${roleBadge(user.role)}${user.role === 'admin' || user.role === 'bbs_owner' ? ' · ' : ''}欢迎光临</div><a class="btn-link btn-primary" href="/b/daily/new">发主题</a></div>`;
  } else {
    left = `<div class="side-card user-card"><span class="avatar xl" style="background:#4a6e4a">?</span><div class="username">欢迎光临</div><div class="user-welcome">您还不是注册用户</div><a class="btn-link btn-primary" href="/register">注册</a><a class="btn-link btn-ghost" href="/b/daily/new">发主题</a></div>`;
  }
  let catItems = `<li><a href="/"><span class="cat-icon">🏠</span> 全部主题</a></li><li><a href="/featured"><span class="cat-icon">🏷️</span> 标签</a></li><li><a href="/archive"><span class="cat-icon">📦</span> 归档</a></li>`;
  boards.forEach(b => {
    catItems += `<li><a href="/b/${esc(b.slug)}"><span class="cat-icon">${CAT_ICONS[b.slug] || '📄'}</span> ${esc(b.name)}</a></li>`;
  });
  left += `<div class="side-card"><h3>全部主题</h3><ul class="cat-menu">${catItems}</ul></div>`;
  // 右栏
  let right = opts.rightSidebar || '';
  if (!right) {
    right = `<div class="side-card"><h3>茶馆推荐</h3>`;
    (featured || []).slice(0, 5).forEach(t => {
      right += `<div class="reco-card"><div class="reco-title"><a href="/t/${t.id}">${esc(t.title)}</a></div><div class="reco-meta"><span class="reco-user">${avatar(t.username, t.authorAvatar, 'sm')} ${esc(t.username)}</span><span>👍 ${t.views || 0}</span></div></div>`;
    });
    right += `</div>`;
    right += `<div class="side-card"><h3>最新回复</h3>`;
    (recent || []).slice(0, 5).forEach(t => {
      right += `<div class="reco-card"><div class="reco-title"><a href="/t/${t.id}">${esc(t.title)}</a></div><div class="reco-meta"><span class="reco-user">${avatar(t.username, t.authorAvatar, 'sm')} ${esc(t.lastReplyUser || t.username)}</span><span>🏠 ${t.replyCount}</span></div></div>`;
    });
    right += `<a href="/archive" class="muted small" style="display:block;text-align:center;margin-top:8px">查看更多</a></div>`;
  }
  if (opts.rightSidebarExtra) right = opts.rightSidebarExtra + right;
  return `<aside class="sidebar-left">${left}</aside><div class="main-content">${content}</div><aside class="sidebar-right">${right}</aside>`;
}
function layout(opts) {
  const { title, user, content, active } = opts;
  const unread = Number(opts.unread || 0);
  const auth = user
    ? `<a class="nav-user" href="/u/${user.id}">${avatar(user.username, user.avatar)}<span>${esc(user.username)}${roleBadge(user.role)}</span></a><a class="nav-icon" href="/notifications" title="通知">🔔${unread > 0 ? `<span class="notif-badge">${unread}</span>` : ''}</a><a class="btn-link" href="/logout">退出</a>`
    : `<a class="btn-link" href="/login">登录</a><a class="btn-link btn-primary" href="/register">注册</a>`;
  let body;
  if (opts.threeCol && !opts.fullWidth) {
    body = `<main class="container"><div class="layout-3col">${buildSidebars(opts)}</div></main>`;
  } else {
    body = `<main class="container">${content}</main>`;
  }
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#191c17" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<link rel="icon" type="image/png" href="/public/logo.png">
<title>${esc(title)} · 38middle</title>
<link rel="stylesheet" href="/public/style.css?v=20">
<link rel="stylesheet" href="/public/extra.css?v=20">
</head>
<body>
<nav class="topnav">
  <div class="container topnav-inner">
    <a class="brand" href="/"><img src="/public/logo.png" alt="三十八中" class="brand-logo" width="32" height="32">38<span>BBS</span></a>
    <div class="nav-links"><a href="/" class="${active === 'home' ? 'active' : ''}">首页</a><a href="/featured" class="${active === 'featured' ? 'active' : ''}">精华</a><a href="/archive" class="${active === 'archive' ? 'active' : ''}">归档</a><a href="/members" class="${active === 'members' ? 'active' : ''}">成员</a></div>
    <form class="nav-search" method="get" action="/search"><input type="text" name="q" placeholder="搜索…" autocomplete="off"></form>
    <div class="nav-auth">${auth}</div>
    <button class="nav-toggle" id="navToggle" aria-label="菜单">☰</button>
  </div>
</nav>
<div class="nav-mobile" id="navMobile">
  <a href="/">首页</a>
  <a href="/featured">精华</a>
  <a href="/archive">归档</a>
  <a href="/members">成员</a>
</div>
${body}
<footer class="footer"><div>38middle.brightmoon.work</div><div class="muted"><a href="/feed">RSS</a> · 来访 ${store.getVisitorCount()} 次</div></footer>
<script src="/public/app.js?v=20" defer></script>
</body>
</html>`;
}

function threadRow(t) {
  const who = t.lastReplyUser || t.username;
  return `<li class="discussion">${avatar(t.username, t.authorAvatar)}<div class="discussion-main"><div class="discussion-title-line">${flags(t)}<a class="discussion-title" href="/t/${t.id}">${esc(t.title)}</a></div><div class="discussion-meta">${catPill(t.board)}<span class="muted">· ${esc(t.username)} · 浏览 ${t.views || 0}</span></div></div><div class="discussion-right"><span class="num">${t.replyCount}</span><span class="replies-label">${t.lastReplyUser ? esc(t.lastReplyUser) + ' ' + timeAgo(t.lastReplyAt) : timeAgo(t.updatedAt)}</span></div></li>`;
}

function homePage(d) {
  const { user, unread, boards, recent, stats, online, recommendations, today, checkin } = d;
  const list = recent.length ? `<ul class="discussions">${recent.map(threadRow).join('')}</ul>` : '<p class="muted" style="padding:15px">还没人发帖，你来？</p>';
  // 茶馆推荐轮换
  let recoHtml = '';
  if (recommendations && recommendations.length) {
    const cards = recommendations.map((r, i) => `<div class="reco-slide${i === 0 ? ' active' : ''}" data-idx="${i}"><div class="reco-text">${md(r.text)}</div>${r.author ? `<div class="reco-author muted small">— ${esc(r.author)}</div>` : ''}</div>`).join('');
    recoHtml = `<div class="hero reco-carousel" id="recoCarousel"><div class="reco-slides">${cards}</div><a href="javascript:void(0)" class="reco-next" id="recoNext">再来一条</a></div>`;
  } else {
    recoHtml = `<div class="hero"><h2>38middle</h2><p>注册就能发</p>${user ? `<a href="/b/daily/new" class="btn-link btn-primary hero-link">+ 发新主题</a>` : `<a href="/register" class="btn-link btn-primary hero-link">注册加入</a>`}</div>`;
  }
  // 今日数据 + 签到 + 在线用户
  const ck = checkin ? (checkin.checked
    ? `<div class="checkin-done">已签到 · 连续 ${checkin.streak} 天</div>`
    : `<form method="post" action="/checkin"><button class="btn-link btn-primary checkin-btn">签到打卡 ${checkin.streak ? '· 连续 ' + checkin.streak + ' 天' : ''}</button></form>`) : '<a class="btn-link btn-primary checkin-btn" href="/login">登录签到</a>';
  const todayBox = `<div class="today-card"><div class="today-head">📊 今日</div><div class="today-grid"><div><b>${(today && today.threads) || 0}</b><span>新主题</span></div><div><b>${(today && today.posts) || 0}</b><span>新回复</span></div><div><b>${(today && today.checkins) || 0}</b><span>签到</span></div><div><b>${stats.threads}</b><span>总主题</span></div></div>${ck}</div>`;
  const onlineBox = (online && online.length) ? `<div class="side-card"><h3>🟢 在线 ${online.length}</h3><div class="online-list">${online.map(u => `<a class="online-user" href="/u/${u.id}" title="${esc(u.username)}">${avatar(u.username, u.avatar, 'sm')}<span>${esc(u.username)}</span></a>`).join('')}</div></div>` : '';
  const statsBar = `<div class="stats"><span><b>${stats.threads}</b> 主题</span><span><b>${stats.posts}</b> 帖子</span><span><b>${stats.users}</b> 成员</span></div>`;
  const content = recoHtml + todayBox + statsBar + list;
  return layout({ title: '首页', user, unread, boards, featured: d.featured, recent: d.recent, content, active: 'home', threeCol: true, rightSidebarExtra: onlineBox });
}

function boardPage(d) {
  const { user, unread, board, items, page, pages, total } = d;
  const newBtn = user ? `<a class="btn-link btn-primary" href="/b/${esc(board.slug)}/new">+ 发主题</a>` : '<a class="btn-link" href="/login">登录后发布</a>';
  const list = items.length ? `<ul class="discussions">${items.map(threadRow).join('')}</ul>` : '<p class="muted">这个板块还空着，发个首帖。</p>';
  return layout({ title: board.name, user, unread, boards: d.boards, featured: d.featured, recent: d.recent, content: `<div class="board-head" style="--c:${esc(board.color || '#7c818a')}"><span class="cat-dot lg"></span><div class="board-head-main"><h1 class="page-title">${esc(board.name)}</h1><p class="muted small">${esc(board.desc || '')} · ${total} 个主题</p></div>${newBtn}</div>${list}${pager(page, pages, '/b/' + encodeURIComponent(board.slug) + '?page={page}')}`, active: 'board', threeCol: true });
}

function threadPage(d) {
  const { user, unread, board, thread, replies, boards } = d;
  const isOP = user && thread.userId === user.id;
  const isAdmin = user && (user.role === 'admin' || user.role === 'bbs_owner');
  const canEditT = !!(user && (thread.userId === user.id || isAdmin));
  const opActions = [likeBtn('thread', thread.id, thread.likes, user && user.id)];
  if (user) opActions.push(`<form class="inline" method="post" action="/t/${thread.id}/favorite"><button type="submit" class="like-btn${d.isFavorited ? ' liked' : ''}">⭐ ${d.isFavorited ? '已收藏' : '收藏'}</button></form>`);
  if (d.isFollowing) opActions.push(`<form class="inline" method="post" action="/u/${thread.userId}/follow"><button type="submit" class="btn-link small">已关注</button></form>`);
  if (canEditT) { opActions.push(`<a class="btn-link small" href="/t/${thread.id}/edit">编辑</a>`); opActions.push(`<form class="inline" method="post" action="/t/${thread.id}/delete" onsubmit="return confirm('是否删除')"><button class="btn-link small danger">删除</button></form>`); }
  if (isAdmin) {
    opActions.push(`<form class="inline" method="post" action="/t/${thread.id}/${thread.pinned ? 'unpin' : 'pin'}"><button class="btn-link small">${thread.pinned ? '取消置顶' : '置顶'}</button></form>`);
    opActions.push(`<form class="inline" method="post" action="/t/${thread.id}/${thread.featured ? 'unfeature' : 'feature'}"><button class="btn-link small">${thread.featured ? '取消精华' : '加精'}</button></form>`);
    opActions.push(`<form class="inline" method="post" action="/t/${thread.id}/${thread.locked ? 'unlock' : 'lock'}"><button class="btn-link small">${thread.locked ? '解锁' : '锁定'}</button></form>`);
    const opts = boards.map(b => `<option value="${b.id}" ${b.id === board.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
    opActions.push(`<form class="inline" method="post" action="/t/${thread.id}/move"><select name="boardId">${opts}</select><button class="btn-link small">移动</button></form>`);
  }
  const op = `<article class="post op"><div class="post-aside">${avatar(thread.username, thread.authorAvatar, 'lg')}</div><div class="post-body"><div class="post-head">${avatar(thread.username, thread.authorAvatar, 'sm')}<span class="username">${esc(thread.username)}</span>${levelBadge(thread.authorLevel)} <span class="muted">${fmtDate(thread.createdAt)}</span> ${thread.editedAt ? `<span class="muted">· 改过 ${timeAgo(thread.editedAt)}</span>` : ''} <span class="muted">· 浏览 ${thread.views || 0}</span></div><div class="post-content">${md(thread.content)}</div>${thread.authorSignature ? '<p class="post-signature muted small">— ' + esc(thread.authorSignature) + '</p>' : ''}${opActions.length ? `<div class="post-actions">${opActions.join('')}</div>` : ''}</div></article>`;
  const replyPosts = replies.map(p => {
    const canEditP = !!(user && (p.userId === user.id || isAdmin));
    const acts = [likeBtn('post', p.id, p.likes, user && user.id)];
    if (canEditP) { acts.push(`<a class="btn-link small" href="/post/${p.id}/edit">编辑</a>`); acts.push(`<form class="inline" method="post" action="/post/${p.id}/delete" onsubmit="return confirm('是否删除')"><button class="btn-link small danger">删除</button></form>`); }
    if (isOP && p.userId !== thread.userId) acts.push(`<form class="inline" method="post" action="/t/${thread.id}/best"><input type="hidden" name="postId" value="${p.id}"><button class="btn-link small">${p.isBest ? '取消最佳' : '选为最佳答案'}</button></form>`);
    if (user && p.userId !== user.id) acts.push(`<a class="btn-link small" href="/post/${p.id}/report">举报</a>`);
    acts.push(`<button type="button" class="btn-link small quote-btn" data-post="${p.id}">引用</button>`);
    return `<article class="post ${p.isBest ? 'best' : ''}"><div class="post-aside">${avatar(p.username, p.authorAvatar, 'lg')}</div><div class="post-body"><div class="post-head">${avatar(p.username, p.authorAvatar, 'sm')}<span class="username">${esc(p.username)}</span>${levelBadge(p.authorLevel)} <span class="muted">${fmtDate(p.createdAt)}</span> ${p.editedAt ? '<span class="muted">· 改过</span>' : ''} ${p.isBest ? '<span class="tag tag-feat">最佳答案</span>' : ''}</div><div class="post-content">${md(p.content)}</div>${p.authorSignature ? '<p class="post-signature muted small">— ' + esc(p.authorSignature) + '</p>' : ''}${acts.length ? `<div class="post-actions">${acts.join('')}</div>` : ''}</div></article>`;
  }).join('');
  const replyForm = thread.locked ? '<div class="alert">锁了，不能回。</div>' : (user ? `<form class="reply-form" method="post" action="/t/${thread.id}/reply">${editorTools()}<textarea class="md-area" name="content" rows="4" placeholder="说点什么…" required></textarea><button class="btn-link btn-primary" type="submit">回复</button></form>` : '<p class="muted"><a href="/login">登录</a> 才能回。</p>');
  // 右侧边栏：热搜 + 实时消息
  const hot = store.getHotSearches(8);
  const activity = store.getRecentActivity(8);
  let rightSidebar = '<div class="side-card"><h3>🔥 热搜</h3>';
  hot.forEach((t, i) => {
    rightSidebar += `<div class="hot-item"><span class="hot-rank">${i + 1}</span><a href="/t/${t.id}">${esc(t.title)}</a><div class="hot-meta muted small">${esc(t.username)} · 👍${t.likes} · 👀${t.views}</div></div>`;
  });
  rightSidebar += '</div>';
  rightSidebar += '<div class="side-card"><h3>⚡ 实时消息</h3>';
  activity.forEach(a => {
    const time = timeAgo(a.time);
    const link = a.type === 'reply' ? `/t/${a.threadId}` : `/t/${a.id}`;
    rightSidebar += `<div class="activity-item"><span class="activity-dot ${a.type === 'reply' ? 'reply' : 'thread'}"></span><div class="activity-body"><a href="${link}">${esc(a.title)}</a><div class="activity-meta muted small">${esc(a.username)} · ${time}</div></div></div>`;
  });
  rightSidebar += '</div>';
  return layout({ title: thread.title, user, unread, boards: d.boards, content: `<div class="crumbs muted small"><a href="/">首页</a> / ${catPill(board)}</div><h1 class="thread-title">${flags(thread)}${esc(thread.title)}</h1><section class="post-stream">${op}${replyPosts}</section><div class="reply-section"><h2 class="sec-title">回复</h2>${replyForm}</div>`, threeCol: true, rightSidebar });
}

function newThreadPage(d) {
  const { user, unread, board, error, values } = d;
  return layout({ title: '发新主题', user, unread, content: `<div class="crumbs muted small"><a href="/">首页</a> / <a href="/b/${esc(board.slug)}">${esc(board.name)}</a> / 发新主题</div><h1 class="page-title">在「${esc(board.name)}」发布</h1>${error ? `<div class="alert">${esc(error)}</div>` : ''}<form class="post-form" method="post" action="/b/${esc(board.slug)}/new"><label>标题<input type="text" name="title" maxlength="100" value="${esc(values && values.title || '')}" required></label><div class="content-field"><span class="field-label">内容</span>${editorTools()}<textarea class="md-area" name="content" rows="12" required>${esc(values && values.content || '')}</textarea><span class="muted small">**加粗** *斜体* > 引用 [文字](网址) @提及 图片</span></div><div class="form-actions"><button class="btn-link btn-primary" type="submit">发布</button><a class="btn-link" href="/b/${esc(board.slug)}">取消</a></div></form>` });
}
function editThreadPage(d) { const { user, unread, board, thread } = d; return layout({ title: '编辑主题', user, unread, content: `<div class="crumbs muted small"><a href="/">首页</a> / <a href="/t/${thread.id}">${esc(thread.title)}</a> / 编辑</div><h1 class="page-title">编辑主题</h1><form class="post-form" method="post" action="/t/${thread.id}/edit"><div class="content-field"><span class="field-label">内容</span>${editorTools()}<textarea class="md-area" name="content" rows="12" required>${esc(thread.content)}</textarea></div><div class="form-actions"><button class="btn-link btn-primary" type="submit">保存</button><a class="btn-link" href="/t/${thread.id}">取消</a></div></form>` }); }
function editPostPage(d) { const { user, unread, thread, post } = d; return layout({ title: '编辑回复', user, unread, content: `<div class="crumbs muted small"><a href="/">首页</a> / <a href="/t/${thread.id}">${esc(thread.title)}</a> / 编辑回复</div><h1 class="page-title">编辑回复</h1><form class="post-form" method="post" action="/post/${post.id}/edit"><div class="content-field"><span class="field-label">内容</span>${editorTools()}<textarea class="md-area" name="content" rows="10" required>${esc(post.content)}</textarea></div><div class="form-actions"><button class="btn-link btn-primary" type="submit">保存</button><a class="btn-link" href="/t/${thread.id}">取消</a></div></form>` }); }
function reportPage(d) { const { user, unread, thread, post, error } = d; return layout({ title: '举报', user, unread, content: `<div class="crumbs muted small"><a href="/">首页</a> / <a href="/t/${thread.id}">${esc(thread.title)}</a> / 举报</div><h1 class="page-title">举报这条回复</h1><div class="post-content muted quote">${md(post.content)}</div>${error ? `<div class="alert">${esc(error)}</div>` : ''}<form class="post-form" method="post" action="/post/${post.id}/report"><label>理由<input type="text" name="reason" maxlength="200" required placeholder="骂人 / 谎话 / 广告"></label><div class="form-actions"><button class="btn-link btn-primary" type="submit">提交</button><a class="btn-link" href="/t/${thread.id}">取消</a></div></form>` }); }

function searchPage(d) {
  const { user, unread, q, threads, posts, total, page, pages } = d;
  let body_ = '';
  if (q) { body_ = `<p class="muted">「${esc(q)}」搜到 ${total} 条</p>`; if (threads.length) body_ += `<h2 class="sec-title">主题</h2><ul class="discussions">${threads.map(threadRow).join('')}</ul>${pager(page, pages, '/search?q=' + encodeURIComponent(q) + '&page={page}')}`; if (posts.length) body_ += '<h2 class="sec-title">回复</h2>' + posts.map(p => `<article class="post"><div class="post-aside">${avatar(p.username)}<div class="post-author">${esc(p.username)}</div></div><div class="post-body"><div class="post-head"><span class="muted">${fmtDate(p.createdAt)}</span>${p.thread ? ` · <a href="/t/${p.thread.id}">${esc(p.thread.title)}</a>` : ''}</div><div class="post-content">${md(p.content)}</div></div></article>`).join(''); if (!total) body_ += '<p class="muted">没搜到，换词。</p>'; }
  else body_ = '<p class="muted">想搜啥直接输。</p>';
  return layout({ title: '搜索', user, unread, content: `<h1 class="page-title">搜索</h1><form class="search-form" method="get" action="/search"><input type="text" name="q" value="${esc(q || '')}" placeholder="搜点什么…" autofocus><button class="btn-link btn-primary" type="submit">搜索</button></form>${body_}`, active: 'search' });
}
function archivePage(d) { const { user, unread, groups } = d; const blocks = groups.length ? groups.map(g => `<div class="archive-month"><h2 class="sec-title">${esc(g.month)} <span class="muted small">${g.threads.length} 篇</span></h2><ul class="discussions">${g.threads.map(threadRow).join('')}</ul></div>`).join('') : '<p class="muted">还没东西可归档。</p>'; return layout({ title: '归档', user, unread, content: `<h1 class="page-title">归档</h1><p class="muted">老帖子按月份归着。</p>${blocks}`, active: 'archive' }); }

function profilePage(d) {
  const { user, unread, profile, items, page, pages, replyCount, isSelf, isFollowing } = d;
  const list = items.length ? `<ul class="discussions">${items.map(threadRow).join('')}</ul>` : '<p class="muted">还没发过帖。</p>';
  const selfLinks = isSelf ? `<div class="post-actions"><a class="btn-link" href="/settings">密码 / 头像</a><a class="btn-link" href="/notifications">通知</a>${user && (user.role === 'admin' || user.role === 'bbs_owner') ? '<a class="btn-link" href="/admin">后台</a>' : ''}</div>` : (user ? `<div class="post-actions"><form class="inline" method="post" action="/u/${profile.id}/follow"><button type="submit" class="btn-link btn-primary">${isFollowing ? '已关注' : '关注'}</button></form></div>` : '');
  const sig = profile.signature ? '<p class="muted small">「' + esc(profile.signature) + '」</p>' : '';
  const lv = profile.level || {};
  const lvBar = lv.nextMin ? (() => { const pct = Math.min(100, Math.round((lv.count - (lv.curMin || 0)) / (lv.nextMin - (lv.curMin || 0)) * 100)); return `<div class="level-progress"><div class="level-bar"><span style="width:${pct}%;background:${lv.color || '#7c818a'}"></span></div><div class="level-text muted small">${lv.title} · ${lv.count}/${lv.nextMin} 升下一级</div></div>`; })() : '';
  const ck = isSelf ? (() => { const cs = store.getCheckinStatus(profile.id); return cs.checked ? `<div class="checkin-done">已签到 · 连续 ${cs.streak} 天</div>` : `<form method="post" action="/checkin"><button class="btn-link btn-primary checkin-btn">签到打卡</button></form>`; })() : '';
  return layout({ title: profile.username, user, unread, content: `<div class="avatar-row">${avatar(profile.username, profile.avatar)}<div><h1 class="page-title">${esc(profile.username)}${roleBadge(profile.role)}${profile.banned ? ' <span class="tag tag-lock">封了</span>' : ''}${profile.level ? levelBadge(profile.level) : ''}</h1><p class="muted small">注册于 ${fmtDate(profile.createdAt)}${profile.lastSeen ? ' · 最近 ' + timeAgo(profile.lastSeen) : ''}</p>${sig}</div></div><div class="stats"><span><b>${items.length + (page - 1) * 15}</b> 主题</span><span><b>${replyCount}</b> 回复</span></div>${lvBar}${ck}${selfLinks}<h2 class="sec-title">主题</h2>${list}${pager(page, pages, '/u/' + profile.id + '?page={page}')}` });
}
function membersPage(d) { const { user, unread, items, page, pages, total } = d; const rows = items.map(m => `<a class="member-row" href="/u/${m.id}">${avatar(m.username, m.avatar)}<div class="member-name">${esc(m.username)}${roleBadge(m.role)}${m.banned ? ' <span class="tag tag-lock">封</span>' : ''}</div><div class="muted small">${m.threadCount}主题 · ${m.replyCount}回复 · ${timeAgo(m.createdAt)}</div></a>`).join(''); return layout({ title: '成员', user, unread, content: `<h1 class="page-title">成员 <span class="muted small">${total} 人</span></h1><div class="member-list">${rows}</div>${pager(page, pages, '/members?page={page}')}`, active: 'members' }); }

function notificationsPage(d) {
  const { user, unread, notifications } = d;
  const list = notifications.length ? notifications.map(n => { const txt = n.type === 'mention' ? '@了你' : '回了你的帖'; return `<a class="notif-row ${n.read ? '' : 'unread'}" href="/t/${n.threadId}">${avatar(n.actorName)}<div><b>${esc(n.actorName)}</b> ${txt}${n.thread ? '「' + esc(n.thread.title) + '」' : ''}</div><div class="muted small">${timeAgo(n.createdAt)}</div></a>`; }).join('') : '<p class="muted">没有通知。</p>';
  return layout({ title: '通知', user, unread, content: `<div class="page-head"><h1 class="page-title">通知</h1>${notifications.length ? '<form class="inline" method="post" action="/notifications/read"><button class="btn-link">全标已读</button></form>' : ''}</div><div class="notif-list">${list}</div>` });
}
function settingsPage(d) {
  const { user, unread, error, ok, signature } = d;
  const avatarForm = `<div class="config-card"><h3>头像</h3><div class="avatar-row">${avatar(user.username, user.avatar)}<div><form method="post" enctype="multipart/form-data" action="/settings/avatar"><input type="file" name="avatar" accept="image/*" required> <button class="btn-link btn-primary">上传</button></form>${user.avatar ? `<form class="inline" method="post" action="/settings/avatar/remove"><button class="btn-link small">删头像</button></form>` : ''}</div></div><p class="config-note">JPG/PNG/GIF/WebP，1MB 内。</p></div>`;
  const sigForm = `<div class="config-card"><h3>签名</h3><form class="post-form" method="post" action="/settings/signature"><input type="text" name="signature" maxlength="100" value="${esc(signature || '')}" placeholder="写点什么让别人认识你"><button class="btn-link btn-primary" type="submit">保存</button></form></div>`;
  return layout({ title: '设置', user, unread, content: `<h1 class="page-title">设置</h1>${avatarForm}${sigForm}<div class="config-card"><h3>改密码</h3>${ok ? '<div class="alert ok">改好了。</div>' : ''}${error ? `<div class="alert">${esc(error)}</div>` : ''}<form class="post-form" method="post" action="/settings"><label>原密码<input type="password" name="old" required></label><label>新密码<input type="password" name="new" required></label><label>再输一遍<input type="password" name="confirm" required></label><button class="btn-link btn-primary" type="submit">保存</button></form></div>` });
}

function adminPage(d) {
  const { user, unread, boards, users, reports, config, recommendations } = d;
  const isOwner = user.role === 'bbs_owner';
  const allUsers = d.allUsers || users;
  const recoRows = (recommendations || []).map(r => `<tr><td class="muted small">${esc(r.author)}</td><td>${esc((r.text || '').slice(0, 60))}${(r.text || '').length > 60 ? '…' : ''}</td><td class="muted small">${timeAgo(r.createdAt)}</td><td><form class="inline" method="post" action="/admin/reco/${r.id}/delete" onsubmit="return confirm('是否删除')"><button class="btn-link small danger">删</button></form></td></tr>`).join('');
  const recoCard = `<div class="config-card"><h3>茶馆推荐</h3><p class="config-note">首页顶部轮换展示的推荐语。管理员添加/删除，访客点"再来一条"换下一条。</p><table class="admin-table"><thead><tr><th>添加者</th><th>内容</th><th>时间</th><th></th></tr></thead><tbody>${recoRows || '<tr><td colspan="4" class="muted">还没有推荐语</td></tr>'}</tbody></table><form class="post-form" method="post" action="/admin/reco"><label class="field-label">推荐语（最多500字）<textarea name="text" rows="3" required placeholder="例如：这里是38middle，注册就能发。"></textarea></label><button class="btn-link btn-primary" type="submit">添加推荐</button></form></div>`;
  const boardRows = boards.map(b => {
    const owner = allUsers.find(u => u.id === b.ownerId);
    const ownerCell = b.ownerId ? (owner ? `<a href="/u/${owner.id}">${esc(owner.username)}</a>` : '<span class="muted">已删除</span>') : '<span class="muted">无</span>';
    const ownerForm = isOwner ? ` <form class="inline" method="post" action="/admin/board/${b.id}/owner"><select name="userId"><option value="">— 无负责人 —</option>${allUsers.map(u => `<option value="${u.id}" ${u.id === b.ownerId ? 'selected' : ''}>${esc(u.username)}</option>`).join('')}</select><button class="btn-link small">改</button></form>` : '';
    const delBtn = isOwner ? `<form class="inline" method="post" action="/admin/board/${b.id}/delete" onsubmit="return confirm('是否删除')"><button class="btn-link small danger">删</button></form>` : '';
    return `<tr><td><span class="cat-dot" style="background:${esc(b.color)}"></span>${esc(b.name)}</td><td class="muted small">${esc(b.slug)}</td><td class="muted small">${ownerCell}</td><td>${delBtn}${ownerForm}</td></tr>`;
  }).join('');
  const userRows = allUsers.map(u => {
    const isSelf = u.id === user.id;
    const canManage = isOwner && !isSelf;
    const roleActions = canManage ? ` <form class="inline" method="post" action="/admin/user/${u.id}/${u.role === 'admin' ? 'demote' : 'promote'}"><button class="btn-link small">${u.role === 'admin' ? '撤管理' : '升管理'}</button></form>` : '';
    const banBtn = u.role !== 'bbs_owner' && !isSelf ? (u.banned ? `<form class="inline" method="post" action="/admin/user/${u.id}/unban"><button class="btn-link small">解封</button></form>` : `<form class="inline" method="post" action="/admin/user/${u.id}/ban"><button class="btn-link small">封</button></form>`) : '<span class="muted small">-</span>';
    return `<tr><td><a href="/u/${u.id}">${esc(u.username)}</a> ${roleBadge(u.role)}</td><td class="muted small">${u.threadCount}/${u.replyCount}</td><td class="muted small">${timeAgo(u.createdAt)}</td><td>${banBtn}${roleActions}</td></tr>`;
  }).join('');
  const reportRows = reports.length ? reports.map(r => `<tr><td class="muted small">${esc(r.reporterName)} 举报</td><td>${r.thread ? `<a href="/t/${r.thread.id}">${esc(r.thread.title)}</a>` : '<span class="muted">没了</span>'}</td><td class="muted small">${esc(r.reason)}</td><td><form class="inline" method="post" action="/admin/report/${r.id}/resolve"><button class="btn-link small">处理</button></form></td></tr>`).join('') : '<tr><td colspan="4" class="muted">没人被举报</td></tr>';
  const boardOpts = boards.map(b => `<option value="${esc(b.slug)}" ${b.slug === config.ingestBoard ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  const qq = `<div class="config-card"><h3>QQ 桥接</h3><p class="config-note">机器人把频道消息 POST 到 <code>/ingest</code> 灌进来；机器人读 <code>/api/recent</code> 或你填的 webhook 把站里的发回频道。<br>真发到QQ得去 q.qq.com 注册机器人。</p>
    <form method="post" action="/admin/config">
      <label class="field-label">ingest 口令<input type="text" name="ingestToken" value="${esc(config.ingestToken || '')}" placeholder="随便设一串，机器人带上才能灌"></label>
      <label class="field-label">灌到哪个板块<select name="ingestBoard">${boardOpts}</select></label>
      <label class="field-label">推送 webhook（可选）<input type="text" name="qqWebhook" value="${esc(config.qqWebhook || '')}" placeholder="https://你的机器人relay"></label>
      <div style="margin-top:10px"><button class="btn-link btn-primary">保存</button></div>
    </form>
    <p class="config-note" style="margin-top:10px">灌消息例子：<br><span class="code-box">curl -X POST http://localhost:3000/ingest \<br>　-H "Content-Type: application/json" \<br>　-d '{"token":"口令","username":"QQ昵称","content":"频道里说的"}'</span></p>
  </div>`;
  const addBoardForm = isOwner ? `<h2 class="sec-title">加板块</h2><form class="post-form inline-form" method="post" action="/admin/board"><input type="text" name="name" placeholder="名字" required><input type="text" name="desc" placeholder="简介"><input type="color" name="color" value="#6b7280"><button class="btn-link btn-primary">加</button></form>` : '';
  const boardTableHead = `<tr><th>名称</th><th>slug</th>${isOwner ? '<th>负责人</th>' : ''}<th></th></tr>`;
  const userTableExtra = isOwner ? '<th>操作</th>' : '';
  return layout({ title: '后台', user, unread, content: `<h1 class="page-title">后台 ${roleBadge(user.role)}</h1>${recoCard}${qq}<div class="cols"><main class="col-main"><h2 class="sec-title">板块</h2><table class="admin-table"><thead>${boardTableHead}</thead><tbody>${boardRows}</tbody></table>${addBoardForm}<h2 class="sec-title">举报 <span class="muted small">${reports.length}</span></h2><table class="admin-table"><thead><tr><th>谁举报</th><th>主题</th><th>理由</th><th></th></tr></thead><tbody>${reportRows}</tbody></table></main><aside class="col-side"><div class="side-card"><h3>用户 ${isOwner ? '<span class="muted small">（可管理角色）</span>' : ''}</h3><table class="admin-table compact"><thead><tr><th>用户</th><th>主/回</th><th>注册</th>${userTableExtra}</tr></thead><tbody>${userRows}</tbody></table></div></aside></div>` });
}

function authPage(d) { const { mode, error, values } = d; const isLogin = mode === 'login'; return layout({ title: isLogin ? '登录' : '注册', user: null, unread: 0, content: `<h1 class="page-title">${isLogin ? '登录' : '注册'}</h1>${error ? `<div class="alert">${esc(error)}</div>` : ''}<form class="post-form" method="post" action="/${isLogin ? 'login' : 'register'}"><label>用户名<input type="text" name="username" maxlength="16" value="${esc(values && values.username || '')}" required></label><label>密码<input type="password" name="password" required></label><div class="form-actions"><button class="btn-link btn-primary" type="submit">${isLogin ? '登录' : '注册'}</button>${isLogin ? '<a class="btn-link" href="/register">没号？注册</a>' : '<a class="btn-link" href="/login">有号？登录</a>'}</div></form>` }); }
function messagePage(d) { const { user, unread, title, text, link } = d; return layout({ title, user, unread, content: `<h1 class="page-title">${esc(title)}</h1><p>${esc(text)}</p>${link ? `<a class="btn-link btn-primary" href="${esc(link.href)}">${esc(link.text)}</a>` : ''}` }); }
function notFoundPage(d) { const { user, unread } = d || {}; return layout({ title: '404', user, unread, content: `<h1 class="page-title">404</h1><p class="muted">没这页。<a href="/">回首页</a></p>` }); }

function feedXML(d) {
  const { title, description, base, threads } = d;
  const items = threads.map(t => `    <item>\n      <title>${esc(t.title)}</title>\n      <link>${base}/t/${t.id}</link>\n      <guid>${base}/t/${t.id}</guid>\n      <author>${esc(t.username)}</author>${t.board ? `\n      <category>${esc(t.board.name)}</category>` : ''}\n      <description>${esc((t.content || '').slice(0, 200))}</description>\n      <pubDate>${new Date(t.updatedAt).toUTCString()}</pubDate>\n    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${esc(title)}</title>\n    <link>${base}</link>\n    <description>${esc(description)}</description>\n    <language>zh-CN</language>\n${items}\n  </channel>\n</rss>`;
}

module.exports = {
  esc, md, timeAgo, fmtDate, avatar, catPill, flags, editorTools, pager, layout, threadRow, roleBadge,
  homePage, boardPage, threadPage, newThreadPage, editThreadPage, editPostPage, reportPage,
  searchPage, archivePage, profilePage, membersPage, notificationsPage, settingsPage, adminPage,
  authPage, messagePage, notFoundPage, feedXML,
};
