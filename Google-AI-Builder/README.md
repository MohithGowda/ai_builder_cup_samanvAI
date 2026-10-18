# SamanvAI

**The Agentic Governance Intelligence Platform**

A runnable hackathon pilot connecting citizen services to a government operations workspace. React + TypeScript, FastAPI, LangGraph, SQLAlchemy, and optional Gemini synthesis. No cloud account or API key is required for the local demo.

## Run Locally

Requires Node.js 20.19+ (22 recommended), Python 3.11+, and optionally `uv`.

```powershell
uv venv .venv
uv pip install --python .venv/Scripts/python.exe -r backend/requirements.txt
npm install
```

Start the API:

```powershell
.venv/Scripts/python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
npm run dev -- --port 5173
```

Open http://127.0.0.1:5173. API documentation: http://127.0.0.1:8000/docs.

Without `uv`, use `python -m venv .venv`, then `.venv/Scripts/python.exe -m pip install -r backend/requirements.txt`. On macOS/Linux, use `.venv/bin/python` instead.

## What Works

- Government overview: request trends, service-specific SLA compliance, delayed applications, district comparisons, citizen satisfaction, and CSV export.
- Citizen workspace: service discovery, application intake, case tracking, illustrative pension eligibility, and grievance submission.
- Six sequential LangGraph specialists: Citizen Service, Policy Reasoning, Case Resolution, Escalation, Sentiment & Grievance, and Governance Intelligence.
- Escalation with explicit consent in chat, or an explicit case action. Case state and a unique audit entry commit in one transaction. Repeated/concurrent attempts cannot create duplicate escalations.
- Persisted applications, feedback, audit events, and the latest 20 chat turns per user/role/district view. Data survives local API restarts.
- Real application data updates after actions and on 15-second refreshes. No fake metric deltas are applied when an escalation occurs.
- Optional Gemini via `google-genai`, optional Firebase Google sign-in with server-verified tokens, and a PostgreSQL/AlloyDB-compatible database connection.
- Responsive desktop/mobile views, keyboard-operable dialogs, loading/error/empty states, agent execution traces, and policy source labels.

**This is a constrained multi-agent workflow, not six autonomous LLMs.** Deterministic tool nodes perform retrieval, rules, aggregation, and transactional mutations. When configured, Gemini synthesizes an answer from authorized tool evidence; otherwise a transparent deterministic answer is returned. The UI identifies which engine answered. Chat history is persisted for continuity but is not passed as conversational context to the model.

## Three-Minute Demo

1. Open **Overview**. Show service deadlines, district signals, and applications needing attention. All numbers are calculated from the same database.
2. Open **Citizen services**. The synthetic citizen Ananya Rao has application `SAM-2026-1042`, a pension request seeded at 45 days old against a 30-day SLA.
3. In citizen chat, select **Allow supervisor escalation**, then ask: **My pension application has been pending for 45 days.** The workflow finds the citizen's case, reports revenue verification pending, and records one supervisor escalation.
4. Expand **6 agents completed**. Inspect tool outcomes and the illustrative charter citation.
5. Open **Audit trail** to show the event, actor, timestamp, and notification-delivery status. This is an in-app event; no email, SMS, or real officer notification is sent.
6. Open **Agent workspace** and ask: **Why are pension requests delayed?** Show the verification-stage share, sample size, and average delay. The answer explicitly distinguishes a bottleneck observation from proven causation.
7. Optionally create a request, check eligibility, or submit feedback. Open a second browser to see the dashboard update on its next refresh.

The first startup seeds 180 synthetic cases and 30 feedback records. Existing rows are not reseeded. The demonstration case ages naturally after its first seed. For a clean local demo, stop the API and delete only `backend/data/samanvai.db`, then restart. This destroys local demo state; never do this against a shared database.

## Gemini

Use environment variables, or a local `.env` based on `.env.example`. Start the backend with `--env-file .env` if using a file. Do not put model secrets in `VITE_*` variables, which are public browser configuration.

