const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = __dirname;
const mediaDirectory = path.join(root, 'media');
const output = path.join(mediaDirectory, 'samanvai-pension-request-journey.gif');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.md': 'text/plain' };
let origin;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, origin);
  if (request.method === 'POST' && url.pathname === '/__journey-capture') {
    if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') {
      response.writeHead(403).end('Same-origin frame capture required');
      return;
    }
    const chunks = [];
    let length = 0;
    request.on('data', chunk => {
      length += chunk.length;
      if (length > 64 * 1024 * 1024) request.destroy();
      else chunks.push(chunk);
    });
    request.on('end', () => {
      fs.mkdirSync(mediaDirectory, { recursive: true });
      const encoder = spawn(process.env.JOURNEY_PYTHON || 'python', [path.join(root, 'export-journey-gif.py'), output]);
      let result = '';
      let errorText = '';
      encoder.stdout.on('data', chunk => { result += chunk; });
      encoder.stderr.on('data', chunk => { errorText += chunk; });
      encoder.stdin.on('error', () => {});
      encoder.on('error', error => {
        if (!response.writableEnded) response.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: error.message }));
      });
      encoder.on('close', code => {
        if (response.writableEnded) return;
        if (code !== 0) response.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: errorText || 'GIF encoding failed' }));
        else {
          console.log(`Saved ${output}: ${result.trim()}`);
          response.writeHead(201, { 'Content-Type': 'application/json' }).end(result.trim());
        }
      });
      encoder.stdin.end(Buffer.concat(chunks));
    });
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  let relative;
  try { relative = decodeURIComponent(url.pathname === '/' ? '/request-flow.html' : url.pathname); }
  catch { response.writeHead(400).end(); return; }
  const filename = path.resolve(root, `.${relative}`);
  if (!filename.startsWith(`${root}${path.sep}`) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    response.writeHead(404).end('Document asset not found');
    return;
  }
  const size = fs.statSync(filename).size;
  let start = 0;
  let end = size - 1;
  let code = 200;
  const headers = { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    if (!match || (!match[1] && !match[2])) { response.writeHead(416).end(); return; }
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
    code = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = end - start + 1;
  response.writeHead(code, headers);
  if (request.method === 'HEAD') response.end();
  else fs.createReadStream(filename, { start, end }).pipe(response);
});

server.listen(0, '127.0.0.1', () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Journey preview: ${origin}/request-flow.html`);
  console.log('The capture endpoint encodes same-origin PNG frames using existing Python/Pillow and writes a fixed GIF under architecture/media.');
  console.log('Stop this local-only preview server when recording is complete.');
});