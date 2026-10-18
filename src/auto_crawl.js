'use strict';
// 自动抓取QQ频道帖子，每60秒一次，通过 HTTP API 同步进 BBS（避免和 app.js 内存缓存冲突）
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_FILE = path.join(__dirname, 'auto_crawl_config.json');
const CRAWL_URL = 'https://pd.qq.com/s/3rdxuheha?tab=latest';
const SYNC_API = 'http://127.0.0.1:3000/internal/sync';
const INTERVAL = 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function loadConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return { cookie: '' }; } }

function fetchPage(cookie) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': UA };
    if (cookie) headers['Cookie'] = cookie;
    https.get(CRAWL_URL, { headers, timeout: 30000 }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve(data)); res.on('error', reject);
    }).on('error', reject);
  });
}

function parsePosts(html) {
  const posts = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]);
      for (const el of (obj['@graph'] || [])) {
        if (el['@type'] !== 'ItemList') continue;
        for (const e of (el.itemListElement || [])) {
          const it = e.item;
          if (!it || it['@type'] !== 'SocialMediaPosting') continue;
          const a = it.author || {};
          posts.push({ title: it.headline || '', author: a.name || '', likes: (it.interactionStatistic || {}).userInteractionCount || 0, date: it.datePublished || '', avatarUrl: a.url || '', full: it.headline || '' });
        }
      }
    } catch {}
  }
  return posts;
}

function syncToBbs(posts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(posts);
    const req = http.request(SYNC_API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 10000 }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('同步超时')); });
    req.write(body); req.end();
  });
}

function dlAvatar(url) {
  return new Promise(resolve => {
    if (!url) { resolve(null); return; }
    const dir = path.join(__dirname, 'data', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 10);
    const file = path.join(dir, 'av_' + hash + '.jpg');
    if (fs.existsSync(file)) { resolve('/uploads/av_' + hash + '.jpg'); return; }
    const r = https.get(url, { headers: { 'User-Agent': UA }, timeout: 10000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { resolve(dlAvatar(res.headers.location)); return; }
      if (res.statusCode !== 200) { resolve(null); return; }
      const ws = fs.createWriteStream(file);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve('/uploads/av_' + hash + '.jpg'); });
      ws.on('error', () => resolve(null));
    });
    r.on('timeout', () => { r.destroy(); resolve(null); });
    r.on('error', () => resolve(null));
  });
}

async function tick() {
  const cfg = loadConfig();
  const now = new Date().toLocaleTimeString('zh-CN');
  try {
    const html = await fetchPage(cfg.cookie);
    const posts = parsePosts(html);
    if (!posts.length) { console.log(`[${now}] 没抓到帖子`); return; }
    // 下载头像
    for (const p of posts) {
      if (p.avatarUrl && !p.avatarLocal) {
        p.avatarLocal = await dlAvatar(p.avatarUrl);
      }
    }
    const r = await syncToBbs(posts);
    const avOk = posts.filter(p => p.avatarLocal).length;
    console.log(`[${now}] 抓到 ${posts.length} 帖，新增 ${r.added || 0}，更新 ${r.updated || 0}，头像 ${avOk}`);
  } catch (e) { console.log(`[${now}] 失败: ${e.message}`); }
}

console.log('自动抓取已启动，每60秒一次。Cookie: ' + (loadConfig().cookie ? '已配置' : '未配置'));
tick();
setInterval(tick, INTERVAL);