```powershell
$env:GEMINI_API_KEY = "YOUR_KEY_SET_LOCALLY"
$env:GEMINI_MODEL = "gemini-2.5-flash"
.venv/Scripts/python.exe -m uvicorn backend.main:app --env-file .env --reload
```

Alternatively, use Vertex AI with Application Default Credentials and these variables:

```text
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=your-project
GOOGLE_CLOUD_LOCATION=us-central1
GEMINI_MODEL=gemini-2.5-flash
```

For Vertex, leave `GEMINI_API_KEY` unset. Use a least-privilege Cloud Run service account with Vertex AI access. Model failures/timeouts fall back to deterministic responses and are labeled in the UI. Model availability and billing depend on your project/region. Local and automated tests do not call Gemini.

## Samanvay Voice Companion

Samanvay is a full-body, animated male guide in the bottom-right corner. Choose **English**, **Hindi**, or **Kannada**, then use the microphone or type a question. He explains services, guides application intake, opens the demo pension eligibility form, looks up the signed-in citizen's case, and directs the user to the grievance form.

Explicit commands such as **Run to birth certificate**, **Jump to check eligibility**, **Walk to services**, and **Open my applications** start a guided journey. Alternatively, choose Walk/Run/Jump in the panel and click a destination button. The UI reveals the real citizen-service target, animates him across the viewport, points at the destination, and only then opens its review form. A matched service is preselected, but nothing is submitted. Informational and negative English requests do not trigger automatic travel.

Movement can be cancelled with the visible stop control or Escape. Switching away from the browser tab or opening an unrelated native application dialog stops the journey. Reduced-motion mode skips travel and opens/focuses the destination directly. Full-body walk/run limb cycles and curved jump paths are 2D SVG/CSS/Web Animations, not a 3D physics simulation.

- Service replies are grounded in the catalog, retrieved demo passages and synthetic case records. `/api/assistant` cannot create, escalate, or submit business requests. It can update limited assistant context only after memory consent. Its action buttons open existing UI for the user to review and confirm.
- Without model credentials, translated local guidance works in all three languages. When configured, Gemini can phrase the verified guidance in the selected language. The response identifies the actual engine used.
- Speech input uses the browser's `SpeechRecognition` / `webkitSpeechRecognition` implementation, not a backend audio-upload service. A supported browser, microphone permission, and HTTPS or localhost are required. Recognition availability varies by browser and language.
- Spoken replies prefer matching browser/device `speechSynthesis` voices. Hindi/Kannada use slower sentence-by-sentence playback. **Audio settings** offers Automatic fallback, Device voice, an explicit installed-voice selector and Google Cloud when configured. If a matching Hindi/Kannada device voice is absent, Automatic mode can use the server's Google Cloud Text-to-Speech path; otherwise it clearly explains the missing configuration and keeps the text reply. It never silently reads Kannada with an unrelated English voice.
- Start listening is an explicit user action. Stop listening, mute, stop speech, replay, language selection, close, and Escape are supported. Closing the panel or opening a native application dialog aborts listening, cancels speech, and cancels an in-flight assistant request.
- Browser speech services may process microphone audio externally. This app does not receive or store audio; transcribed text is sent to the authenticated API. Raw widget conversations remain in page memory and are not written to the database. With explicit consent, approved preferences and bounded service/case context are persisted separately. The selected language is also stored locally for this browser.

### Retrieval, Context and Personalization

Samanvay uses `backend/retrieval.py` to retrieve passages from the versioned `backend/knowledge/services.json` corpus. SQLite FTS5/BM25 ranks text and service aliases; the index is rebuilt in process memory at startup. Results include document IDs, version, demo/official status and excerpts, visible under **Sources & limitations**. This is **local lexical retrieval**, not a vector embedding index or Vertex AI RAG. No new package or cloud resource is required. All current documents are explicitly illustrative demo guidance, not authenticated government sources.

The response pipeline resolves the current service/case from the question, recent user turns, temporary page context and (only when enabled) approved memory. Concrete new topics override older context; ambiguous topics ask for clarification. Case facts are fetched again using the authenticated UID, never trusted from client-provided context. “I need to register my house”, “how long does it take?”, “what documents?”, and “take me there” can therefore share one topic without repeating a fixed command each time. Unknown official fees/checklists remain unknown rather than being invented.

