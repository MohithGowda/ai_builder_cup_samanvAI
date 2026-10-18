# SamanvAI Demo Video

The finished explainer is `samanvai-overview.mp4`: 1280x720, approximately 2 minutes 19 seconds, with English Microsoft David narration. It shows the governance overview, citizen services, Samanvay guiding a birth-certificate request to its review form, the regional map, and the proposed Cloud Run architecture.

All displayed records are synthetic. The form is not submitted. The Cloud Run microservice split is a future target, not deployed infrastructure.

## Regenerate

Requires Node.js, Google Chrome for Windows, and the local Windows voice used to create the WAV narration clips. No application package was added.

1. Start the local recorder server from the repository root: `node media/demo-video/server.cjs`.
2. In another terminal, run `node media/demo-video/render-headless.cjs record`.
3. The recorder captures at 1280x720 in standalone Chrome, saves the video here, and corrects the fragmented MP4 duration index. The final duration is based on the encoded track timestamps and remains below three minutes.

`node media/demo-video/render-headless.cjs probe` runs a short encoder check. Set `CHROME_PATH` if Chrome is installed outside its default Windows path. The recorder server binds only to `127.0.0.1`; it accepts only the fixed output filenames used by this workflow.