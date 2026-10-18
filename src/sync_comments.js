/**
 * 评论同步：提取QQ频道评论并同步到BBS
 * 用法: node sync_comments.js
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const NODE = 'C:\\Users\\LENOVO\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\node\\bin\\node.exe';
const SCRIPT = path.join(__dirname, 'extract_comments.js');
const DATA_FILE = path.join(__dirname, '_comments_latest.json');
const SYNC_API = 'http://127.0.0.1:3000/internal/sync-comments';

function postJSON(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve(d); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== 评论同步 ===');
  
  // 1. 运行评论提取
  console.log('1. 提取评论...');
  const result = spawnSync(NODE, [SCRIPT], { timeout: 300000, encoding: 'utf8' });
  if (result.stderr) console.log(result.stderr);
  if (result.status !== 0) { console.log('提取失败'); return; }

  // 2. 读取评论数据
  if (!fs.existsSync(DATA_FILE)) { console.log('未找到评论数据文件'); return; }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const totalComments = data.reduce((s, r) => s + r.comments.length, 0);
  console.log(`2. 读取 ${data.length} 个帖子, ${totalComments} 条评论`);

  // 3. 同步到BBS
  console.log('3. 同步到BBS...');
  try {
    const resp = await postJSON(SYNC_API, data);
    console.log('   同步结果:', JSON.stringify(resp));
  } catch (e) {
    console.log('   同步失败:', e.message);
  }

  console.log('=== 完成 ===');
}

main();
