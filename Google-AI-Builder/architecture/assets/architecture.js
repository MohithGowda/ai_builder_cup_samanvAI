(() => {
  'use strict';
  const config = globalThis.SAMANVAI_ARCHITECTURE;
  const logos = globalThis.SAMANVAI_LOGOS || {};
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const palette = {
    green: { fill: '#eff6ef', stroke: '#a9c9ae', ink: '#285f43' },
    blue: { fill: '#eef5fa', stroke: '#adc9d8', ink: '#315f7d' },
    amber: { fill: '#fcf5e9', stroke: '#ddc39a', ink: '#916c37' },
    neutral: { fill: '#f7f8f4', stroke: '#cbd5c5', ink: '#56694c' },
  };
  const status = document.getElementById('diagram-status');
  if (!config || config.id !== document.body.dataset.document) {
    status.textContent = 'The local configuration could not be loaded. Keep the HTML, assets, and config folders together.';
    status.setAttribute('role', 'alert');
    return;
  }

  function element(tag, attributes = {}, text) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgElement(tag, attributes = {}, text) {
    const node = document.createElementNS(svgNamespace, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function wrap(text, maxCharacters) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      if (line && `${line} ${word}`.length > maxCharacters) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines;
  }

  function svgText(parent, text, x, y, options = {}) {
    const { width = 220, size = 13, color = '#60735b', weight = 400, anchor = 'start', lineHeight = 19 } = options;
    const node = svgElement('text', { x, y, fill: color, 'font-size': size, 'font-weight': weight, 'text-anchor': anchor });
    const lines = Array.isArray(text) ? text : wrap(text, Math.max(10, Math.floor(width / (size * 0.55))));
    lines.forEach((line, index) => node.append(svgElement('tspan', { x, dy: index === 0 ? 0 : lineHeight }, line)));
    parent.append(node);
    return node;
  }

  const svg = svgElement('svg', {
    xmlns: svgNamespace, viewBox: `0 0 ${config.width} ${config.height}`,
    role: 'img', 'aria-labelledby': 'svg-title svg-description',
    'font-family': 'Trebuchet MS, sans-serif',
  });
  svg.append(svgElement('title', { id: 'svg-title' }, config.title));
  svg.append(svgElement('desc', { id: 'svg-description' }, config.description));
  svg.append(svgElement('rect', { width: config.width, height: config.height, fill: '#ffffff' }));
  const definitions = svgElement('defs');
  for (const [name, tone] of Object.entries(palette)) {
    const marker = svgElement('marker', { id: `arrow-${name}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: tone.ink }));
    definitions.append(marker);
  }
  svg.append(definitions);

  function drawLogos(parent, identifiers, centerX, top, size) {
    const gap = 12;
    const totalWidth = identifiers.length * size + (identifiers.length - 1) * gap;
    identifiers.forEach((identifier, index) => {
      const logo = logos[identifier];
      if (!logo) throw new Error(`Missing architecture logo: ${identifier}`);
      const position = centerX - totalWidth / 2 + index * (size + gap);
      const image = svgElement('image', {
        href: logo.data, x: position, y: top, width: size, height: size,
        preserveAspectRatio: 'xMidYMid meet', 'data-logo': identifier,
        role: 'img', 'aria-label': logo.name,
      });
      image.append(svgElement('title', {}, logo.name));
      parent.append(image);
    });
  }

  function drawNode(node) {
    const tone = palette[node.tone || 'green'];
    const group = node.fileId ? svgElement('a', { href: `#file-${node.fileId}`, 'aria-label': `${node.title}: view file mapping` }) : svgElement('g');
    group.setAttribute('data-node', node.id);
    group.append(svgElement('title', {}, `${node.title}. ${node.lines.join('. ')}`));
    group.append(svgElement('rect', { x: node.x, y: node.y, width: node.width, height: node.height, rx: 6, fill: '#ffffff', 'fill-opacity': 0.01, stroke: 'none' }));
    const compact = node.height < 90;
    const size = compact ? 30 : node.height < 110 ? 40 : 52;
    const centerX = node.x + node.width / 2;
    const iconTop = node.y + (compact ? 0 : 5);
    drawLogos(group, node.logos, centerX, iconTop, size);
    const labelY = iconTop + size + (compact ? 16 : 23);
    svgText(group, node.label, centerX, labelY, { size: compact ? 13 : 16, color: tone.ink, weight: 700, anchor: 'middle', width: node.width - 15 });
    svgText(group, node.caption, centerX, labelY + 19, { size: 10.5, color: '#728268', anchor: 'middle', width: node.width - 12, lineHeight: 14 });
    if (node.optional) {
      group.append(svgElement('rect', { x: node.x + node.width - 72, y: node.y + 2, width: 67, height: 20, rx: 4, fill: '#fcf5e9', stroke: '#ddc39a', 'stroke-dasharray': '3 3' }));
      svgText(group, 'OPTIONAL', node.x + node.width - 38, node.y + 16, { size: 8, color: '#916c37', weight: 700, anchor: 'middle' });
    }
    svg.append(group);
  }

  function drawDependency() {
    for (const group of config.groups) {
      svg.append(svgElement('rect', { x: group.x, y: group.y, width: group.width, height: group.height, rx: 8, fill: '#fafcf8', stroke: '#dfe8da' }));
      svgText(svg, group.title, group.x + 18, group.y + 30, { size: 11, color: '#7d9271', weight: 700, width: group.width - 30 });
    }
    for (const edge of config.edges) {
      const tone = palette[edge.tone || 'green'];
      svg.append(svgElement('path', { d: edge.path, fill: 'none', stroke: tone.stroke, 'stroke-width': 1.8, 'marker-end': `url(#arrow-${edge.tone || 'green'})`, ...(edge.optional ? { 'stroke-dasharray': '5 5' } : {}) }));
      svg.append(svgElement('rect', { x: edge.labelX - 14, y: edge.labelY - 13, width: 28, height: 23, rx: 4, fill: '#fff', stroke: tone.stroke }));
      svgText(svg, edge.id, edge.labelX, edge.labelY + 3, { size: 10, color: tone.ink, weight: 700, anchor: 'middle' });
    }
    config.nodes.forEach(drawNode);
    svgText(svg, 'Numbers identify dependencies, not request order. Optional services are not active unless configured.', 32, config.height - 23, { size: 12, width: config.width - 50 });
  }

  function drawSequence() {
    const participants = new Map(config.participants.map(participant => [participant.id, participant]));
    for (const participant of config.participants) {
      const tone = palette[participant.tone || 'green'];
      svg.append(svgElement('line', { x1: participant.x, y1: 180, x2: participant.x, y2: config.height - 45, stroke: '#d8e2d1', 'stroke-dasharray': '4 7' }));
      const iconSize = participant.logos.length > 2 ? 40 : participant.logos.length > 1 ? 48 : 62;
      drawLogos(svg, participant.logos, participant.x, 36, iconSize);
      svgText(svg, participant.title, participant.x, 123, { size: 14, color: tone.ink, weight: 700, anchor: 'middle', width: 190 });
      svgText(svg, participant.subtitle, participant.x, 149, { size: 10.5, color: '#75856a', anchor: 'middle', width: 185, lineHeight: 15 });
      svg.append(svgElement('line', { x1: participant.x - 68, y1: 177, x2: participant.x + 68, y2: 177, stroke: tone.stroke, 'stroke-width': 2 }));
    }
    for (const phase of config.phases) {
      svg.append(svgElement('rect', { x: 18, y: phase.y, width: config.width - 36, height: 32, rx: 3, fill: '#edf3e7', opacity: 0.96 }));
      svgText(svg, phase.title, 32, phase.y + 21, { size: 11, color: '#6f865e', weight: 700, width: config.width - 60 });
    }
    for (const step of config.steps) {
      const source = participants.get(step.from);
      const target = participants.get(step.to);
      const color = step.optional ? 'amber' : step.return ? 'blue' : 'green';
      const tone = palette[color];
      const attributes = { fill: 'none', stroke: tone.ink, 'stroke-width': 1.5, 'marker-end': `url(#arrow-${color})`, ...(step.optional || step.return ? { 'stroke-dasharray': '5 4' } : {}) };
      const group = svgElement('g', { 'data-step': step.id });
      group.append(svgElement('title', {}, `${step.id}. ${source.title} to ${target.title}: ${step.label}. ${step.detail}`));
      if (source.id === target.id) {
        group.append(svgElement('path', { ...attributes, d: `M ${source.x} ${step.y} h 35 v 30 h -35` }));
        svgText(group, `${step.id}. ${step.label}`, source.x + 45, step.y + 1, { width: 185, size: 12, lineHeight: 17, color: tone.ink });
      } else {
        group.append(svgElement('line', { ...attributes, x1: source.x, y1: step.y, x2: target.x, y2: step.y }));
        svgText(group, `${step.id}. ${step.label}`, (source.x + target.x) / 2, step.y - 25, { width: Math.max(170, Math.abs(source.x - target.x) - 20), size: 12, lineHeight: 16, color: tone.ink, anchor: 'middle' });
      }
      svg.append(group);
    }
    svgText(svg, 'Business outcome entries are not distributed tracing spans. Dashed blue = return; dashed amber = conditional call or return.', 32, config.height - 17, { size: 12, width: config.width - 55 });
  }

  function cell(text, attributes) { return element('td', attributes || {}, text); }
  function sourceCell(files) {
    const node = cell();
    files.forEach((file, index) => {
      if (index) node.append(element('br'));
      node.append(element('a', { href: `../${file}`, class: 'file-link' }, file));
    });
    return node;
  }
  function appendRows(targetId, rows, builder) {
    const target = document.getElementById(targetId);
    if (target) rows.forEach(row => target.append(builder(row)));
  }

  if (config.kind === 'dependency') {
    drawDependency();
    const nodes = new Map(config.nodes.map(node => [node.id, node]));
    appendRows('connection-rows', config.edges, edge => {
      const row = element('tr');
      row.append(cell(edge.id), cell(nodes.get(edge.from).title), cell(nodes.get(edge.to).title), cell(edge.detail));
      return row;
    });
    appendRows('file-rows', config.files, file => {
      const row = element('tr', { id: `file-${file.id}` });
      row.append(sourceCell([file.path]), cell(file.module), cell(file.provides), cell(file.uses));
      return row;
    });
    const filter = document.getElementById('file-filter');
    function updateFiles() {
      const query = filter.value.toLowerCase().trim();
      let count = 0;
      for (const row of document.querySelectorAll('#file-rows tr')) {
        row.hidden = !row.textContent.toLowerCase().includes(query);
        if (!row.hidden) count += 1;
      }
      document.getElementById('file-count').textContent = `${count} of ${config.files.length} file mappings shown`;
    }
    filter.addEventListener('input', updateFiles);
    updateFiles();
  } else {
    drawSequence();
    const participants = new Map(config.participants.map(participant => [participant.id, participant]));
    appendRows('stage-rows', config.steps, step => {
      const row = element('tr', { id: `stage-${step.id}` });
      const processing = cell();
      processing.append(element('strong', {}, step.label), document.createTextNode(step.detail));
      row.append(cell(String(step.id).padStart(2, '0')), cell(`${participants.get(step.from).title} > ${participants.get(step.to).title}`), processing, sourceCell(step.files));
      return row;
    });
    appendRows('telemetry-rows', config.telemetry, signal => {
      const row = element('tr');
      const origin = cell(signal.origin);
      for (const file of signal.files) origin.append(element('br'), element('a', { href: `../${file}`, class: 'file-link' }, file));
      row.append(cell(signal.name), origin, cell(signal.fields), cell(signal.limitations));
      return row;
    });
    appendRows('variant-rows', config.variants, variant => {
      const row = element('tr');
      row.append(cell(variant.endpoint), cell(variant.path), cell(variant.result));
      return row;
    });
    const stack = document.getElementById('stack-chain');
    config.stack.forEach((item, index) => {
      const node = element('li');
      const logoRow = element('div', { class: 'stack-logos' });
      for (const identifier of item.logos) {
        const logo = logos[identifier];
        logoRow.append(element('img', { src: logo.data, alt: logo.name, width: 40, height: 40 }));
      }
      node.append(logoRow);
      node.append(element('span', { class: 'stack-number' }, `0${index + 1}`), element('strong', {}, item.title), element('p', {}, item.detail));
      if (item.note) node.append(element('span', { class: 'tag' }, item.note));
      stack.append(node);
    });
  }
  document.getElementById('diagram').append(svg);
  appendRows('notes', config.notes, note => {
    const article = element('article', { class: 'note-item' });
    article.append(element('h3', {}, note.title), element('p', {}, note.text));
    if (note.file) article.append(element('a', { href: `../${note.file}` }, note.file));
    return article;
  });

  let zoom = 100;
  const canvas = document.getElementById('diagram');
  function setZoom(value) {
    zoom = Math.max(50, Math.min(250, value));
    canvas.style.width = `${zoom}%`;
    document.getElementById('zoom-level').textContent = `${zoom}%`;
    document.querySelector('[data-action="zoom-out"]').disabled = zoom === 50;
    document.querySelector('[data-action="zoom-in"]').disabled = zoom === 250;
  }
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'zoom-in') setZoom(zoom + 25);
    if (action === 'zoom-out') setZoom(zoom - 25);
    if (action === 'fit') {
      setZoom(100);
      document.getElementById('diagram-viewport').scrollTo({ left: 0, top: 0 });
    }
    if (action === 'print') globalThis.print();
    if (action === 'download') {
      const serialized = new XMLSerializer().serializeToString(svg);
      const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }));
      const link = element('a', { href: url, download: `samanvai-${config.id}-architecture.svg` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }));
  status.textContent = config.kind === 'dependency'
    ? `${config.nodes.length} component nodes / ${config.edges.length} mapped connections / ${config.files.length} source and configuration files. Local SVG, no external renderer.`
    : `${config.participants.length} component lanes / ${config.steps.length} request and response stages / ${config.telemetry.length} telemetry categories. This is a design sequence, not measured execution data.`;
  document.body.dataset.ready = 'true';
})();