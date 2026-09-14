// Lightweight static file server for the prebuilt ECCLESIA frontend (dist/).
// See .freebuff/run.md. SPA fallback: unknown paths serve index.html.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const DIST_DIR = path.join(__dirname, 'dist');
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  // API paths have no backend in this static preview — 404 so the app shows
  // its truthful offline state instead of parsing index.html as JSON.
  if (url.startsWith('/api/')) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Backend not running in static preview' }));
    return;
  }
  // Resolve against dist/ only: a request containing .. (raw or %2e%2e%2f
  // encoded) must never escape into the repo, where backend/.env holds secrets.
  let filePath;
  try {
    filePath = path.join(DIST_DIR, decodeURIComponent(url));
  } catch {
    res.statusCode = 400;
    res.end('bad request');
    return;
  }
  const rel = path.relative(DIST_DIR, filePath);
  if (rel === '..' || rel.startsWith('..' + path.sep)) {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html'); // SPA fallback
  }
  res.setHeader('Content-Type', mimeTypes[path.extname(filePath)] || 'application/octet-stream');
  fs.createReadStream(filePath)
    .on('error', () => { res.statusCode = 500; res.end('read error'); })
    .pipe(res);
});

server.listen(PORT, HOST, () => console.log(`Server on http://${HOST}:${PORT}`));
