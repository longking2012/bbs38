'use strict';
// 零依赖数据层：JSON 存储 + scrypt + 会话 + 通知(回复/提及) + 举报 + 分页 + 在线 + 头像 + QQ桥接配置
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bbs.json');
const PER_PAGE = 15;

const DEFAULT_BOARDS = [
  { slug: 'press',    name: '十字通讯社', desc: '通讯社公告与动态', color: '#3b82f6' },
  { slug: 'daily',    name: '校园日常',   desc: '校园生活、日常吐槽', color: '#10b981' },
  { slug: 'curious',  name: '猎奇专区',   desc: '新奇猎奇、奇人奇事', color: '#8b5cf6' },
  { slug: 'wall',     name: '校园墙投稿', desc: '匿名墙、想说的话', color: '#f59e0b' },
  { slug: 'stars',    name: '校花校草',   desc: '校园风采', color: '#ec4899' },
  { slug: 'literary', name: '风华文学社', desc: '原创文字、连载', color: '#14b8a6' },
  { slug: 'study',    name: '学习交流',   desc: '学习心得、资料、提问', color: '#6366f1' },
];

function emptyDB() {
  const boards = DEFAULT_BOARDS.map((b, i) => ({ id: i + 1, order: i + 1, ...b }));
  return {
    boards, threads: [], posts: [], users: [], sessions: [],
    notifications: [], reports: [], recommendations: [],
    nextThreadId: 1, nextPostId: 1, nextUserId: 1, nextBoardId: 8,
    nextNotificationId: 1, nextReportId: 1, nextRecommendationId: 1,
    visitors: 0,
    checkins: {},
    config: { qqWebhook: '', ingestToken: '', ingestBoard: 'wall', dailyTopic: '' },
  };
}

function seedDemoData(d) {
  const bySlug = {}; d.boards.forEach(b => { bySlug[b.slug] = b; });
  const now = Date.now(); const h = 3600 * 1000;
  const samples = [
    { slug: 'press', title: '论坛开了', author: '十字通讯社', content: '通讯社弄的，注册就能发。\n\n水群还在频道，这边发长帖、翻老帖。\n\n板块都建好了，有问题楼下回。', views: 128, pinned: true, featured: true, ageH: 48 },
    { slug: 'press', title: '请各位警惕流言蜚语', author: '。.', content: '请各位警惕流言蜚语，切勿当真，过多打听会给当事人带来困扰和麻烦，请各位注意。', views: 89, pinned: true, ts: 1791637370 },
    { slug: 'press', title: '再次提醒：不要辱骂造谣', author: '。.', content: '再次提醒频道的各位同学无论发生什么争执，不要在频道里面互相辱骂诋毁造谣对方，管理员看到相关帖子都会删除，不会再做解释，请各位理解配合。', views: 72, pinned: true, ts: 1791200125 },
    { slug: 'press', title: '申请进频道须知', author: '。.', content: '所有未进频道，但是正在浏览频道，并即将准备申请进频道的人请注意：\n必须填写校区和班级，缺少一样都不会通过❗❗❗', views: 65, pinned: true, ts: 1790419161 },
    { slug: 'press', title: '三十八中主持人前来报道', author: '留白^糕糕饼^', content: '三十八中主持人前来报道', views: 200, featured: true, ts: 1791645859 },
    { slug: 'daily', title: '没想到运动会就这么结束了', author: '916黄色闪电', content: '没想到运动会就这么结束了 虽然黄色闪电的故事还没有结束 但是这真的是我的最后一届校运会了 可以说是我的校运会最后一舞 跳远的记录已经尘封了9年 上一个天才创造这个记录的时候 我还在上幼儿园大班 可能当时的那个天才现在已经参加工作了吧 我想说，你的记录被我刷新了\n\n初中苦练了两年 无论是狂风暴雨，风吹日晒，还是夏日三伏天，冬至三九天，我都坚持训练，从不放弃 最后一舞也是最终圆了梦想 了却心愿 我的故事没有结束 我未来还会向着更高的记录发起冲击\n\n回顾这届运动会有4×100m抢跑的遗憾 也有打破记录的成功 最终力挽狂澜还是未能带领916班卫冕团体总分冠军 向916班的同志说一声对不起，我已经尽力了\n\n运动会的故事结束了 明年我会离开这座校园 但是希望你们能记住我的名字 也希望有后起之秀以我的记录为目标 继续为学校创造新的辉煌！', views: 580, featured: true, ts: 1791630517 },
    { slug: 'stars', title: '频道里面天天发校花校草的全是乐子，我说的', author: '古月方源', content: '频道里面天天发校花校草的全是乐子，我说的', views: 420, ts: 1792224739 },
    { slug: 'stars', title: '902班qkx 真的很温柔呀', author: '把老子领带拿来！', content: '902班qkx 真的很温柔呀', views: 55, ts: 1792244157 },
    { slug: 'stars', title: '磨店8年级校花是谁？', author: '灭', content: '磨店8年级校花是谁？', views: 130, ts: 1791465544 },
    { slug: 'literary', title: '还是忘不了她，像初恋的味道', author: '萧孙申请法', content: '还是忘不了她，像初恋的味道（不知为何', views: 150, ts: 1791641658 },
    { slug: 'daily', title: '磨店某女士简直就是背刺王', author: '颜', content: '磨店某女士简直就是背刺王，自己玩了两年的好朋友直接刺刺刺，天天在班里面当公主，表面爱女实则爱男哦，遇到这种人直接开火箭跑哦🚀🚀🚀🚀🚀', views: 380, ts: 1792168029 },
    { slug: 'daily', title: '找古月方源班级名字，情况属实加我发收款码', author: 'yu', content: '找古月方源班级名字，情况属实加我发收款码不知道什么心理，其实自己是个哥布林，羡慕别人', views: 250, ts: 1792244863 },
    { slug: 'daily', title: '嘉山路校区', author: '星辰', content: '嘉山路校区', views: 95, ts: 1792169521 },
    { slug: 'daily', title: '嘉山路908', author: '爱是恰落的雪.', content: '嘉山路908', views: 60, ts: 1791635373 },
    { slug: 'study', title: '求八年级二次函数压轴题思路', author: '学渣求救', content: '最后一问总是卡住，有没有通用的**拆解思路**？\n> 听说画图分析最值点有用', views: 96, ageH: 8 },
    { slug: 'curious', title: '食堂门口那只橘猫又长胖了', author: '纯奶', content: '肉眼可见又圆了一圈，附议。', views: 307, ageH: 3 },
  ];
  samples.forEach((s) => {
    const b = bySlug[s.slug]; if (!b) return;
    const created = s.ts ? new Date(s.ts * 1000).toISOString() : new Date(now - s.ageH * h).toISOString();
    d.threads.push({ id: d.nextThreadId++, boardId: b.id, userId: 0, username: s.author, title: s.title, content: s.content, views: s.views || 0, createdAt: created, updatedAt: created, editedAt: null, pinned: !!s.pinned, featured: !!s.featured, locked: false, bestAnswerId: null, lastReplyUser: null, lastReplyAt: created, likes: [] });
  });
  const t2 = d.threads.find(t => t.title.includes('运动会'));
  if (t2) {
    const rc = new Date(now - 2 * h).toISOString();
    d.posts.push({ id: d.nextPostId++, threadId: t2.id, userId: 0, username: '加油', content: '916虽然没卫冕团体冠军，但黄色闪电刷新跳远记录太帅了！明年继续冲！', createdAt: rc, editedAt: null });
    t2.lastReplyUser = '加油'; t2.lastReplyAt = rc; t2.updatedAt = rc;
  }
}

