const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const lucide = require('lucide-react');
const manifest = require('./config/logos.config.cjs');

async function build() {
  const directory = path.join(__dirname, 'assets', 'logos');
  fs.mkdirSync(directory, { recursive: true });
  const registry = {};
  for (const brand of manifest.brands) {
    const filename = path.join(directory, `${brand.id}.svg`);
    let source;
    if (fs.existsSync(filename)) source = fs.readFileSync(filename, 'utf8');
    else {
      const response = await fetch(brand.url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`${brand.name}: HTTP ${response.status}`);
      source = await response.text();
      if (!/<svg[\s>]/i.test(source) || /<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/)/i.test(source)) throw new Error(`Unexpected SVG content: ${brand.name}`);
      fs.writeFileSync(filename, source);
    }
    registry[brand.id] = { name: brand.name, source: brand.url, kind: 'brand', data: `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}` };
    console.log(`Brand logo: ${brand.name}`);
  }
  for (const component of manifest.components) {
    const Icon = lucide[component.icon];
    if (!Icon) throw new Error(`Unknown Lucide icon: ${component.icon}`);
    const source = renderToStaticMarkup(React.createElement(Icon, { size: 64, strokeWidth: 1.6, color: component.color }));
    fs.writeFileSync(path.join(directory, `${component.id}.svg`), source);
    registry[component.id] = { name: component.name, source: `Lucide ${component.icon}`, kind: 'component', data: `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}` };
  }
  const output = `globalThis.SAMANVAI_LOGOS = ${JSON.stringify(registry, null, 2)};\n`;
  fs.writeFileSync(path.join(__dirname, 'assets', 'logos.generated.js'), output);
  console.log(`Generated ${Object.keys(registry).length} offline logo assets and the embedded export registry.`);
}

build().catch(error => { console.error(error.message); process.exitCode = 1; });