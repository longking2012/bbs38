'use strict';
// 独立文件上传服务 - 端口 1145
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 1145;
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads_1145');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // GET / - 状态页
  if (req.method === 'GET' && u.pathname === '/') {
    const files = fs.readdirSync(UPLOAD_DIR).filter(f => fs.statSync(path.join(UPLOAD_DIR, f)).isFile());
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>文件上传 - 端口1145</title>
<style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:20px}input,button{padding:10px;font-size:16px}#result{margin-top:20px;padding:15px;background:#f0f0f0;border-radius:8px}#files{margin-top:20px}</style></head>
<body>
<h1>📁 文件上传服务 (端口1145)</h1>
<p>状态: <b style="color:green">运行中</b></p>
<hr>
<form id="uploadForm">
  <input type="file" id="file" required style="width:100%"><br><br>
  <button type="submit" style="padding:12px 30px">上传文件</button>
</form>
<div id="result"></div>
<h2>已上传文件</h2>
<div id="files">${files.map(f => `<div>${f} (${fs.statSync(path.join(UPLOAD_DIR, f)).size} bytes)</div>`).join('') || '<p>暂无文件</p>'}</div>
<script>
document.getElementById('uploadForm').onsubmit = async function(e) {
  e.preventDefault();
  const file = document.getElementById('file').files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/upload', { method: 'POST', body: formData });
  const data = await res.json();
  document.getElementById('result').innerHTML = data.url ? '<b style="color:green">上传成功!</b> ' + data.url : '<b style="color:red">失败:</b> ' + data.error;
  if (data.url) location.reload();
};
</script>
</body></html>`);
    return;
  }
  
  // GET /files/:name - 下载文件
  if (req.method === 'GET' && u.pathname.startsWith('/files/')) {
    const fname = decodeURIComponent(u.pathname.slice(7));
    const fpath = path.join(UPLOAD_DIR, path.basename(fname));
    if (!fs.existsSync(fpath)) {
      res.writeHead(404);
      res.end('文件不存在');
      return;
    }
    const buf = fs.readFileSync(fpath);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${fname}"` });
    res.end(buf);
    return;
  }
  
  // POST /upload - 接收上传
  if (req.method === 'POST' && u.pathname === '/upload') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      // 解析 multipart
      const ct = req.headers['content-type'] || '';
      const bm = ct.match(/boundary=([^;\r\n]+)/);
      if (!bm) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '需要 multipart/form-data' }));
        return;
      }
      const bd = '--' + bm[1].trim();
      const bdBuf = Buffer.from(bd);
      // 查找所有边界位置
      const positions = [];
      for (let i = 0; i <= buf.length - bdBuf.length; i++) {
        if (buf.compare(bdBuf, 0, bdBuf.length, i, i + bdBuf.length) === 0) {
          positions.push(i);
        }
      }
      for (let p = 0; p < positions.length - 1; p++) {
        const start = positions[p] + bdBuf.length;
        const end = positions[p + 1];
        const part = buf.slice(start, end);
        // 跳过开头的 \r\n
        let headerStart = 0;
        if (part[0] === 0x0d && part[1] === 0x0a) headerStart = 2;
        // 找 header 结束 \r\n\r\n
        const headerEndIdx = part.indexOf('\r\n\r\n', headerStart);
        if (headerEndIdx < 0) continue;
        const header = part.slice(headerStart, headerEndIdx).toString('utf8');
        let bodyStart = headerEndIdx + 4;
        // 去掉结尾的 \r\n
        let bodyEnd = part.length;
        if (part[bodyEnd - 2] === 0x0d && part[bodyEnd - 1] === 0x0a) bodyEnd -= 2;
        const body = part.slice(bodyStart, bodyEnd);
        // 解析 filename
        const fnMatch = header.match(/filename="([^"]*)"/);
        if (!fnMatch || !body.length) continue;
        const origName = fnMatch[1];
        const ext = path.extname(origName).toLowerCase();
        const safeName = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
        const fpath = path.join(UPLOAD_DIR, safeName);
        fs.writeFileSync(fpath, body);
        const url = `http://localhost:${PORT}/files/${safeName}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, url, filename: safeName, originalName: origName, size: body.length }));
        return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '没有找到文件' }));
    });
    return;
  }
  
  // 404
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('  文件上传服务已启动');
  console.log('  地址: http://localhost:' + PORT);
  console.log('  上传: POST /upload (multipart/form-data)');
  console.log('  下载: GET /files/<文件名>');
  console.log('  保存: ' + UPLOAD_DIR);
  console.log('========================================');
  console.log('');
});