Without Gemini, local answers use retrieved passages and explicit rules. With Gemini, the model receives the passages, conversation window, resolved context and approved preferences for grounded phrasing. The model does not issue tool calls, change policies, authorize actions or set navigation. Navigation remains validated server metadata, and application forms still require user review.

Open the **brain icon** in Samanvay's toolbar for **Memory & preferences**:

- Memory starts off. Opt in to save language, movement, preferred district, answer detail and the latest service/action/authorized application ID. These fields, not raw transcripts, are stored in the UID-keyed `assistant_memory` table.
- Review the saved fields, clear an individual district preference, disable memory to clear saved content, or use **Forget saved memory** to delete the profile and reset current widget conversation context.
- Helpful/not-helpful buttons are enabled only with consent. They adjust bounded document-ranking weights for this UID only; they never modify source text, policies, other users' retrieval or model weights. Up to 50 vote identifiers are retained to prevent repeated-click inflation.
- Memory expires after 30 days of inactivity when that profile is next accessed. This is lazy expiration, not a background deletion job; production retention requirements need scheduled purging and database-level policy.
- `AUTH_MODE=demo` intentionally shares one identity. The panel warns that demo memory is shared by all demo visitors. Do not store real preferences or personal data there. Separate-user isolation requires Firebase authentication with distinct verified UIDs.

“Learning” here means approved context, preferences and personal retrieval feedback. It is **not automatic model fine-tuning**, unlimited conversation storage, inferred sensitive attributes, or ingestion of user statements as official knowledge. No official policy crawler, embedding model or government source authentication was added. The knowledge corpus should be changed only through an approved review/versioning process.

The guide now waits for a visible service destination using an abortable DOM observer rather than assuming it exists after two animation frames. Cancellation also interrupts preparation. Approved district and service choices are preselected on arrival but never submitted automatically.

The character is a local reusable SVG component (`src/SamanvayCharacter.tsx` with `src/samanvay.css`). He smiles and blinks at rest, changes his face/head pose while listening or thinking, moves his mouth while speech synthesis reports active playback, and points on arrival. Mouth movement is speech-activity animation, not phoneme-level lip synchronization. A matching-language male device voice is preferred when identifiable by its name; the browser's available voices determine the actual sound, and a male voice cannot be guaranteed on every device. Typed controls, light/dark themes, and a phone-sized panel are supported. Existing forms and raw case stages are not fully localized. All policies and records remain illustrative; no official government system or external officer notification is connected.

Backend tests cover English/Hindi/Kannada guidance, request validation, citizen record isolation, and no mutations. Browser checks cover typed conversations, handoffs, keyboard focus, and simulated speech recognition/synthesis lifecycle events. Actual microphone transcription and installed-voice playback need verification on the target user's browser/device.

### Google Hindi/Kannada Speech

Cloud speech is optional and **off by default**. Enable the Google Cloud Text-to-Speech API and billing in your project, configure server Application Default Credentials with permission to list voices and synthesize speech, and set `GOOGLE_CLOUD_TTS_ENABLED=true` in the backend environment. Use the standard ADC setup for local development or an appropriate attached service account on Cloud Run. No service-account file or access token belongs in browser configuration. See Google's [authentication guidance](https://cloud.google.com/text-to-speech/docs/authentication).

The backend discovers available `hi-IN` and `kn-IN` voices at runtime and prefers a male matching-language voice; it does not assume a particular voice exists in your project. `/api/speech/synthesize` accepts authenticated plain text, returns MP3 with `Cache-Control: no-store`, and does not persist text or audio. Responses are chunked in the browser, can be stopped, and are cancelled when the panel closes or the language changes. A per-process limit of 16 synthesis requests per UID per minute bounds demo use; production needs distributed quotas and billing/abuse controls. Cloud speech sends reply text to Google. Speech recognition remains browser-provided and still requires microphone support/permission.

