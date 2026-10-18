# Architecture Atlas

Open these HTML files directly in a browser. No server, npm install, CDN, credentials, or application changes are required.

- [Codebase architecture](codebase.html): file/module dependency diagram, numbered link register, and source/configuration/test mappings.
- [Request and telemetry architecture](request-flow.html): technology stack, request/response sequence, six-agent execution, persistence, error paths, telemetry inventory, and other API paths.
- [Cloud Run target architecture](cloud-run-target.html): GitHub Actions deployment path, API enablement, proposed microfrontend and Cloud Run service boundaries, event/data ownership, and IAM. The workflow deploys one current app container; the service split remains a migration target.

## Dependencies

```text
codebase.html
  -> assets/architecture.css
  -> assets/logos.generated.js
  -> config/codebase.config.js
  -> assets/architecture.js

request-flow.html
  -> assets/architecture.css
  -> assets/logos.generated.js
  -> config/request-flow.config.js
  -> assets/architecture.js

cloud-run-target.html
  -> assets/architecture.css
  -> assets/architecture.js
```

The HTML contains document structure, navigation, and section/table shells. Config scripts contain diagram geometry, component definitions, module mappings, request stages, evidence inventory, and caveats. The shared renderer creates local SVG diagrams and accessible text tables. The proposed Cloud Run target is a separate static SVG so it cannot be mistaken for live source discovery. The stylesheet owns appearance, responsive behavior, and print layout. Diagram SVGs use presentation attributes so exported SVG files retain their styling.

Both diagrams use logo-first components rather than text panels. Technology logos identify React, TypeScript, FastAPI, Firebase, LangGraph, SQLAlchemy, SQLite, Vite, Docker, Python, Google Cloud, and Gemini. Lucide icons represent generic users, policy rules, and tests; they are not invented vendor logos. Short file/component captions remain visible, while detailed responsibilities live in the tables and SVG tooltips. Optional Google services remain labeled as optional, not provisioned infrastructure.

### Logo Assets

`config/logos.config.cjs` defines asset sources. `assets/logos/` contains downloaded brand SVGs and generated Lucide component icons. `assets/logos.generated.js` embeds them as data URIs, so opening the HTML and exporting a standalone SVG does not require network requests or adjacent image files. The original files remain available for asset maintenance.

To regenerate after changing the logo manifest, use the existing root npm dependencies:

```powershell
node architecture/build-logos.cjs
node architecture/validate.cjs
```

The asset builder downloads missing brand files only; existing local assets are reused. Network access is required only when assets are missing. Ordinary document viewing and SVG export do not run the builder. Asset provenance and license references are in [assets/logos/README.md](assets/logos/README.md).

Classic deferred scripts are intentional: opening a local HTML file does not require module fetches, JSON fetches, a web server, or an online diagram renderer. Keep the directory structure intact. On a phone, the diagram has its own horizontal/vertical scroll area; the surrounding page remains responsive. The controls zoom, reset the fitted view, export SVG, and invoke the browser print dialog. Large printed sequences may need a larger paper format or the stage register for readable text.

## Maintenance

Update the relevant config script when the application changes. Match file IDs used by diagram nodes to the file mapping IDs. Dependency edges point from consumer to dependency; they are not a runtime call order. In the sequence document, participant IDs identify lanes and consecutive stage numbers identify chronological messages. The sequence combines repeated database reads where explicitly noted.

Run from the repository root:

```powershell
node architecture/validate.cjs
```

The validator checks local document dependencies, config/script syntax, source-file existence, file-node mappings, edge endpoints, node bounds, and sequence order. The generated local SQLite file is optional for documentation validation because it is not committed and may be replaced by PostgreSQL.

For an HTTP preview, serve the **repository root**, not just this directory, if source-code links must work. A source file link opens the raw source or a download depending on the browser; it is not a VS Code URI. Do not expose a repository-root preview publicly: it can contain private source and local configuration. The existing application server does not automatically publish these documents.

These are source-grounded static references dated 2026-10-18, not live topology discovery or captured telemetry. Existing outcome entries, audit records, process logs and snapshots are distinguished from absent distributed tracing. Optional configuration is not a claim that Google Cloud resources are provisioned.

## Animated Request Journey

The request-flow document includes a 38.4-second, 24-scene pension-request walkthrough. It animates logo-based components, individual agents, request/response packets, the escalation transaction, chat persistence, and follow-up refreshes. Play/pause, restart, scrubbing, and playback speed are available. It starts paused and performs no API calls or database writes.

The story is an illustrative synthetic scenario: application SAM-2026-1042 is 45 days old against a 30-day service deadline, with explicit escalation consent. It takes the deterministic no-Gemini path. Playback duration is not a measured request latency; stages that traverse intermediate modules are identified in their captions. No email/SMS delivery is implied.

- Configuration: `config/journey.config.js`.
- Rendering and frame capture: `assets/journey.js`.
- Separate styling: `assets/journey.css`.
- Saved animation: `media/samanvai-pension-request-journey.gif`.
- GIF encoder: `export-journey-gif.py`, using the already-installed Pillow package.

**Download animated GIF** saves a portable, looping 960 x 529 animation at 5 fps (192 frames, 38.4 seconds). The GIF requires no video codec, server, or Python to view. It has no audio. The live HTML replay has smoother motion and adjustable playback. GIF motion starts only when the saved-animation section is opened and its lazy image is loaded.

To regenerate the repository copy, run `node architecture/export-journey.cjs`, open its printed local URL, and invoke this in that page's developer console:

```javascript
await SAMANVAI_JOURNEY_PLAYER.captureFrames()
```

The helper serves only this architecture directory on an ephemeral localhost port. Its bounded, same-origin endpoint accepts PNG frame data, invokes `export-journey-gif.py`, and writes only the fixed GIF in `architecture/media/`; it does not modify application state or expose an upload destination chosen by the client. Regeneration needs Python with Pillow already available (override the executable with JOURNEY_PYTHON if needed). Stop the helper after export. Ordinary local-file viewing and playback do not require it. No additional npm package is used.