let db = null;
function load() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    db.notifications = db.notifications || []; db.reports = db.reports || []; db.recommendations = db.recommendations || [];
    db.nextNotificationId = db.nextNotificationId || 1; db.nextReportId = db.nextReportId || 1; db.nextRecommendationId = db.nextRecommendationId || 1;
    db.nextBoardId = db.nextBoardId || (db.boards.length + 1);
    db.config = db.config || { qqWebhook: '', ingestToken: '', ingestBoard: 'wall' };
    db.config.qqWebhook = db.config.qqWebhook || ''; db.config.ingestToken = db.config.ingestToken || ''; db.config.ingestBoard = db.config.ingestBoard || 'wall';
    for (const t of db.threads) { t.locked = !!t.locked; t.bestAnswerId = t.bestAnswerId || null; t.editedAt = t.editedAt || null; t.lastReplyUser = t.lastReplyUser || null; t.lastReplyAt = t.lastReplyAt || t.updatedAt; t.likes = t.likes || []; }
    for (const p of db.posts) { p.editedAt = p.editedAt || null; p.likes = p.likes || []; }
    for (const u of db.users) { u.banned = !!u.banned; u.lastSeen = u.lastSeen || null; u.avatar = u.avatar || null; u.signature = u.signature || ''; u.favoriteIds = u.favoriteIds || []; u.following = u.following || []; }
  } else { db = emptyDB(); seedDemoData(db); save(); }
  return db;
}
function save() { const tmp = DATA_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, DATA_FILE); }
function nowISO() { return new Date().toISOString(); }
function paginate(arr, page, per) { page = Math.max(1, parseInt(page, 10) || 1); per = per || PER_PAGE; const total = arr.length; const pages = Math.max(1, Math.ceil(total / per)); if (page > pages) page = pages; const start = (page - 1) * per; return { items: arr.slice(start, start + per), page, pages, total }; }

function hashPassword(p) { const salt = crypto.randomBytes(16).toString('hex'); return { hash: crypto.scryptSync(p, salt, 64).toString('hex'), salt }; }
function verifyPassword(p, h, s) { const hash = crypto.scryptSync(p, s, 64).toString('hex'); const a = Buffer.from(hash, 'hex'), b = Buffer.from(h, 'hex'); if (a.length !== b.length) return false; return crypto.timingSafeEqual(a, b); }

