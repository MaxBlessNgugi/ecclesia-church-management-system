// Lightweight static file server for the prebuilt ECCLESIA frontend (dist/).
// See .freebuff/run.md. SPA fallback: unknown paths serve index.html.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
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
  let filePath = path.join(__dirname, 'dist', url === '/' ? 'index.html' : url);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(__dirname, 'dist', 'index.html'); // SPA fallback
  }
  res.setHeader('Content-Type', mimeTypes[path.extname(filePath)] || 'application/octet-stream');
  fs.createReadStream(filePath)
    .on('error', () => { res.statusCode = 500; res.end('read error'); })
    .pipe(res);
});

server.listen(PORT, HOST, () => console.log(`Server on http://${HOST}:${PORT}`));
