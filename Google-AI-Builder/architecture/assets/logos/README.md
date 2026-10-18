# Architecture Logo Assets

Technology marks identify the components used by the project; they do not imply endorsement or a live cloud connection. Generic component icons are explicitly distinguished from vendor marks.

| Assets | Source | License / guidance |
| --- | --- | --- |
| HTML5, React, TypeScript, CSS3, FastAPI, Firebase, Python, SQLAlchemy, SQLite, Vite, Docker, Google Cloud | [Devicon](https://github.com/devicons/devicon) SVG icon collection | [Devicon license](https://github.com/devicons/devicon/blob/master/LICENSE); respective product names/marks remain their owners' property |
| LangGraph, Google Gemini | [Simple Icons](https://simpleicons.org/) through its SVG CDN | [Simple Icons license and disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md); applicable brand guidelines still apply |
| Citizen, HTTP transport, policy, tests, audit | Existing `lucide-react` dependency: UsersRound, Network, ShieldCheck, FlaskConical, ClipboardCheck | [Lucide ISC license](https://github.com/lucide-icons/lucide/blob/main/LICENSE) |

Exact download URLs and icon names are recorded in `../../config/logos.config.cjs` and in the generated registry's `source` fields. The builder preserves downloaded SVG content and creates a base64 representation for offline rendering and self-contained diagram exports. No remote image loading is required when viewing the architecture documents.

The table above links to upstream license notices. Local license-text downloads are not included. Review the notices and retain required attributions before redistributing the logo assets.

Google Cloud's logo represents the provider in conditional Cloud Run/Vertex deployment paths, not a service-specific product icon. Firebase's logo identifies authentication or the documented Hosting alternative, not implemented Firestore persistence. SQLite identifies the default store; PostgreSQL/AlloyDB remain alternate configured database paths described in the accompanying text.