function findUserByName(n) { return load().users.find(u => u.username.toLowerCase() === String(n).toLowerCase()); }
function findUserById(id) { return load().users.find(u => u.id === Number(id)); }
function createUser(username, password) {
  const d = load();
  if (!username || username.length < 2 || username.length > 16) return { error: '用户名需 2-16 个字符' };
  if (!/^[A-Za-z0-9_\u4e00-\u9fa5]+$/.test(username)) return { error: '用户名只能用中英文、数字、下划线' };
  if (d.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return { error: '用户名已被占用' };
  if (!password || password.length < 6) return { error: '密码至少 6 位' };
  const { hash, salt } = hashPassword(password);
  const role = d.users.length === 0 ? 'admin' : 'member';
  const user = { id: d.nextUserId++, username, passHash: hash, salt, role, createdAt: nowISO(), banned: false, lastSeen: null, avatar: null };
  d.users.push(user); save(); return { user };
}
function setBanned(id, banned) { const u = findUserById(id); if (!u) return false; u.banned = banned; save(); if (banned) { const d = load(); d.sessions = d.sessions.filter(s => s.userId !== u.id); save(); } return true; }
function deleteUser(id) { const d = load(); const u = d.users.find(x => x.id === Number(id)); if (!u) return false; d.users = d.users.filter(x => x.id !== u.id); for (const t of d.threads) if (t.userId === u.id) { t.username = '已注销'; t.userId = 0; } for (const p of d.posts) if (p.userId === u.id) { p.username = '已注销'; p.userId = 0; } d.sessions = d.sessions.filter(s => s.userId !== u.id); save(); return true; }
function changePassword(userId, oldPass, newPass) { const u = findUserById(userId); if (!u) return { error: '用户不存在' }; if (!verifyPassword(oldPass, u.passHash, u.salt)) return { error: '原密码不对' }; if (!newPass || newPass.length < 6) return { error: '新密码至少 6 位' }; const { hash, salt } = hashPassword(newPass); u.passHash = hash; u.salt = salt; save(); return { ok: true }; }
function setAvatar(userId, path) { const u = findUserById(userId); if (!u) return false; u.avatar = path; save(); return true; }
function setRole(userId, role) {
  const u = findUserById(userId); if (!u) return { error: '用户不存在' };
  if (!['member', 'admin', 'channel_owner', 'bbs_owner'].includes(role)) return { error: '角色无效' };
  // 至少保留一个 BBS主
  if (role !== 'bbs_owner') {
    const owners = load().users.filter(x => x.role === 'bbs_owner');
    if (u.role === 'bbs_owner' && owners.length <= 1) return { error: '不能取消最后一个 BBS主' };
  }
  u.role = role; save(); return { ok: true };
}
function isStaff(user) { return user && (user.role === 'admin' || user.role === 'bbs_owner'); }
function isBbsOwner(user) { return user && user.role === 'bbs_owner'; }
function updateLastSeen(user) { if (!user) return; const now = Date.now(); if (user.lastSeen && now - new Date(user.lastSeen).getTime() < 30000) return; user.lastSeen = nowISO(); save(); }
function getOnlineUsers(sec) { sec = sec || 300; const cut = Date.now() - sec * 1000; return load().users.filter(u => u.lastSeen && new Date(u.lastSeen).getTime() >= cut).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)); }

function createSession(userId) { const d = load(); const token = crypto.randomBytes(24).toString('hex'); d.sessions.push({ token, userId, createdAt: nowISO() }); save(); return token; }
function getUserBySession(token) { if (!token) return null; const s = load().sessions.find(x => x.token === token); if (!s) return null; const u = findUserById(s.userId); if (!u || u.banned) return null; return u; }
function destroySession(token) { const d = load(); d.sessions = d.sessions.filter(x => x.token !== token); save(); }

function getBoards() { return load().boards.slice().sort((a, b) => a.order - b.order); }
function getBoardBySlug(slug) { return load().boards.find(b => b.slug === slug); }
function getBoardById(id) { return load().boards.find(b => b.id === Number(id)); }
function addBoard(name, desc, color) { const d = load(); if (!name || name.trim().length < 2) return { error: '板块名至少 2 字' }; const id = d.nextBoardId++; const board = { id, slug: 'b' + id, name: name.trim().slice(0, 20), desc: (desc || '').slice(0, 60), color: color || '#6b7280', order: id }; d.boards.push(board); save(); return { board }; }
function editBoard(id, name, desc, color) { const b = getBoardById(id); if (!b) return false; if (name) b.name = name.trim().slice(0, 20); if (desc !== undefined) b.desc = desc.slice(0, 60); if (color) b.color = color; save(); return true; }
function setBoardOwner(boardId, userId) {
  const b = getBoardById(boardId); if (!b) return { error: '板块不存在' };
  b.ownerId = userId ? Number(userId) : null;
  save(); return { ok: true };
}
function deleteBoard(id) { const d = load(); const board = d.boards.find(b => b.id === Number(id)); if (!board) return false; if (d.boards.length <= 1) return { error: '至少保留一个板块' }; d.boards = d.boards.filter(b => b.id !== board.id); const fallback = d.boards[0]; for (const t of d.threads) if (t.boardId === board.id) t.boardId = fallback.id; save(); return true; }

