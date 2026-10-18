(() => {
  'use strict';
  const config = globalThis.SAMANVAI_JOURNEY;
  const canvas = document.getElementById('journey-canvas');
  if (!config || !canvas) return;
  const context = canvas.getContext('2d');
  const nodes = new Map(config.nodes.map(node => [node.id, node]));
  const images = new Map();
  const duration = config.stages.length * config.stepSeconds;
  const slider = document.getElementById('journey-progress');
  const playButton = document.getElementById('journey-play');
  const status = document.getElementById('journey-status');
  let elapsed = 0;
  let playing = false;
  let speed = 1;
  let previous = 0;
  let capturing = false;
  let lastStage = -1;

  function text(content, x, y, size, color = '#294b3d', align = 'left', weight = 400) {
    context.fillStyle = color;
    context.font = `${weight} ${size}px "Trebuchet MS", sans-serif`;
    context.textAlign = align;
    context.fillText(content, x, y);
  }

  function lines(content, x, y, maxWidth, size, color, lineHeight = 25) {
    context.font = `400 ${size}px "Trebuchet MS", sans-serif`;
    let current = '';
    let lineY = y;
    for (const word of content.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (context.measureText(candidate).width > maxWidth && current) {
        text(current, x, lineY, size, color);
        lineY += lineHeight;
        current = word;
      } else current = candidate;
    }
    text(current, x, lineY, size, color);
  }

  function logo(identifier, x, y, size, opacity = 1) {
    const image = images.get(identifier);
    if (!image) return;
    const ratio = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    context.save();
    context.globalAlpha = opacity;
    context.drawImage(image, x - image.naturalWidth * ratio / 2, y - image.naturalHeight * ratio / 2, image.naturalWidth * ratio, image.naturalHeight * ratio);
    context.restore();
  }

  function curve(from, to) {
    if (from.id === to.id) return [{ x: from.x, y: from.y - 50 }, { x: from.x - 85, y: from.y - 145 }, { x: from.x + 85, y: from.y - 145 }, { x: from.x + 1, y: from.y - 50 }];
    const lower = from.y !== to.y;
    const bend = lower ? (from.y + to.y) / 2 : from.y - 100;
    return [from, { x: from.x, y: bend }, { x: to.x, y: bend }, to];
  }

  function point(points, progress) {
    const inverse = 1 - progress;
    return {
      x: inverse ** 3 * points[0].x + 3 * inverse ** 2 * progress * points[1].x + 3 * inverse * progress ** 2 * points[2].x + progress ** 3 * points[3].x,
      y: inverse ** 3 * points[0].y + 3 * inverse ** 2 * progress * points[1].y + 3 * inverse * progress ** 2 * points[2].y + progress ** 3 * points[3].y,
    };
  }

  function path(points, color, width, dash = []) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    context.bezierCurveTo(points[1].x, points[1].y, points[2].x, points[2].y, points[3].x, points[3].y);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.setLineDash(dash);
    context.stroke();
    context.setLineDash([]);
  }

  function render() {
    const stageIndex = Math.min(config.stages.length - 1, Math.floor(elapsed / config.stepSeconds));
    const stage = config.stages[stageIndex];
    const progress = Math.min(1, (elapsed - stageIndex * config.stepSeconds) / config.stepSeconds);
    const color = stage.action ? '#bb823a' : stage.response ? '#3b83a4' : '#2f8062';
    context.clearRect(0, 0, config.width, config.height);
    context.fillStyle = '#fbfcf9';
    context.fillRect(0, 0, config.width, config.height);
    text('SAMANVAI  /  A REQUEST IN MOTION', 46, 46, 13, '#6c8a74', 'left', 700);
    text('A pension request. From waiting to action.', 46, 92, 33, '#244b39', 'left', 700);
    text(`${config.caseId}  /  Illustrative replay  /  Synthetic data  /  No live API calls`, 46, 126, 15, '#7b8c76');
    text('APPLICATION COMPONENTS', 46, 175, 11, '#82917b', 'left', 700);
    context.fillStyle = '#eef3e7';
    context.fillRect(46, 398, config.width - 92, 204);
    text('INSIDE THE LANGGRAPH WORKFLOW  /  SIX SPECIALISTS IN ONE API PROCESS', 66, 430, 11, '#799267', 'left', 700);
    const upper = config.nodes.slice(0, 6);
    const lower = config.nodes.slice(6);
    for (const row of [upper, lower]) {
      for (let index = 0; index < row.length - 1; index += 1) path([row[index], { x: row[index].x + 70, y: row[index].y }, { x: row[index + 1].x - 70, y: row[index + 1].y }, row[index + 1]], '#d9e4d2', 1.5, [3, 6]);
    }
    const visited = new Set(config.stages.slice(0, stageIndex).flatMap(item => [item.from, item.to]));
    for (const node of config.nodes) {
      const active = node.id === stage.from || node.id === stage.to;
      context.beginPath();
      context.arc(node.x, node.y, active ? 45 : 39, 0, Math.PI * 2);
      context.fillStyle = active ? '#ffffff' : '#fbfcf9';
      context.fill();
      context.strokeStyle = active ? color : visited.has(node.id) ? '#adc7a2' : '#dce5d5';
      context.lineWidth = active ? 2.5 : 1;
      context.stroke();
      logo(node.logo, node.x, node.y, 47, active || visited.has(node.id) ? 1 : 0.58);
      text(node.title, node.x, node.y + 68, 16, active ? '#365a40' : '#71866a', 'center', active ? 700 : 400);
      text(node.subtitle, node.x, node.y + 91, 11.5, '#8b9980', 'center');
    }
    const movement = curve(nodes.get(stage.from), nodes.get(stage.to));
    path(movement, `${color}55`, 2, [5, 5]);
    const location = point(movement, 0.06 + progress * 0.88);
    context.beginPath();
    context.arc(location.x, location.y, 15, 0, Math.PI * 2);
    context.fillStyle = `${color}18`;
    context.fill();
    context.beginPath();
    context.arc(location.x, location.y, 6.5, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.beginPath();
    context.moveTo(46, 646);
    context.lineTo(config.width - 46, 646);
    context.strokeStyle = '#dce5d5';
    context.lineWidth = 1;
    context.stroke();
    text(`${String(stageIndex + 1).padStart(2, '0')} / ${config.stages.length}   ${stage.phase}`, 46, 680, 12, color, 'left', 700);
    text(stage.title, 46, 725, 29, '#2e513e', 'left', 700);
    lines(stage.detail, 46, 763, config.width - 135, 17, '#7b8d71');
    text('Animated explanation, not measured latency or production telemetry. No external officer notification is delivered.', 46, 835, 11, '#8a987f');
    text(`${elapsed.toFixed(1)}s / ${duration.toFixed(1)}s playback`, config.width - 46, 46, 12, '#809174', 'right');
    slider.value = String(elapsed);
    document.getElementById('journey-time').textContent = `${elapsed.toFixed(1)} / ${duration.toFixed(1)} s`;
    if (lastStage !== stageIndex) {
      status.textContent = `${stageIndex + 1} of ${config.stages.length}: ${stage.title}`;
      lastStage = stageIndex;
    }
  }

  function setPlaying(value) {
    playing = value;
    playButton.innerHTML = value ? '&#10074;&#10074;' : '&#9654;';
    playButton.setAttribute('aria-label', value ? 'Pause journey' : 'Play journey');
    playButton.title = value ? 'Pause journey' : 'Play journey';
  }

  function tick(timestamp) {
    if (previous && playing) elapsed = Math.min(duration, elapsed + Math.min(0.1, (timestamp - previous) / 1000) * speed);
    previous = timestamp;
    if (elapsed >= duration) setPlaying(false);
    render();
    requestAnimationFrame(tick);
  }

  async function captureFrames() {
    if (capturing) throw new Error('A capture is already in progress.');
    if (location.protocol === 'file:') throw new Error('Use the local export helper to regenerate the saved GIF.');
    capturing = true;
    setPlaying(false);
    const controls = document.querySelectorAll('.journey-controls button, .journey-controls select, .journey-controls input');
    controls.forEach(control => { control.disabled = true; });
    try {
      const output = document.createElement('canvas');
      output.width = 960;
      output.height = Math.round(960 * config.height / config.width);
      const outputContext = output.getContext('2d');
      const frames = [];
      const frameCount = Math.round(duration * 5);
      for (let index = 0; index < frameCount; index += 1) {
        elapsed = index / (frameCount - 1) * duration;
        render();
        outputContext.drawImage(canvas, 0, 0, output.width, output.height);
        frames.push(output.toDataURL('image/png'));
        if (index % 8 === 0) {
          document.getElementById('journey-export-status').textContent = `Capturing GIF frame ${index + 1} of ${frameCount}...`;
          await new Promise(requestAnimationFrame);
        }
      }
      const response = await fetch('/__journey-capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frames }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'GIF export failed.');
      document.getElementById('journey-export-status').textContent = `Saved looping GIF: ${result.frames} frames, ${result.duration} seconds.`;
      return result;
    } finally {
      capturing = false;
      controls.forEach(control => { control.disabled = false; });
    }
  }

  async function initialize() {
    for (const identifier of new Set(config.nodes.map(node => node.logo))) {
      const image = new Image();
      image.src = globalThis.SAMANVAI_LOGOS[identifier].data;
      await image.decode();
      images.set(identifier, image);
    }
    slider.max = String(duration);
    playButton.addEventListener('click', () => { if (elapsed >= duration) elapsed = 0; setPlaying(!playing); });
    slider.addEventListener('input', () => { elapsed = Number(slider.value); setPlaying(false); render(); });
    document.getElementById('journey-restart').addEventListener('click', () => { elapsed = 0; setPlaying(true); });
    document.getElementById('journey-speed').addEventListener('change', event => { speed = Number(event.target.value); });
    globalThis.SAMANVAI_JOURNEY_PLAYER = {
      captureFrames,
      seek(seconds) { elapsed = Math.max(0, Math.min(duration, seconds)); setPlaying(false); render(); },
      state() { return { elapsed, playing, duration, capturing }; },
    };
    render();
    canvas.dataset.ready = 'true';
    requestAnimationFrame(tick);
  }
  void initialize().catch(error => { status.textContent = `Animation unavailable: ${error.message}`; });
})();