`/api/speech/capabilities` reports configuration presence, not a live credential/API-health probe. Enabling the environment flag alone does not make audio work: credentials, API enablement, billing and browser playback must also succeed. Cloud/provider lifecycle tests use mocks and do not incur charges; live cloud synthesis and microphone hardware are separate deployment checks.

## Official Review Workspaces

Governance now uses an operational review layout: authorized scope, received/open/resolved totals, SLA compliance, average overdue delay, satisfaction, a 14-day trend, open-case aging, a department matrix, district/taluk comparison, and a priority queue. **Overall report** uses one common schema at every role; **Department review** and the department selector focus the same authorized data. Downloaded JSON reports use `samanvai-review-report.v1` and do not include raw citizen case records. A report never widens an official's jurisdiction.

| Official | Required trusted claims | Allowed review |
| --- | --- | --- |
| Chief Secretary | `government: true`, `official_role: chief_secretary` | All available state-pilot records; may drill down by district, taluk and department |
| Deputy Commissioner | `government: true`, `official_role: deputy_commissioner`, `district` | Assigned district; may drill down to its taluks/departments |
| Tahsildar | `government: true`, `official_role: tahsildar`, `district`, `taluk` | Assigned taluk only; an optional `department` claim further restricts responsibility |
| Department Officer | `government: true`, `official_role: department_officer`, `department` | Assigned department; optional district/taluk claims further restrict geography |
| Citizen | No government claim | Own applications first, open/overdue/completed counts, new request, eligibility, grievance and service options |

The backend enforces claims on overview, government case/audit lists, escalation, governance-agent evidence/history, and reports. Query parameters can narrow scope, never widen it. Missing official role/jurisdiction claims fail closed. **Existing production accounts with only `government: true` must receive the additional role/assignment claims before using governance.** Claim values must match the application's configured catalog.

In demo mode only, **Synthetic role preview** switches between Chief Secretary, DC/Mysuru, Tahsildar/Hunsur/Revenue, Transport officer and citizen. This changes the `X-Demo-Profile` header, is intentionally public and synthetic, and is ignored as an authorization source in Firebase mode. All demo profiles still share the demo citizen UID and memory. Do not mistake this selector for a production login mechanism.

The citizen profile lands directly on its own applications and service-request options, including after reload. Citizens can capture a taluk when making new requests. Records without one remain **Unassigned**. The geographic catalog and legacy seeded taluk allocations are explicitly illustrative; the six-district pilot does not represent authoritative coverage of all Karnataka districts/taluks. Legacy synthetic allocations are derived on read without rewriting saved applications. Real records need verified geography and proper schema migration, not synthetic enrichment.

## Authentication

Default `AUTH_MODE=demo` intentionally grants one shared synthetic identity with citizen ID `demo-citizen`; the default preview is Chief Secretary. **Never use demo mode with real personal data.**

For Firebase mode:

1. Create a Firebase project, enable Google sign-in, and authorize your hosting domain.
2. Provide public `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, and `VITE_FIREBASE_PROJECT_ID` at frontend build time.
3. Set backend `AUTH_MODE=firebase`, `SEED_DEMO=false`, and configure Firebase Admin through Application Default Credentials for the same project. Redeploy the frontend after changing its configuration.
4. Assign `government: true`, an `official_role`, and the required district/taluk/department assignments listed above only through a trusted Admin SDK process. Citizens without the claim cannot access government analytics or other citizens' applications. Client role headers cannot override verified Firebase claims.
5. A citizen's Firebase UID is the record owner. Client-supplied roles cannot grant government privileges.

Initial unauthenticated requests show **Sign in with Google**. Token validation includes revocation checks. Never commit a service account credential file. Real deployment still requires IAM review, session/error hardening, abuse protection, retention policies, audit access controls, and a security assessment.

## Storage and Google Cloud Status

| Component | Current implementation | Cloud path |
| --- | --- | --- |
| Applications, feedback, workflow results | SQLAlchemy + local SQLite | Set `DATABASE_URL=postgresql+psycopg://...` for PostgreSQL/AlloyDB |
| Agent orchestration | Real six-node LangGraph execution | Runs inside the FastAPI Cloud Run service |
| Gemini | Optional SDK integration + safe deterministic fallback | Gemini API or Vertex AI |
| Authentication | Shared demo identity or Firebase verified tokens | Firebase Authentication |
| Frontend hosting | Vite locally; FastAPI serves production build | Firebase Hosting configuration included |
| Cloud Run | Multi-stage image definition in `docker/Dockerfile`; GitHub Actions workflow included | Single current application service; use Cloud SQL for persistence |
| Firestore | Not implemented/provisioned | Add an outbox-driven case/status/chat projection and realtime listeners |
| BigQuery | Not implemented/provisioned | Export de-identified case events and query governed analytics views |
| Vertex AI RAG / embeddings | Not implemented/provisioned | Replace illustrative local charter lookup with an approved, versioned policy corpus |
| Knowledge graph | Future work | Model citizen/application/officer/department/policy relationships with access controls |