function _withReplies(t) { const d = load(); return Object.assign({}, t, { replyCount: d.posts.filter(p => p.threadId === t.id).length }); }
function _enrich(t) { const d = load(); const authorU = d.users.find(u => u.id === t.userId); return Object.assign(_withReplies(t), { board: d.boards.find(b => b.id === t.boardId), lastReplyUser: t.lastReplyUser, lastReplyAt: t.lastReplyAt || t.updatedAt, authorAvatar: authorU ? (authorU.avatar || null) : (t.userAvatar || null), authorLevel: authorU ? getLevel(authorU.id) : null, authorSignature: authorU ? (authorU.signature || '') : '' }); }
function getThreadsByBoard(slug, page) { const d = load(); const board = getBoardBySlug(slug); if (!board) return null; const list = d.threads.filter(t => t.boardId === board.id).map(_enrich).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt) - new Date(a.updatedAt)); const p = paginate(list, page); return Object.assign({ board }, p); }
function getRecentThreads(limit) { const d = load(); return d.threads.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, limit || 15).map(_enrich); }
function getFeatured(limit) { const d = load(); return d.threads.filter(t => t.featured).slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, limit || 50).map(_enrich); }
function getThread(id) {
  const d = load(); const t = d.threads.find(t => t.id === Number(id)); if (!t) return null;
  const board = d.boards.find(b => b.id === t.boardId);
  const authorU = d.users.find(u => u.id === t.userId);
  const authorLevel = authorU ? getLevel(authorU.id) : null;
  const authorSignature = authorU ? (authorU.signature || '') : '';
  const replies = d.posts.filter(p => p.threadId === t.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((p, i) => {
    const pA = d.users.find(u => u.id === p.userId);
    return Object.assign({}, p, { floor: i + 2, isBest: t.bestAnswerId === p.id, authorAvatar: pA ? pA.avatar : (p.userAvatar || null), authorLevel: pA ? getLevel(pA.id) : null, authorSignature: pA ? (pA.signature || '') : '' });
  });
  return { thread: Object.assign({}, t, { authorAvatar: authorU ? authorU.avatar : (t.userAvatar || null), authorLevel, authorSignature }), board, replies };
}
function incrementViews(id) { const d = load(); const t = d.threads.find(t => t.id === Number(id)); if (t) { t.views = (t.views || 0) + 1; save(); } }
// 自动抓取同步：增量加帖+更新赞数（走内存缓存，和 app.js 共享 db）
function syncCrawledPosts(posts) {
  const d = load();
  let added = 0, updated = 0;
  for (const p of posts) {
    const author = p.author || '匿名';
    const title = p.title || '';
    const k8 = title.slice(0, 8);
    const found = d.threads.find(t => t.userId === 0 && t.username === author && (t.title || '').slice(0, 8) === k8);
    if (found) {
      found.views = Math.max(found.views || 0, (p.likes || 0) * 5 + 20);
      if (p.avatarLocal && !found.userAvatar) found.userAvatar = p.avatarLocal;
      updated++;
      continue;
    }
    let boardSlug = 'daily';
    if (title.includes('校花') || title.includes('校草') || title.includes('萝莉')) boardSlug = 'stars';
    else if (title.includes('文学') || title.includes('诗')) boardSlug = 'literary';
    else if (title.includes('学习') || title.includes('题')) boardSlug = 'study';
    const b = d.boards.find(x => x.slug === boardSlug) || d.boards[0];
    const created = p.date ? new Date(p.date).toISOString() : nowISO();
    d.threads.push({ id: d.nextThreadId++, boardId: b.id, userId: 0, username: author, title: title.slice(0, 100), content: p.full || title, views: (p.likes || 0) * 5 + 20, createdAt: created, updatedAt: created, editedAt: null, pinned: false, featured: (p.likes || 0) > 20, locked: false, bestAnswerId: null, lastReplyUser: null, lastReplyAt: created, likes: [], userAvatar: p.avatarLocal || null });
    added++;
  }
  save();
  return { added, updated };
}

// 同步QQ频道评论到BBS回复
function syncCrawledComments(commentData) {
  const d = load();
  let added = 0, skipped = 0;
  for (const item of commentData) {
    const title = item.title || '';
    const k8 = title.slice(0, 8);
    // 找匹配的线程
    const thread = d.threads.find(t => (t.title || '').slice(0, 8) === k8);
    if (!thread) { skipped++; continue; }
    // 找已有的回复（用于去重）
    const existingPosts = d.posts.filter(p => p.threadId === thread.id && p.username === '匿名');
    for (const c of (item.comments || [])) {
      const content = (c.content || '').trim();
      if (!content || content.length < 1) continue;
      // 去重：检查是否已有相同内容的回复
      const dup = existingPosts.find(p => p.content === content && p.username === '匿名');
      if (dup) continue;
      const dateStr = c.date || '';
      const now = dateStr ? (() => {
        const parts = dateStr.split('-');
        if (parts.length === 2) {
          const m = parts[0].padStart(2, '0');
          const d = parts[1].padStart(2, '0');
          return new Date(`2026-${m}-${d}T12:00:00.000Z`).toISOString();
        }
        return nowISO();
      })() : nowISO();
      const p = { id: d.nextPostId++, threadId: thread.id, userId: 0, username: c.username || '匿名', content: content.slice(0, 5000), createdAt: now, editedAt: null };
      d.posts.push(p);
      thread.lastReplyUser = c.username || '匿名';
      thread.lastReplyAt = now;
      thread.updatedAt = now;
      existingPosts.push(p);
      added++;
    }
  }
  save();
  return { added, skipped };
}

function createThread(slug, userId, username, title, content) {
  const d = load(); const board = getBoardBySlug(slug); if (!board) return null;
  if (!title || title.trim().length < 2) return { error: '标题至少 2 个字' };
  if (!content || content.trim().length < 1) return { error: '内容不能为空' };
  const now = nowISO();
  const t = { id: d.nextThreadId++, boardId: board.id, userId, username, title: title.trim().slice(0, 100), content: content.slice(0, 20000), views: 0, createdAt: now, updatedAt: now, editedAt: null, pinned: false, featured: false, locked: false, bestAnswerId: null, lastReplyUser: null, lastReplyAt: now };
  d.threads.push(t); save();
  notifyMentions(content, userId, username, t.id, null);
  return { thread: t };
}
function recomputeLastReply(threadId) { const d = load(); const t = d.threads.find(t => t.id === Number(threadId)); if (!t) return; const posts = d.posts.filter(p => p.threadId === t.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); if (posts.length) { const last = posts[posts.length - 1]; t.lastReplyUser = last.username; t.lastReplyAt = last.createdAt; t.updatedAt = last.createdAt; } else { t.lastReplyUser = null; t.lastReplyAt = t.createdAt; t.updatedAt = t.createdAt; } save(); }
function addReply(threadId, userId, username, content) {
  const d = load(); const t = d.threads.find(t => t.id === Number(threadId)); if (!t) return null;
  if (t.locked) return { error: '主题已锁定，不能回复' };
  if (!content || content.trim().length < 1) return { error: '回复不能为空' };
  const now = nowISO();
  const p = { id: d.nextPostId++, threadId: t.id, userId, username, content: content.slice(0, 5000), createdAt: now, editedAt: null };
  d.posts.push(p); t.lastReplyUser = username; t.lastReplyAt = now; t.updatedAt = now; save();
  if (t.userId && t.userId !== userId) addNotification(t.userId, 'reply', t.id, p.id, userId, username);
  notifyMentions(content, userId, username, t.id, p.id);
  return { post: p };
}
function editThread(id, userId, content) { const d = load(); const t = d.threads.find(t => t.id === Number(id)); if (!t) return { error: '主题不存在' }; if (t.userId !== userId) return { error: '只能编辑自己的主题' }; if (!content || content.trim().length < 1) return { error: '内容不能为空' }; t.content = content.slice(0, 20000); t.editedAt = nowISO(); save(); return { ok: true }; }
function deleteThread(id, user) { const d = load(); const t = d.threads.find(t => t.id === Number(id)); if (!t) return { error: '主题不存在' }; if (!user || (t.userId !== user.id && user.role !== 'admin')) return { error: '无权限' }; d.threads = d.threads.filter(x => x.id !== t.id); d.posts = d.posts.filter(p => p.threadId !== t.id); d.notifications = d.notifications.filter(n => n.threadId !== t.id); d.reports = d.reports.filter(r => r.threadId !== t.id); save(); return { ok: true }; }
function setThreadFlag(id, flag, value) { const d = load(); const t = d.threads.find(t => t.id === Number(id)); if (!t) return false; t[flag] = value; save(); return true; }
function moveThread(id, boardId) { const d = load(); const t = d.threads.find(t => t.id === Number(id)); const b = d.boards.find(b => b.id === Number(boardId)); if (!t || !b) return { error: '主题或板块不存在' }; t.boardId = b.id; save(); return { ok: true }; }
function markBestAnswer(threadId, postId, userId) { const d = load(); const t = d.threads.find(t => t.id === Number(threadId)); if (!t) return { error: '主题不存在' }; if (t.userId !== userId) return { error: '只有楼主能选最佳答案' }; if (!postId) { t.bestAnswerId = null; save(); return { ok: true }; } const p = d.posts.find(p => p.id === Number(postId) && p.threadId === t.id); if (!p) return { error: '回复不存在' }; t.bestAnswerId = p.id; save(); return { ok: true }; }
function canEditThread(t, user) { return !!(user && (t.userId === user.id || user.role === 'admin')); }
function canEditPost(p, user) { return !!(user && (p.userId === user.id || user.role === 'admin')); }
function editPost(id, userId, content) { const d = load(); const p = d.posts.find(p => p.id === Number(id)); if (!p) return { error: '回复不存在' }; if (p.userId !== userId) return { error: '只能编辑自己的回复' }; if (!content || content.trim().length < 1) return { error: '内容不能为空' }; p.content = content.slice(0, 5000); p.editedAt = nowISO(); save(); return { ok: true }; }
function deletePost(id, user) { const d = load(); const p = d.posts.find(p => p.id === Number(id)); if (!p) return { error: '回复不存在' }; if (!user || (p.userId !== user.id && user.role !== 'admin')) return { error: '无权限' }; const t = d.threads.find(t => t.id === p.threadId); d.posts = d.posts.filter(x => x.id !== p.id); d.reports = d.reports.filter(r => r.postId !== p.id); if (t && t.bestAnswerId === p.id) t.bestAnswerId = null; save(); if (t) recomputeLastReply(t.id); return { ok: true }; }

function search(q, page) {
  const d = load(); const ql = String(q || '').trim().toLowerCase();
  if (!ql) return { q: '', threads: [], posts: [], total: 0, page: 1, pages: 1 };
  const threads = d.threads.filter(t => (t.title + '\n' + t.content).toLowerCase().includes(ql)).map(_enrich).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const posts = d.posts.filter(p => p.content.toLowerCase().includes(ql)).map(p => Object.assign({}, p, { thread: d.threads.find(t => t.id === p.threadId) })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 30);
  const p = paginate(threads, page);
  return { q: String(q), threads: p.items, posts, total: threads.length, page: p.page, pages: p.pages };
}
function getArchive() { const d = load(); const map = {}; for (const t of d.threads) { const ym = (t.createdAt || '').slice(0, 7); if (!map[ym]) map[ym] = []; map[ym].push(_enrich(t)); } return Object.keys(map).sort((a, b) => (a < b ? 1 : -1)).map(ym => ({ month: ym, threads: map[ym].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) })); }

