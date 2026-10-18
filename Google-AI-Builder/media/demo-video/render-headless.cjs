const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const mode = process.argv[2] === 'probe' ? 'probe' : 'record';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'samanvai-video-chrome-'));
const targetUrl = `http://127.0.0.1:4179/${mode === 'probe' ? '?format=mp4' : ''}`;
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-breakpad', '--disable-crash-reporter',
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=0', '--window-size=1280,720', `--user-data-dir=${profile}`, targetUrl,
], { stdio: ['ignore', 'pipe', 'pipe'] });

let output = '';
for (const stream of [chrome.stdout, chrome.stderr]) stream.on('data', chunk => { output += chunk.toString() });

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForDebugPort() {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const match = output.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) return Number(match[1]);
    if (chrome.exitCode !== null) throw new Error(`Chrome exited early: ${output}`);
    await delay(200);
  }
  throw new Error(`Chrome DevTools did not start: ${output}`);
}

async function findPage(port) {
  const start = Date.now();
  while (Date.now() - start < 20000) {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    const page = targets.find(target => target.type === 'page' && target.url.startsWith('http://127.0.0.1:4179/'));
    if (page) return page;
    await delay(200);
  }
  throw new Error('Recorder page did not open');
}

async function runPage() {
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found at ${chromePath}`);
  const port = await waitForDebugPort();
  const page = await findPage(port);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  let messageId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  try {
    await command('Page.enable');
    await command('Runtime.enable');
    const loaded = new Promise((resolve, reject) => {
      const onMessage = event => {
        const message = JSON.parse(event.data);
        if (message.method === 'Page.loadEventFired') {
          socket.removeEventListener('message', onMessage);
          resolve();
        }
      };
      socket.addEventListener('message', onMessage);
      setTimeout(() => {
        socket.removeEventListener('message', onMessage);
        reject(new Error('Recorder page did not finish loading'));
      }, 20000);
    });
    await command('Page.navigate', { url: targetUrl });
    await loaded;
    await evaluate("new Promise(resolve => { if (document.readyState === 'complete') resolve(true); else addEventListener('load', () => resolve(true), {once:true}) })");
    await evaluate(`new Promise((resolve,reject) => { const started=Date.now(); const poll=()=>{ if(document.querySelector('#${mode}') || document.querySelector('#record')) resolve(true); else if(Date.now()-started>20000) reject(new Error('Recorder controls did not load')); else setTimeout(poll,100) }; poll() })`);
    const button = mode === 'probe' ? 'probe' : 'record';
    await evaluate(`document.querySelector('#${button}').click()`);
    const start = Date.now();
    let status = '';
    while (Date.now() - start < 210000) {
      status = await evaluate("document.querySelector('#status')?.textContent || ''");
      console.log(status);
      if (status.startsWith('Saved ')) return { status, visibility: await evaluate('document.visibilityState') };
      if (status.includes(' failed:')) throw new Error(status);
      await delay(3000);
    }
    throw new Error(`Timed out waiting for render: ${status}`);
  } finally {
    socket.close();
    chrome.kill();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

runPage().then(result => {
  console.log(JSON.stringify(result));
  if (mode === 'record') {
    const finalVideo = path.join(__dirname, 'samanvai-overview.mp4');
    const correctedVideo = path.join(__dirname, 'samanvai-overview-candidate.mp4');
    const rawVideo = path.join(__dirname, 'samanvai-overview-raw.mp4');
    execFileSync(process.execPath, [path.join(__dirname, 'fix-mp4-duration.cjs')], { stdio: 'inherit' });
    fs.renameSync(finalVideo, rawVideo);
    fs.renameSync(correctedVideo, finalVideo);
    fs.rmSync(rawVideo, { force: true });
    console.log('Installed the duration-indexed MP4 at media/demo-video/samanvai-overview.mp4');
  }
}).catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});