The local analytics are Python aggregations, not BigQuery queries. Policy lookup uses explicit demo rules and service matching, not semantic vector retrieval. No official policies or government systems are connected. The district pulse is a labeled comparison grid, not a geographic choropleth. Public API health and the connections dialog expose actual configured state.

### Container And GitHub Deployment

```powershell
docker build -f docker/Dockerfile -t samanvai .
docker run --rm -p 8080:8080 -e AUTH_MODE=demo -e SEED_DEMO=true samanvai
```

The Dockerfile is stored under `docker/`, but the build context remains the repository root because it copies the existing frontend and backend trees. The multi-stage build installs npm and Python dependencies, builds Vite, then copies the frontend bundle and FastAPI application into a non-root Python runtime image. The container listens on Cloud Run's `PORT` (8080 by default) and serves both the frontend and `/api`.

`docker/Dockerfile` defaults to Firebase authentication and does not seed demo records. The local command above explicitly opts into the shared synthetic demo identity; do not deploy those flags publicly. `.github/workflows/deploy-cloud-run.yml` runs backend tests and the frontend build, authenticates with GitHub OIDC, enables Cloud Run Admin API, builds and pushes the image from the GitHub runner to Artifact Registry, then deploys the current combined frontend/API container to Cloud Run. No service-account key is stored in GitHub or in the image.

Configure these GitHub Actions repository variables: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER` (full provider resource name), `GCP_DEPLOY_SERVICE_ACCOUNT`, `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`, `CLOUD_SQL_INSTANCE`, `DATABASE_URL_SECRET` (secret name), `GAR_REPOSITORY`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, and `VITE_FIREBASE_PROJECT_ID`. Restrict the workflow's deployment identity to your repository and default branch. Firebase web config values are public browser configuration, not passwords; restrict the Firebase key by allowed APIs and configure Firebase authorized domains.

Before the first GitHub Actions run, enable the base federation APIs `iamcredentials.googleapis.com` and `sts.googleapis.com` once from an administrator workstation. The workflow then enables `run.googleapis.com` (Cloud Run Admin API), `artifactregistry.googleapis.com`, `secretmanager.googleapis.com`, and `sqladmin.googleapis.com` in the selected project. Enabling those APIs requires `roles/serviceusage.serviceUsageAdmin` on the project; if the GitHub deployment identity does not have that role, an administrator must enable them first. Create the Artifact Registry repository, Cloud SQL instance, database secret, GitHub deployment service account, and Cloud Run runtime service account first. Configure Google Workload Identity Federation for GitHub with `google.subject=assertion.sub`, `attribute.repository=assertion.repository`, and `attribute.ref=assertion.ref`; restrict the provider condition to your exact `OWNER/REPOSITORY` and `refs/heads/main` (or your actual default branch). Grant the federated deployment identity Artifact Registry Writer, Cloud Run Admin, Service Usage Admin for API enablement, and `iam.serviceAccountUser` only on the runtime account. Grant the runtime account Cloud SQL Client and Secret Manager Secret Accessor; grant Vertex AI access only if that optional feature is enabled.

Set `DATABASE_URL_SECRET` to the Secret Manager **secret name**, not its value. Its payload should use the Cloud SQL Unix socket, for example `postgresql+psycopg://USER:PASSWORD@/DATABASE?host=/cloudsql/PROJECT:REGION:INSTANCE`; URL-encode reserved characters in credentials. The runtime account also needs access to the Firebase project used for ID-token verification. Keep credential values out of source files and image layers. The workflow uses GitHub OIDC and an attached runtime service account; it does not need a downloaded service-account key or a default application password.