function getUserProfile(id, page) { const d = load(); const profile = d.users.find(u => u.id === Number(id)); if (!profile) return null; const threads = d.threads.filter(t => t.userId === profile.id).map(_enrich).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); const replyCount = d.posts.filter(p => p.userId === profile.id).length; const p = paginate(threads, page); return { profile: { id: profile.id, username: profile.username, role: profile.role, createdAt: profile.createdAt, lastSeen: profile.lastSeen, banned: profile.banned, avatar: profile.avatar || null, signature: profile.signature || '', level: getLevel(profile.id) }, threads: p, replyCount }; }
function getMembers(page) { const d = load(); const members = d.users.map(u => Object.assign({}, u, { threadCount: d.threads.filter(t => t.userId === u.id).length, replyCount: d.posts.filter(p => p.userId === u.id).length })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); return paginate(members, page); }

// @提及
function extractMentions(content) { const re = /(?:^|[^@\w\u4e00-\u9fa5])@([A-Za-z0-9_\u4e00-\u9fa5]{2,16})/g; const set = new Set(); let m; while ((m = re.exec(content || ''))) set.add(m[1]); return [...set]; }
function notifyMentions(content, actorId, actorName, threadId, postId) { for (const name of extractMentions(content)) { const u = findUserByName(name); if (u && u.id !== actorId) addNotification(u.id, 'mention', threadId, postId, actorId, actorName); } }

