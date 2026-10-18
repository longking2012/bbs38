'use strict';
// 零依赖入口：完整 BBS + 图片/头像上传 + @提及 + QQ桥接(/ingest /api/recent)
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const upload = require('./upload');
const R = require('./render');

const PORT = process.env.PORT || 3000;
const BASE = 'http://localhost:' + PORT;
const PUBLIC_DIR = path.join(__dirname, 'public');

function parseCookies(header) { const out = {}; if (!header) return out; header.split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return out; }
function currentUser(req) { const sid = parseCookies(req.headers.cookie).sid; return sid ? store.getUserBySession(sid) : null; }
function readBody(req) { return new Promise((resolve) => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => resolve(new URLSearchParams(d))); req.on('error', () => resolve(new URLSearchParams())); }); }
function send(res, status, body, headers) { res.writeHead(status, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, headers || {})); res.end(body); }
function html(res, page) { send(res, 200, page); }
function json(res, obj, status) { send(res, status || 200, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' }); }
function redirect(res, loc) { res.writeHead(302, { Location: loc }); res.end(); }
function ctx(req) { const user = currentUser(req); if (user) store.updateLastSeen(user); return { user, unread: user ? store.unreadCount(user.id) : 0 }; }
function getPostCtx(pid) { const d = store.load(); const post = d.posts.find(x => x.id === Number(pid)); if (!post) return null; return { post, thread: d.threads.find(t => t.id === post.threadId) }; }
function deny(res, user, unread, text) { return html(res, R.messagePage({ user, unread, title: '无权限', text })); }
function backUrl(req, fb) { const r = req.headers.referer; if (r && r.startsWith(BASE)) return r; return fb || '/'; }

function fireWebhook(thread) {
  try {
    const cfg = store.getConfig(); const url = cfg.qqWebhook; if (!url) return;
    const u = new URL(url); const lib = u.protocol === 'https:' ? require('https') : require('http');
    const data = JSON.stringify({ title: thread.title, url: BASE + '/t/' + thread.id, author: thread.username, content: (thread.content || '').slice(0, 200) });
    const r = lib.request({ hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + (u.search || ''), method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, () => {});
    r.on('error', () => {}); r.write(data); r.end();
  } catch (e) { console.error('webhook err', e.message); }
}

const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.xml': 'application/rss+xml; charset=utf-8' };
function serveStatic(res, pathname) { const rel = decodeURIComponent(pathname.replace(/^\/public\//, '')); const file = path.join(PUBLIC_DIR, rel); if (!file.startsWith(PUBLIC_DIR)) { send(res, 403, 'forbidden'); return; } fs.readFile(file, (err, data) => { if (err) { send(res, 404, 'not found'); return; } send(res, 200, data, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); }); }
function serveUpload(res, rel) { const file = path.join(upload.UPLOAD_DIR, decodeURIComponent(rel)); if (!file.startsWith(upload.UPLOAD_DIR)) { send(res, 403, 'forbidden'); return; } fs.readFile(file, (err, data) => { if (err) { send(res, 404, 'not found'); return; } send(res, 200, data, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'max-age=31536000' }); }); }

async function handle(req, res) {
  const u = new URL(req.url, BASE);
  const p = u.pathname, m = req.method, seg = p.split('/').filter(Boolean);
  const { user, unread } = ctx(req);
  if (p === '/favicon.ico') return serveStatic(res, '/public/logo.png');
  if (p.startsWith('/public/')) { serveStatic(res, p); return; }
  if (seg[0] === 'uploads' && seg.length === 2 && m === 'GET') { serveUpload(res, seg[1]); return; }
  try {
    if (m === 'GET') store.incrementVisitors();
    if (p === '/' && m === 'GET') return html(res, R.homePage({ user, unread, boards: store.getBoards(), recent: store.getRecentThreads(15), featured: store.getFeatured(5), recommendations: store.getRecommendations(), stats: store.getStats(), online: store.getOnlineList(), today: store.getTodayStats(), checkin: user ? store.getCheckinStatus(user.id) : null }));
    if (p === '/featured' && m === 'GET') { const f = store.getFeatured(50); const list = f.length ? `<ul class="discussions">${f.map(R.threadRow).join('')}</ul>` : '<p class="muted">还没有精华主题。</p>'; return html(res, R.layout({ title: '精华', user, unread, active: 'featured', content: '<h1 class="page-title">精华</h1>' + list })); }
    // 签到
    if (p === '/checkin' && m === 'POST') { if (!user) return redirect(res, '/login'); const r = store.checkin(user.id); return redirect(res, '/?checkin=' + (r.error ? '0' : r.streak)); }
    if (p === '/archive' && m === 'GET') return html(res, R.archivePage({ user, unread, groups: store.getArchive() }));
    if (p === '/members' && m === 'GET') { const d = store.getMembers(u.searchParams.get('page')); return html(res, R.membersPage(Object.assign({ user, unread }, d))); }
    if (p === '/search' && m === 'GET') { const q = u.searchParams.get('q') || ''; const r = store.search(q, u.searchParams.get('page')); return html(res, R.searchPage(Object.assign({ user, unread }, r))); }
    if (p === '/feed' && m === 'GET') return send(res, 200, R.feedXML({ title: '三十八中校园论坛', description: '合肥市第三十八中学学生论坛', base: BASE, threads: store.feedThreads(20) }), { 'Content-Type': 'application/rss+xml; charset=utf-8' });

    // 图片上传（本地保存 + 远程同步）
    if (p === '/upload' && m === 'POST') {
      if (!user) return json(res, { error: '未登录' }, 401);
      try {
        const buf = await upload.readRawBody(req, 5 * 1024 * 1024);
        const bm = (req.headers['content-type'] || '').match(/boundary=([^;]+)/);
        if (!bm) return json(res, { error: '请求格式错误' }, 400);
        const parts = upload.parseMultipart(buf, bm[1]);
        const file = parts.find(x => x.isFile && x.body && x.body.length);
        if (!file) return json(res, { error: '没有文件' }, 400);
        // 本地保存（备份）
        const fn = upload.saveImage(file.body);
        // 同步到远程服务器
        try {
          const remote = await upload.uploadToRemote(file.body, fn);
          return json(res, { url: remote.url, local: '/uploads/' + fn });
        } catch (e) {
          return json(res, { url: '/uploads/' + fn, local: '/uploads/' + fn, remoteError: e.message });
        }
      } catch (e) { return json(res, { error: e.message || '上传失败' }, 400); }
    }

    // QQ桥接：机器人灌消息
    if (p === '/ingest' && m === 'POST') {
      const buf = await upload.readRawBody(req, 1e6);
      let payload; try { payload = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { error: 'JSON 解析失败' }, 400); }
      const cfg = store.getConfig();
      if (!cfg.ingestToken) return json(res, { error: '未配置 ingest token（管理员先在后台设）' }, 403);
      if (payload.token !== cfg.ingestToken) return json(res, { error: 'token 不对' }, 403);
      const r = store.ingestMessage(payload.username, payload.content, payload.boardSlug);
      if (r.error) return json(res, { error: r.error }, 400);
      fireWebhook(r.thread); // 灌进来的也可选推回 webhook
      return json(res, { ok: true, id: r.thread.id });
    }

    // 自动抓取同步接口（本地内部调用）
    if (p === '/internal/sync' && m === 'POST') {
      const buf = await upload.readRawBody(req, 1e6);
      let posts; try { posts = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { error: 'JSON 解析失败' }, 400); }
      if (!Array.isArray(posts)) return json(res, { error: '需要帖子数组' }, 400);
      const r = store.syncCrawledPosts(posts);
      return json(res, r);
    }
    // 评论同步接口
    if (p === '/internal/sync-comments' && m === 'POST') {
      const buf = await upload.readRawBody(req, 5e6);
      let data; try { data = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { error: 'JSON 解析失败' }, 400); }
      if (!Array.isArray(data)) return json(res, { error: '需要数据数组' }, 400);
      const r = store.syncCrawledComments(data);
      return json(res, r);
    }
    // QQ桥接：机器人拉取本站新帖转发回QQ
    if (p === '/api/recent' && m === 'GET') { const n = Math.min(parseInt(u.searchParams.get('limit') || '20', 10) || 20, 100); return json(res, { threads: store.apiRecent(n) }); }

    if (p === '/login' && m === 'GET') return html(res, R.authPage({ mode: 'login' }));
    if (p === '/login' && m === 'POST') { const b = await readBody(req); const uname = b.get('username') || ''; const t = store.findUserByName(uname); if (!t || t.banned || !store.verifyPassword(b.get('password') || '', t.passHash, t.salt)) return html(res, R.authPage({ mode: 'login', error: (t && t.banned) ? '账号已被封禁' : '用户名或密码错误', values: { username: uname } })); const token = store.createSession(t.id); res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax`); return redirect(res, '/'); }
    if (p === '/register' && m === 'GET') return html(res, R.authPage({ mode: 'register' }));
    if (p === '/register' && m === 'POST') { const b = await readBody(req); const r = store.createUser(b.get('username') || '', b.get('password') || ''); if (!r || r.error) return html(res, R.authPage({ mode: 'register', error: (r && r.error) || '注册失败', values: { username: b.get('username') || '' } })); const token = store.createSession(r.user.id); res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax`); return redirect(res, '/'); }
    if (p === '/logout' && m === 'GET') { const sid = parseCookies(req.headers.cookie).sid; if (sid) store.destroySession(sid); res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0'); return redirect(res, '/'); }

    if (p === '/notifications' && m === 'GET') { if (!user) return redirect(res, '/login'); return html(res, R.notificationsPage({ user, unread, notifications: store.getNotifications(user.id) })); }
    if (p === '/notifications/read' && m === 'POST') { if (!user) return redirect(res, '/login'); store.markAllRead(user.id); return redirect(res, '/notifications'); }

    if (p === '/settings' && m === 'GET') { if (!user) return redirect(res, '/login'); return html(res, R.settingsPage({ user, unread, signature: user.signature || '' })); }
    if (p === '/settings' && m === 'POST') { if (!user) return redirect(res, '/login'); const b = await readBody(req); if ((b.get('new') || '') !== (b.get('confirm') || '')) return html(res, R.settingsPage({ user, unread, error: '两次新密码不一致' })); const r = store.changePassword(user.id, b.get('old') || '', b.get('new') || ''); if (r.error) return html(res, R.settingsPage({ user, unread, error: r.error })); return html(res, R.settingsPage({ user, unread, ok: true })); }
    if (p === '/settings/avatar' && m === 'POST') {
      if (!user) return redirect(res, '/login');
      try { const buf = await upload.readRawBody(req, 5 * 1024 * 1024); const bm = (req.headers['content-type'] || '').match(/boundary=([^;]+)/); if (!bm) return html(res, R.messagePage({ user, unread, title: '上传失败', text: '请求格式错误' })); const parts = upload.parseMultipart(buf, bm[1]); const f = parts.find(x => x.isFile && x.body); if (!f) return html(res, R.messagePage({ user, unread, title: '上传失败', text: '没有文件' })); const fn = upload.saveImage(f.body); let avatarUrl = '/uploads/' + fn; try { const remote = await upload.uploadToRemote(f.body, fn); avatarUrl = remote.url; } catch(e) {} store.setAvatar(user.id, avatarUrl); return redirect(res, '/u/' + user.id); }
      catch (e) { return html(res, R.messagePage({ user, unread, title: '上传失败', text: e.message || '错误' })); }
    }
    if (p === '/settings/avatar/remove' && m === 'POST') { if (!user) return redirect(res, '/login'); store.setAvatar(user.id, null); return redirect(res, '/u/' + user.id); }
    if (p === '/settings/signature' && m === 'POST') { if (!user) return redirect(res, '/login'); const b = await readBody(req); store.setSignature(user.id, b.get('signature') || ''); return redirect(res, '/settings'); }

    // @提及跳转
    if (seg[0] === '@' && seg.length === 2 && m === 'GET') { const tu = store.findUserByName(decodeURIComponent(seg[1])); if (!tu) return html(res, R.notFoundPage({ user, unread })); return redirect(res, '/u/' + tu.id); }

    if (seg[0] === 'admin') {
      if (!user || !store.isStaff(user)) return deny(res, user, unread, '只有管理员能进后台。');
      if (p === '/admin' && m === 'GET') return html(res, R.adminPage({ user, unread, boards: store.getBoards(), users: store.getMembers(1).items, allUsers: store.getMembers(999).items, reports: store.getReports(), recommendations: store.getRecommendations(), config: store.getConfig() }));
      if (p === '/admin/reco' && m === 'POST') { const b = await readBody(req); const r = store.addRecommendation(b.get('text') || '', user.username); return redirect(res, '/admin'); }
      if (seg[1] === 'reco' && seg[3] === 'delete' && m === 'POST') { store.deleteRecommendation(seg[2]); return redirect(res, '/admin'); }
      if (p === '/admin/config' && m === 'POST') { const b = await readBody(req); if (b.get('ingestToken') !== null) store.setConfig('ingestToken', (b.get('ingestToken') || '').trim()); if (b.get('ingestBoard') !== null) store.setConfig('ingestBoard', b.get('ingestBoard')); if (b.get('qqWebhook') !== null) store.setConfig('qqWebhook', (b.get('qqWebhook') || '').trim()); return redirect(res, '/admin'); }
      if (seg[1] === 'board' && m === 'POST' && seg.length === 2) { const b = await readBody(req); store.addBoard(b.get('name'), b.get('desc'), b.get('color')); return redirect(res, '/admin'); }
      if (seg[1] === 'board' && seg[3] === 'delete' && m === 'POST') { store.deleteBoard(seg[2]); return redirect(res, '/admin'); }
      if (seg[1] === 'user' && seg[3] === 'ban' && m === 'POST') { store.setBanned(seg[2], true); return redirect(res, '/admin'); }
      if (seg[1] === 'user' && seg[3] === 'unban' && m === 'POST') { store.setBanned(seg[2], false); return redirect(res, '/admin'); }
      if (seg[1] === 'user' && seg[3] === 'delete' && m === 'POST') { store.deleteUser(seg[2]); return redirect(res, '/admin'); }
      // BBS主专属：角色管理
      if (seg[1] === 'user' && seg[3] === 'promote' && m === 'POST') { if (!store.isBbsOwner(user)) return deny(res, user, unread, '只有BBS主能改角色。'); store.setRole(seg[2], 'admin'); return redirect(res, '/admin'); }
      if (seg[1] === 'user' && seg[3] === 'demote' && m === 'POST') { if (!store.isBbsOwner(user)) return deny(res, user, unread, '只有BBS主能改角色。'); store.setRole(seg[2], 'member'); return redirect(res, '/admin'); }
      if (seg[1] === 'user' && seg[3] === 'owner' && m === 'POST') { if (!store.isBbsOwner(user)) return deny(res, user, unread, '只有BBS主能改角色。'); store.setRole(seg[2], 'bbs_owner'); return redirect(res, '/admin'); }
      if (seg[1] === 'board' && seg[3] === 'owner' && m === 'POST') { if (!store.isBbsOwner(user)) return deny(res, user, unread, '只有BBS主能改板块负责人。'); const b = await readBody(req); store.setBoardOwner(seg[2], b.get('userId')); return redirect(res, '/admin'); }
      if (seg[1] === 'report' && seg[3] === 'resolve' && m === 'POST') { store.resolveReport(seg[2]); return redirect(res, '/admin'); }
    }

    if (seg[0] === 'u' && seg.length === 2 && m === 'GET') { const d = store.getUserProfile(seg[1], u.searchParams.get('page')); if (!d) return html(res, R.notFoundPage({ user, unread })); const isFol=!!(user&&user.id!==d.profile.id&&store.isFollowing(user.id,d.profile.id)); return html(res, R.profilePage(Object.assign({ user, unread, isSelf: !!(user && user.id === d.profile.id), profile: d.profile, replyCount: d.replyCount, isFollowing: isFol }, d.threads))); }
    if (seg[0] === 'u' && seg[2] === 'follow' && m === 'POST') { if (!user) return redirect(res, '/login'); if (user.id === Number(seg[1])) return redirect(res, '/u/' + seg[1]); store.toggleFollow(user.id, seg[1]); return redirect(res, backUrl(req, '/u/' + seg[1])); }

    if (seg[0] === 'b') {
      if (seg[2] === 'feed' && m === 'GET') { const r = store.feedThreadsByBoard(seg[1], 20); if (!r) return html(res, R.notFoundPage({ user, unread })); return send(res, 200, R.feedXML({ title: r.board.name + ' · 三十八中', description: r.board.desc || '', base: BASE, threads: r.threads }), { 'Content-Type': 'application/rss+xml; charset=utf-8' }); }
      if (seg.length === 2 && m === 'GET') { const d = store.getThreadsByBoard(seg[1], u.searchParams.get('page')); if (!d) return html(res, R.notFoundPage({ user, unread })); return html(res, R.boardPage(Object.assign({ user, unread, boards: store.getBoards(), featured: store.getFeatured(5), recent: store.getRecentThreads(5) }, d))); }
      if (seg[2] === 'new') { const board = store.getBoardBySlug(seg[1]); if (!board) return html(res, R.notFoundPage({ user, unread })); if (m === 'GET') { if (!user) return redirect(res, '/login'); return html(res, R.newThreadPage({ user, unread, board })); } if (m === 'POST') { if (!user) return redirect(res, '/login'); const b = await readBody(req); const r = store.createThread(seg[1], user.id, user.username, b.get('title') || '', b.get('content') || ''); if (!r) return html(res, R.notFoundPage({ user, unread })); if (r.error) return html(res, R.newThreadPage({ user, unread, board, error: r.error, values: { title: b.get('title'), content: b.get('content') } })); fireWebhook(r.thread); return redirect(res, '/t/' + r.thread.id); } }
    }

    if (seg[0] === 't' && seg[1]) {
      const tid = seg[1];
      if (seg.length === 2 && m === 'GET') { store.incrementViews(tid); const d = store.getThread(tid); if (!d) return html(res, R.notFoundPage({ user, unread })); const isFav=!!(user&&(user.favoriteIds||[]).includes(Number(tid))); const isFol=!!(user&&user.id!==d.thread.userId&&store.isFollowing(user.id,d.thread.userId)); return html(res, R.threadPage(Object.assign({ user, unread, boards: store.getBoards(), isFavorited: isFav, isFollowing: isFol }, d))); }
      if (seg[2] === 'reply' && m === 'POST') { if (!user) return redirect(res, '/login'); const d = store.getThread(tid); if (!d) return html(res, R.notFoundPage({ user, unread })); const b = await readBody(req); const r = store.addReply(tid, user.id, user.username, b.get('content') || ''); if (r && r.error) return html(res, R.messagePage({ user, unread, title: '回复失败', text: r.error, link: { href: '/t/' + tid, text: '返回主题' } })); return redirect(res, '/t/' + tid); }
      if (['pin', 'unpin', 'feature', 'unfeature', 'lock', 'unlock'].includes(seg[2]) && m === 'POST') { if (!user || !store.isStaff(user)) return deny(res, user, unread, '只有管理员能操作。'); const flag = ['pin', 'unpin'].includes(seg[2]) ? 'pinned' : (['lock', 'unlock'].includes(seg[2]) ? 'locked' : 'featured'); store.setThreadFlag(tid, flag, !seg[2].startsWith('un')); return redirect(res, '/t/' + tid); }
      if (seg[2] === 'move' && m === 'POST') { if (!user || !store.isStaff(user)) return deny(res, user, unread, '只有管理员能移动主题。'); const b = await readBody(req); store.moveThread(tid, b.get('boardId')); return redirect(res, '/t/' + tid); }
      if (seg[2] === 'best' && m === 'POST') { const d = store.getThread(tid); if (!d) return html(res, R.notFoundPage({ user, unread })); if (!user || d.thread.userId !== user.id) return deny(res, user, unread, '只有楼主能选最佳答案。'); const b = await readBody(req); store.markBestAnswer(tid, b.get('postId'), user.id); return redirect(res, '/t/' + tid); }
      if (seg[2] === 'like' && m === 'POST') { if (!user) return redirect(res, '/login'); store.toggleLike('thread', tid, user.id); return redirect(res, backUrl(req, '/t/' + tid)); }
      if (seg[2] === 'favorite' && m === 'POST') { if (!user) return redirect(res, '/login'); store.toggleFavorite(tid, user.id); return redirect(res, backUrl(req, '/t/' + tid)); }
      if (seg[2] === 'edit') { const d = store.getThread(tid); if (!d) return html(res, R.notFoundPage({ user, unread })); if (!user || !store.canEditThread(d.thread, user)) return deny(res, user, unread, '你不能编辑这个主题。'); if (m === 'GET') return html(res, R.editThreadPage(Object.assign({ user, unread }, d))); if (m === 'POST') { const b = await readBody(req); const r = store.editThread(tid, user.id, b.get('content') || ''); if (r.error) return html(res, R.messagePage({ user, unread, title: '编辑失败', text: r.error, link: { href: '/t/' + tid + '/edit', text: '返回' } })); return redirect(res, '/t/' + tid); } }
      if (seg[2] === 'delete' && m === 'POST') { const d = store.getThread(tid); if (!d) return html(res, R.notFoundPage({ user, unread })); const r = store.deleteThread(tid, user); if (r && r.error) return html(res, R.messagePage({ user, unread, title: '删除失败', text: r.error })); return redirect(res, '/'); }
    }

    if (seg[0] === 'post' && seg[1]) {
      const pid = seg[1];
      if (seg[2] === 'edit') { const pc = getPostCtx(pid); if (!pc) return html(res, R.notFoundPage({ user, unread })); if (!user || !store.canEditPost(pc.post, user)) return deny(res, user, unread, '你不能编辑这条回复。'); if (m === 'GET') return html(res, R.editPostPage({ user, unread, thread: pc.thread, post: pc.post })); if (m === 'POST') { const b = await readBody(req); const r = store.editPost(pid, user.id, b.get('content') || ''); if (r.error) return html(res, R.messagePage({ user, unread, title: '编辑失败', text: r.error })); return redirect(res, '/t/' + (pc.thread ? pc.thread.id : '')); } }
      if (seg[2] === 'delete' && m === 'POST') { const pc = getPostCtx(pid); if (!pc) return html(res, R.notFoundPage({ user, unread })); const r = store.deletePost(pid, user); if (r && r.error) return html(res, R.messagePage({ user, unread, title: '删除失败', text: r.error })); return redirect(res, '/t/' + (pc.thread ? pc.thread.id : '')); }
      if (seg[2] === 'like' && m === 'POST') { if (!user) return redirect(res, '/login'); store.toggleLike('post', pid, user.id); return redirect(res, backUrl(req, '/')); }
      if (seg[2] === 'report') { const pc = getPostCtx(pid); if (!pc) return html(res, R.notFoundPage({ user, unread })); if (!user) return redirect(res, '/login'); if (m === 'GET') return html(res, R.reportPage({ user, unread, thread: pc.thread, post: pc.post })); if (m === 'POST') { const b = await readBody(req); const r = store.addReport(pc.thread ? pc.thread.id : null, pid, user.id, user.username, b.get('reason') || ''); if (r && r.error) return html(res, R.reportPage({ user, unread, thread: pc.thread, post: pc.post, error: r.error })); return redirect(res, '/t/' + (pc.thread ? pc.thread.id : '')); } }
    }

    return html(res, R.notFoundPage({ user, unread }));
  } catch (e) { console.error('handler error:', e); send(res, 500, '<h1>服务器出错了</h1><pre>' + R.esc((e && e.stack) || String(e)) + '</pre>'); }
}

const server = http.createServer((req, res) => { handle(req, res).catch(err => { try { send(res, 500, String(err)); } catch (_) {} }); });
server.listen(PORT, () => { console.log('三十八中 BBS 已启动： ' + BASE); console.log('提示：第一个注册的账号自动成为管理员。按 Ctrl+C 停止。'); });
