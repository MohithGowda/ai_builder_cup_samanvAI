const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const host = '127.0.0.1';
const port = Number(process.env.PORT || 4179);
const root = __dirname;
const allowedOutputs = new Set(['probe.mp4', 'probe.webm', 'samanvai-overview.mp4', 'samanvai-overview.webm', 'samanvai-overview-candidate.mp4']);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${host}:${port}`);
  if (request.method === 'POST' && url.pathname === '/save') {
    const filename = url.searchParams.get('name') || '';
    if (!allowedOutputs.has(filename)) {
      response.writeHead(400).end('Unsupported output name');
      return;
    }
    let size = 0;
    const output = fs.createWriteStream(path.join(root, filename));
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 180 * 1024 * 1024) request.destroy(new Error('Video exceeds 180 MB limit'));
    });
    request.pipe(output);
    output.on('finish', () => {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ filename, size }));
    });
    output.on('error', error => {
      response.writeHead(500).end(error.message);
    });
    return;
  }

  const filename = url.pathname === '/' ? 'recorder.html' : decodeURIComponent(url.pathname.slice(1));
  if (!filename || path.basename(filename) !== filename || filename.includes('..')) {
    response.writeHead(404).end('Not found');
    return;
  }
  const file = path.join(root, filename);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(response);
}).listen(port, host, () => console.log(`Video recorder ready at http://${host}:${port}`));