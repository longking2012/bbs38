/**
 * 评论提取器 v2 - 使用Edge CDP抓取QQ频道帖子评论
 * 从频道页JSON-LD获取标题，从帖子详情页获取评论
 */
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9222;
const CONFIG_PATH = path.join(__dirname, 'auto_crawl_config.json');
const OUTPUT_PATH = path.join(__dirname, '_comments_latest.json');
const COOKIE = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).cookie;
const CHANNEL_URL = 'https://pd.qq.com/s/3rdxuheha';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseCookies(str) {
  return str.split(';').map(s => s.trim()).filter(s => s.includes('=')).map(s => {
    const [name, ...rest] = s.split('=');
    return { name: name.trim(), value: rest.join('=').trim(), domain: '.qq.com', path: '/' };
  });
}

function getWsUrl() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/json`, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { const tabs = JSON.parse(d); const tab = tabs.find(t => t.type === 'page') || tabs[0]; resolve(tab.webSocketDebuggerUrl); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// HTTP抓取频道页获取JSON-LD
function fetchChannelPage() {
  return new Promise((resolve, reject) => {
    https.get(CHANNEL_URL, { headers: { 'User-Agent': UA, 'Cookie': COOKIE }, timeout: 15000 }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        const posts = [];
        const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
        let m;
        while ((m = re.exec(d)) !== null) {
          try {
            const o = JSON.parse(m[1]);
            for (const el of (o['@graph'] || [])) {
              if (el['@type'] !== 'ItemList') continue;
              for (const e of (el.itemListElement || [])) {
                const it = e.item;
                if (!it || it['@type'] !== 'SocialMediaPosting') continue;
                posts.push({
                  title: it.headline || '',
                  author: (it.author || {}).name || '',
                  date: (it.datePublished || '').slice(0, 16),
                  likes: (it.interactionStatistic || {}).userInteractionCount || 0
                });
              }
            }
          } catch {}
        }
        resolve(posts);
      });
    }).on('error', reject);
  });
}

// 从文本解析评论
function parseComments(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  const comments = [];
  const datePattern = /^\d{1,2}-\d{1,2}$/;
  const numPattern = /^\d+$/;
  const skipWords = ['回复', '点赞', '评论', '热门', '浏览', '去频道', '频道', '分享', '暂无更多评论', '发言要友善'];
  
  let i = 0;
  while (i < lines.length - 1) {
    if (lines[i + 1] === '回复') {
      let j = i;
      const parts = [];
      while (j >= 0 && !datePattern.test(lines[j])) {
        if (!skipWords.includes(lines[j]) && !numPattern.test(lines[j])) parts.unshift(lines[j]);
        j--;
      }
      let date = '';
      if (j >= 0 && datePattern.test(lines[j])) { date = lines[j]; j--; }
      let username = '';
      if (j >= 0 && !datePattern.test(lines[j]) && !skipWords.includes(lines[j]) && !lines[j].includes('频道')) username = lines[j];
      const content = parts.join(' ').trim();
      if (username && content) comments.push({ username, date, content });
      i += 2;
    } else { i++; }
  }
  return comments;
}

async function main() {
  console.log('[评论提取v2] 启动...');
  
  // 1. HTTP抓取频道页获取帖子列表（标题+作者）
  console.log('1. HTTP抓取频道页...');
  const posts = await fetchChannelPage();
  console.log('   帖子数:', posts.length);
  
  // 2. 启动Edge CDP
  const userDataDir = path.join(__dirname, '_edge_tmp_' + Date.now());
  fs.mkdirSync(userDataDir, { recursive: true });
  const child = spawn(EDGE, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDataDir}`, '--window-size=1280,900'], { stdio: ['ignore', 'ignore', 'ignore'] });
  await sleep(3000);
  
  try {
    const wsUrl = await getWsUrl();
    const ws = new WebSocket(wsUrl);
    let msgId = 1; const pending = {};
    ws.addEventListener('message', event => { const resp = JSON.parse(event.data); if (resp.id && pending[resp.id]) { pending[resp.id](resp.result); delete pending[resp.id]; } });
    function send(method, params = {}) { const id = msgId++; return new Promise(resolve => { pending[id] = resolve; ws.send(JSON.stringify({ id, method, params })); }); }
    await new Promise(r => { ws.addEventListener('open', r); ws.addEventListener('error', r); });
    await send('Network.enable');
    await send('Network.setCookies', { cookies: parseCookies(COOKIE) });
    await send('Page.enable');

    // 3. Edge抓频道页获取帖子URL
    console.log('2. Edge抓取帖子URL...');
    await send('Page.navigate', { url: CHANNEL_URL });
    await sleep(10000);

    const linkExpr = "JSON.stringify(Array.from(document.querySelectorAll('a')).map(a=>({h:a.href,t:a.innerText.trim().slice(0,60)})).filter(a=>a.h&&a.h.indexOf('/post/')!==-1))";
    const linkResult = await send('Runtime.evaluate', { expression: linkExpr, returnByValue: true });
    let links = [];
    try { links = JSON.parse(linkResult.result ? linkResult.result.value : '[]'); } catch {}
    console.log('   帖子URL数:', links.length);

    // 4. 对每个帖子抓评论
    const results = [];
    for (let i = 0; i < links.length && i < posts.length; i++) {
      const postId = links[i].h.split('/post/')[1].split('?')[0];
      const title = posts[i].title;
      const author = posts[i].author;
      
      console.log(`   ${i+1}. ${title.slice(0, 25)}...`);
      await send('Page.navigate', { url: links[i].h });
      await sleep(8000);

      const textResult = await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
      const text = textResult.result ? textResult.result.value : '';
      const comments = parseComments(text);
      
      results.push({ postId, title, author, url: links[i].h, comments });
      if (comments.length > 0) console.log(`      → ${comments.length} 条评论`);
    }

    // 5. 保存
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
    const totalComments = results.reduce((s, r) => s + r.comments.length, 0);
    console.log(`3. 完成: ${results.length} 个帖子, ${totalComments} 条评论`);

    ws.close();
  } catch (e) {
    console.error('   错误:', e.message);
  } finally {
    child.kill();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

main();