function addNotification(userId, type, threadId, postId, actorId, actorName) { const d = load(); d.notifications.push({ id: d.nextNotificationId++, userId, type, threadId, postId, actorId, actorName, read: false, createdAt: nowISO() }); save(); }
function getNotifications(userId) { const d = load(); return d.notifications.filter(n => n.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(n => Object.assign({}, n, { thread: d.threads.find(t => t.id === n.threadId) })); }
function unreadCount(userId) { if (!userId) return 0; return load().notifications.filter(n => n.userId === userId && !n.read).length; }
function markAllRead(userId) { const d = load(); for (const n of d.notifications) if (n.userId === userId) n.read = true; save(); }

function addReport(threadId, postId, reporterId, reporterName, reason) { const d = load(); if (!reason || reason.trim().length < 2) return { error: '请填写举报理由' }; d.reports.push({ id: d.nextReportId++, threadId: Number(threadId) || null, postId: Number(postId) || null, reporterId, reporterName, reason: reason.slice(0, 200), resolved: false, createdAt: nowISO() }); save(); return { ok: true }; }
function getReports() { const d = load(); return d.reports.filter(r => !r.resolved).map(r => Object.assign({}, r, { thread: d.threads.find(t => t.id === r.threadId), post: d.posts.find(p => p.id === r.postId) })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
function resolveReport(id) { const d = load(); const r = d.reports.find(x => x.id === Number(id)); if (!r) return false; r.resolved = true; save(); return true; }

function getStats() { const d = load(); return { threads: d.threads.length, posts: d.posts.length + d.threads.length, users: d.users.length, boards: d.boards.length }; }

function getConfig() { return load().config; }
function setConfig(key, value) { const d = load(); if (!d.config) d.config = {}; d.config[key] = value; save(); }

// QQ桥接：机器人把频道消息灌进来
function ingestMessage(qqUsername, content, boardSlug) {
  const d = load();
  const board = getBoardBySlug(boardSlug || (d.config && d.config.ingestBoard) || 'wall');
  if (!board) return { error: '板块不存在' };
  if (!content || content.trim().length < 1) return { error: '内容为空' };
  const name = (qqUsername || '频道消息').slice(0, 16);
  const now = nowISO();
  const title = content.replace(/\s+/g, ' ').trim().slice(0, 24) + (content.length > 24 ? '…' : '');
  const t = { id: d.nextThreadId++, boardId: board.id, userId: 0, username: name, title, content: content.slice(0, 20000), views: 0, createdAt: now, updatedAt: now, editedAt: null, pinned: false, featured: false, locked: false, bestAnswerId: null, lastReplyUser: null, lastReplyAt: now };
  d.threads.push(t); save();
  return { thread: t };
}

// RSS / API
function feedThreads(limit) { return getRecentThreads(limit || 20).map(t => ({ id: t.id, title: t.title, content: t.content, username: t.username, board: t.board, updatedAt: t.updatedAt })); }
function feedThreadsByBoard(slug, limit) { const d = load(); const board = getBoardBySlug(slug); if (!board) return null; const list = d.threads.filter(t => t.boardId === board.id).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, limit || 20); return { board, threads: list.map(t => ({ id: t.id, title: t.title, content: t.content, username: t.username, updatedAt: t.updatedAt })) }; }
function apiRecent(limit) { return getRecentThreads(limit || 20).map(t => ({ id: t.id, title: t.title, content: t.content, username: t.username, board: t.board ? t.board.slug : null, boardName: t.board ? t.board.name : null, createdAt: t.createdAt, updatedAt: t.updatedAt, replyCount: t.replyCount })); }

// 用户等级
function getLevel(userId) {
  const d = load(); const u = d.users.find(x => x.id === Number(userId)); if (!u) return { level: 1, title: 'LV1', color: '#7c818a', count: 0, curMin: 0, nextMin: 5 };
  const count = d.threads.filter(t => t.userId === u.id).length + d.posts.filter(p => p.userId === u.id).length;
  const lv = [[1000,8,'#f472b6'],[500,7,'#ef4444'],[200,6,'#f59e0b'],[100,5,'#a78bfa'],[50,4,'#60a5fa'],[20,3,'#6ee7b7'],[5,2,'#9ca3af'],[0,1,'#7c818a']];
  for (let i = 0; i < lv.length - 1; i++) {
    if (count >= lv[i][0]) return { level: lv[i][1], title: 'LV' + lv[i][1], color: lv[i][2], count, curMin: lv[i][0], nextMin: lv[i - 1] ? lv[i - 1][0] : null };
  }
  const last = lv[lv.length - 1];
  return { level: last[1], title: 'LV' + last[1], color: last[2], count, curMin: last[0], nextMin: 5 };
}

// 签到
function todayKey() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function getCheckinStatus(userId) {
  const d = load(); const c = (d.checkins || {})[userId]; if (!c) return { checked: false, streak: 0, lastDate: null };
  const today = todayKey();
  return { checked: c.lastDate === today, streak: c.streak || 0, lastDate: c.lastDate };
}
function checkin(userId) {
  const d = load(); if (!d.checkins) d.checkins = {};
  const today = todayKey();
  const c = d.checkins[userId] || { lastDate: null, streak: 0, total: 0 };
  if (c.lastDate === today) return { error: '今天已签到', streak: c.streak };
  // 昨天签过则+1，否则重置为1
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yKey = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
  c.streak = (c.lastDate === yKey) ? (c.streak || 0) + 1 : 1;
  c.lastDate = today; c.total = (c.total || 0) + 1;
  d.checkins[userId] = c; save();
  return { ok: true, streak: c.streak, total: c.total };
}

// 今日数据
function getTodayStats() {
  const d = load();
  const today = todayKey();
  const todayThreads = d.threads.filter(t => (t.createdAt || '').slice(0, 10) === today).length;
  const todayPosts = d.posts.filter(p => (p.createdAt || '').slice(0, 10) === today).length;
  const todayCheckins = Object.values(d.checkins || {}).filter(c => c.lastDate === today).length;
  return { threads: todayThreads, posts: todayPosts, checkins: todayCheckins, visitors: d.visitors || 0 };
}

// 在线用户(带头像)
function getOnlineList(sec) {
  sec = sec || 300;
  const d = load(); const cut = Date.now() - sec * 1000;
  return d.users.filter(u => u.lastSeen && new Date(u.lastSeen).getTime() >= cut)
    .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
    .slice(0, 12)
    .map(u => ({ id: u.id, username: u.username, avatar: u.avatar || null, role: u.role }));
}

// 点赞
function toggleLike(kind, id, userId) {
  const d = load();
  const obj = kind === 'post' ? d.posts.find(x => x.id === Number(id)) : d.threads.find(x => x.id === Number(id));
  if (!obj) return { error: '不存在' };
  obj.likes = obj.likes || [];
  const idx = obj.likes.indexOf(userId);
  if (idx >= 0) { obj.likes.splice(idx, 1); save(); return { liked: false, count: obj.likes.length }; }
  obj.likes.push(userId); save(); return { liked: true, count: obj.likes.length };
}

// 收藏
function toggleFavorite(threadId, userId) {
  const d = load(); const u = d.users.find(x => x.id === Number(userId)); if (!u) return { error: '用户不存在' };
  u.favoriteIds = u.favoriteIds || [];
  const tid = Number(threadId);
  const idx = u.favoriteIds.indexOf(tid);
  if (idx >= 0) { u.favoriteIds.splice(idx, 1); save(); return { favorited: false, count: u.favoriteIds.length }; }
  u.favoriteIds.push(tid); save(); return { favorited: true, count: u.favoriteIds.length };
}
function getFavorites(userId) {
  const d = load(); const u = d.users.find(x => x.id === Number(userId)); if (!u) return [];
  return (u.favoriteIds || []).map(id => d.threads.find(t => t.id === id)).filter(Boolean).map(t => Object.assign(_withReplies(t), { board: d.boards.find(b => b.id === t.boardId) })).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

// 关注
function toggleFollow(userId, targetId) {
  const d = load(); const u = d.users.find(x => x.id === Number(userId)); const t = d.users.find(x => x.id === Number(targetId));
  if (!u || !t || u.id === t.id) return { error: '无效' };
  u.following = u.following || [];
  const tid = t.id;
  const idx = u.following.indexOf(tid);
  if (idx >= 0) { u.following.splice(idx, 1); save(); return { following: false, count: u.following.length }; }
  u.following.push(tid); save(); return { following: true, count: u.following.length };
}
function isFollowing(userId, targetId) {
  const u = findUserById(userId); if (!u) return false;
  return (u.following || []).includes(Number(targetId));
}
function getFollowers(targetId) {
  const d = load(); return d.users.filter(u => (u.following || []).includes(Number(targetId))).map(u => Object.assign({}, u, { threadCount: d.threads.filter(t => t.userId === u.id).length }));
}
function getFollowing(userId) {
  const d = load(); const u = d.users.find(x => x.id === Number(userId)); if (!u) return [];
  return (u.following || []).map(id => d.users.find(x => x.id === id)).filter(Boolean).map(u => Object.assign({}, u, { threadCount: d.threads.filter(t => t.userId === u.id).length }));
}

// 签名
function setSignature(userId, sig) {
  const u = findUserById(userId); if (!u) return false;
  u.signature = (sig || '').slice(0, 100); save(); return true;
}

// 茶馆推荐（管理员可添加/删除，首页轮换展示）
function getRecommendations() {
  const d = load();
  return (d.recommendations || []).map(r => ({ id: r.id, text: r.text, author: r.author, createdAt: r.createdAt }));
}
function addRecommendation(text, author) {
  const d = load();
  if (!text || text.trim().length < 2) return { error: '推荐语至少 2 字' };
  const r = { id: d.nextRecommendationId++, text: text.trim().slice(0, 500), author: author || '管理员', createdAt: nowISO() };
  d.recommendations.push(r); save();
  return { recommendation: r };
}
function deleteRecommendation(id) {
  const d = load();
  d.recommendations = (d.recommendations || []).filter(r => r.id !== Number(id));
  save(); return { ok: true };
}

function getVisitorCount() { return load().visitors || 0; }
function incrementVisitors() {
  const d = load();
  d.visitors = (d.visitors || 0) + 1;
  save();
  return d.visitors;
}

function getHotSearches(limit) {
  const d = load();
  return d.threads.slice()
    .sort((a, b) => (b.likes || []).length + b.views * 0.1 - ((a.likes || []).length + a.views * 0.1))
    .slice(0, limit || 10)
    .map(t => ({ id: t.id, title: t.title, username: t.username, views: t.views, likes: (t.likes || []).length, board: d.boards.find(b => b.id === t.boardId) ? d.boards.find(b => b.id === t.boardId).name : null, authorAvatar: t.userAvatar || null }));
}

function getRecentActivity(limit) {
  const d = load();
  const items = [];
  d.threads.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit || 8).forEach(t => {
    items.push({ type: 'thread', id: t.id, title: t.title, username: t.username, time: t.createdAt, board: d.boards.find(b => b.id === t.boardId) ? d.boards.find(b => b.id === t.boardId).name : null });
  });
  d.posts.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit || 5).forEach(p => {
    const t = d.threads.find(t => t.id === p.threadId);
    items.push({ type: 'reply', id: p.id, title: t ? t.title : '未知帖子', username: p.username, time: p.createdAt, threadId: p.threadId });
  });
  return items.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, limit || 10);
}

