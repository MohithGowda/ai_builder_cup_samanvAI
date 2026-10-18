const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const documents = ['codebase', 'request-flow'];
let checks = 0;
const logoContext = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'assets', 'logos.generated.js'), 'utf8'), logoContext);
const logos = logoContext.SAMANVAI_LOGOS;

function verify(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function verifySource(file) {
  const resolved = path.resolve(root, file);
  verify(resolved.startsWith(`${root}${path.sep}`), `Source path escapes the repository: ${file}`);
  if (file !== 'backend/data/samanvai.db') verify(fs.statSync(resolved).isFile(), `Missing source file: ${file}`);
}

function verifyLogos(component) {
  verify(Array.isArray(component.logos) && component.logos.length > 0, `Component lacks logos: ${component.id || component.title}`);
  for (const identifier of component.logos) {
    const logo = logos[identifier];
    verify(Boolean(logo), `Unknown logo: ${identifier}`);
    verify(logo.data.startsWith('data:image/svg+xml;base64,'), `Logo is not embedded: ${identifier}`);
    const source = Buffer.from(logo.data.split(',')[1], 'base64').toString('utf8');
    verify(/<svg[\s>]/.test(source), `Invalid logo SVG: ${identifier}`);
    verify(fs.existsSync(path.join(__dirname, 'assets', 'logos', `${identifier}.svg`)), `Local logo missing: ${identifier}`);
  }
}

for (const name of documents) {
  const configPath = path.join(__dirname, 'config', `${name}.config.js`);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(configPath, 'utf8'), context, { filename: configPath });
  const config = context.SAMANVAI_ARCHITECTURE;
  verify(config.id === name, `Wrong document ID: ${name}`);
  const html = fs.readFileSync(path.join(__dirname, `${name}.html`), 'utf8');
  verify(html.includes(`data-document="${name}"`), `HTML/config mismatch: ${name}`);
  verify(!/<(?:script|link)\b[^>]*(?:src|href)="https?:/i.test(html), `External rendering dependency: ${name}`);
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const target = match[1];
    if (!/^https?:/.test(target)) verify(fs.statSync(path.resolve(__dirname, target)).isFile(), `Broken HTML dependency: ${target}`);
  }
  new vm.Script(fs.readFileSync(path.join(__dirname, 'assets', 'architecture.js'), 'utf8'));
  if (config.kind === 'dependency') {
    const nodeIds = new Set(config.nodes.map(node => node.id));
    const fileIds = new Set(config.files.map(file => file.id));
    verify(nodeIds.size === config.nodes.length, 'Duplicate component node ID');
    verify(fileIds.size === config.files.length, 'Duplicate file mapping ID');
    config.files.forEach(file => verifySource(file.path));
    for (const node of config.nodes) {
      verifyLogos(node);
      verify(Boolean(node.label && node.caption), `Missing icon component label: ${node.id}`);
      verify(!node.fileId || fileIds.has(node.fileId), `Unmapped node source: ${node.id}`);
      verify(node.x >= 0 && node.y >= 0 && node.x + node.width <= config.width && node.y + node.height <= config.height, `Out-of-bounds node: ${node.id}`);
    }
    for (const edge of config.edges) {
      verify(nodeIds.has(edge.from) && nodeIds.has(edge.to), `Broken diagram linkage: ${edge.id}`);
      verify(Boolean(edge.path && edge.detail), `Incomplete linkage: ${edge.id}`);
    }
    console.log(`${name}: ${config.nodes.length} nodes, ${config.edges.length} links, ${config.files.length} file mappings`);
  } else {
    const participantIds = new Set(config.participants.map(participant => participant.id));
    config.participants.forEach(verifyLogos);
    config.stack.forEach(verifyLogos);
    verify(participantIds.size === config.participants.length, 'Duplicate sequence participant');
    let previousY = 0;
    config.steps.forEach((step, index) => {
      verify(step.id === index + 1, 'Sequence stage numbers are not consecutive');
      verify(participantIds.has(step.from) && participantIds.has(step.to), `Unknown participant at stage ${step.id}`);
      verify(step.y > previousY && step.y < config.height - 45, `Sequence stage out of order/bounds: ${step.id}`);
      previousY = step.y;
      step.files.forEach(verifySource);
    });
    for (const signal of config.telemetry) signal.files.forEach(verifySource);
    console.log(`${name}: ${config.participants.length} lanes, ${config.steps.length} stages, ${config.telemetry.length} telemetry categories`);
  }
  for (const note of config.notes) if (note.file) verifySource(note.file);
}
const targetHtml = fs.readFileSync(path.join(__dirname, 'cloud-run-target.html'), 'utf8');
verify(targetHtml.includes('data-document="cloud-run-target"'), 'Cloud Run target document ID is missing');
verify(targetHtml.includes('Proposed, not deployed'), 'Cloud Run target must be labeled as proposed');
verify(targetHtml.includes('Cloud Run is not Kubernetes'), 'Cloud Run and Kubernetes boundary is missing');
verify(targetHtml.includes('Workload Identity'), 'GitLab workload identity path is missing');
verify(targetHtml.includes('Artifact Registry'), 'Container registry path is missing');
verify(targetHtml.includes('MICROFRONTENDS'), 'Microfrontend target boundary is missing');
verify(targetHtml.includes('PROPOSED FUTURE / GOOGLE CLOUD RUN SERVICE BOUNDARIES'), 'Cloud Run service boundary is missing');
for (const match of targetHtml.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const target = match[1];
  if (!/^https?:/.test(target)) verify(fs.statSync(path.resolve(__dirname, target)).isFile(), `Broken target-architecture dependency: ${target}`);
}
verify(!/<(?:script|link)\b[^>]*(?:src|href)="https?:/i.test(targetHtml), 'External target-architecture dependency');
console.log('cloud-run-target: proposed GitLab, microfrontend and Cloud Run topology');
const journeyContext = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'config', 'journey.config.js'), 'utf8'), journeyContext);
const journey = journeyContext.SAMANVAI_JOURNEY;
const journeyNodes = new Set(journey.nodes.map(node => node.id));
verify(journeyNodes.size === journey.nodes.length, 'Duplicate animated journey component');
verify(journey.stepSeconds > 0, 'Invalid animated stage duration');
for (const node of journey.nodes) {
  verify(Boolean(logos[node.logo]), `Unknown journey logo: ${node.logo}`);
  verify(node.x > 0 && node.x < journey.width && node.y > 0 && node.y < journey.height, `Out-of-bounds journey node: ${node.id}`);
}
for (const stage of journey.stages) {
  verify(journeyNodes.has(stage.from) && journeyNodes.has(stage.to), `Broken animated journey step: ${stage.title}`);
  verify(stage.sequence.every(identifier => identifier >= 1 && identifier <= 32), `Unknown source sequence in ${stage.title}`);
}
new vm.Script(fs.readFileSync(path.join(__dirname, 'assets', 'journey.js'), 'utf8'));
const animation = fs.readFileSync(path.join(__dirname, 'media', 'samanvai-pension-request-journey.gif'));
verify(['GIF89a', 'GIF87a'].includes(animation.subarray(0, 6).toString('ascii')), 'Invalid saved GIF header');
verify(animation.length > 10000, 'Saved journey animation is unexpectedly small');
console.log(`journey: ${journey.nodes.length} components, ${journey.stages.length} scenes, ${(journey.stages.length * journey.stepSeconds).toFixed(1)} seconds playback`);
console.log(`Passed ${checks} architecture consistency checks.`);