Before the first deploy, provision the Artifact Registry repository, Cloud SQL PostgreSQL instance, Secret Manager secret containing a SQLAlchemy `DATABASE_URL` using the Cloud SQL Unix socket, and both service accounts. The GitHub federated principal needs Artifact Registry Writer, Cloud Run Admin, Service Usage Admin for the API-enablement step, and `iam.serviceAccountUser` only on the runtime service account. The runtime account needs Cloud SQL Client and Secret Manager Secret Accessor; add Vertex AI access only if enabled. Ensure the runtime account can read the selected Firebase project configuration. Use database migrations before production; this app's current startup schema creation is not a migration system.

Cloud Run is deployed with public invoker access so the site can load on its `run.app` URL. Sensitive API routes still require Firebase sign-in; the pipeline explicitly sets `AUTH_MODE=firebase` and `SEED_DEMO=false`, so there is no default administrator credential. The runtime service account is the application's Google Cloud identity, not an end-user login. Do not add passwords, service-account keys, or database URLs to source control, Docker build arguments, or image layers.

The optional manual `map_custom_domain` job creates a Cloud Run domain mapping and prints the DNS records that Google requires. Verify the domain and region support first, then add those records at your authoritative DNS provider (or automate them separately if using Cloud DNS). Certificate provisioning can take time. The service remains reachable through its Cloud Run URL while DNS is pending. Domain ownership, DNS changes, cloud resources, and billing are not provisioned by this repository.

To use an external Firebase Hosting frontend instead, review `firebase.json` separately; this container already serves the built frontend and API from the same origin.

### Metric Definitions

- **SLA compliance:** the share of all selected applications whose elapsed service time does not exceed the service-specific deadline. Resolved cases freeze at their resolution date. Open cases age with the current server date. This is not a resolved-case-only SLA metric.
- **Overdue:** unresolved applications older than their service deadline. A case at exactly its deadline is not overdue.
- **Citizen satisfaction:** positive feedback / (positive + negative feedback). Neutral records are excluded from the denominator; the displayed record count includes all feedback.
- **Sentiment:** seed labels plus a simple lexicon baseline for submitted feedback. This can misread negation and is not a validated Gemini classification.
- **Trend:** received and resolved counts for each of the last 14 calendar dates. Nothing is interpolated into the underlying data; the visual line is smoothed.
- **Root cause:** observed workflow-stage concentration, never a causal inference or a fabricated statistic.

## Verification

```powershell
.venv/Scripts/python.exe -m unittest backend.test_domain backend.test_jurisdiction backend.test_retrieval backend.test_api -v
npm run build
```

Tests cover SLA boundaries, resolved elapsed time, policy criteria, state/district/taluk/department authorization, demo-header spoof resistance in Firebase mode, invalid inputs, concurrent escalation idempotency, audit/dashboard updates, grievance metrics, application creation, chat intents, private chat history, retrieval/memory controls, and mocked cloud voice discovery/audio transport. Tests use a temporary database, disable model calls, and do not alter the local demo database. The production static-asset check runs when a frontend build exists.

Cloud resources, live Gemini responses, Firebase sign-in, and container builds require credentials/tooling and separate deployment verification. No claims of official eligibility, external delivery, or cloud provisioning are made by this pilot.

## Assets

The local Bengaluru photograph is sourced from the Unsplash image CDN: https://images.unsplash.com/photo-1596176530529-78163a4f7af2. Icons are from Lucide. Typefaces: DM Sans and Manrope via Google Fonts, with local sans-serif fallbacks when offline.