module.exports = {
  load, save, nowISO, PER_PAGE, paginate,
  hashPassword, verifyPassword,
  findUserByName, findUserById, createUser, setBanned, deleteUser, changePassword, setAvatar, updateLastSeen, getOnlineUsers,
  setRole, isStaff, isBbsOwner,
  createSession, getUserBySession, destroySession,
  getBoards, getBoardBySlug, getBoardById, addBoard, editBoard, deleteBoard, setBoardOwner,
  getThreadsByBoard, getRecentThreads, getFeatured, getThread, incrementViews,
  createThread, recomputeLastReply, addReply, editThread, deleteThread, setThreadFlag, moveThread, markBestAnswer,
  canEditThread, canEditPost, editPost, deletePost,
  search, getArchive, getUserProfile, getMembers,
  extractMentions, notifyMentions,
  addNotification, getNotifications, unreadCount, markAllRead,
  addReport, getReports, resolveReport,
  getStats, getConfig, setConfig, ingestMessage, getLevel, toggleLike, toggleFavorite, toggleFollow, isFollowing, getFollowers, getFollowing, getFavorites, setSignature,
  getCheckinStatus, checkin, getTodayStats, getOnlineList, syncCrawledPosts, syncCrawledComments,
  getRecommendations, addRecommendation, deleteRecommendation,
  feedThreads, feedThreadsByBoard, apiRecent,
  getVisitorCount, incrementVisitors, getHotSearches, getRecentActivity,
};
