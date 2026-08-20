# Resume / Job-Match Analyzer

Evidence-grounded, multi-job career-intelligence system. Paste or upload a resume,
add up to three target roles, and get ranked, explainable match results with
anti-fabrication–checked bullet rewrites — plus on-demand interview prep, a
transparent score breakdown, a side-by-side job comparison, and enhanced DOCX
export.

## Features

- **Resume input** — paste text, or upload a **PDF** or **Word `.docx`** (macro-enabled `.docm` is rejected). DOCX structure is preserved for export.
- **Multi-job analysis** — up to 3 roles, ranked by a deterministic normalized score with stable tie-breaks.
- **Multi-agent pipeline** — supervisor, skill-match, ATS-keyword, and bullet-rewrite workers over a pluggable AI provider chain.
- **Anti-fabrication rewrites** — evidence-grounded bullet suggestions with per-item validation, review/accept/edit flow, and approved-content preview.
- **Why this score?** — a deterministic, LLM-free breakdown (component coverage, strong matches, deductions, applied score caps) surfaced per job.
- **Job comparison** — side-by-side metrics for 2–3 jobs with a Best-Fit badge that follows the existing ranking. No extra AI calls.
- **Interview preparation** — on-demand, token-conscious interview questions (resume/role/gap/behavioral) with "why this question" and a deterministic STAR answer framework.
- **Job Posting URL import** — paste a public job URL; the server fetches it (SSRF-hardened) and extracts title/company/location/description deterministically (JSON-LD → meta → semantic HTML), which you review and edit before analysis.
- **Enhanced DOCX export** — regenerate a clean Word document from a `.docx` upload with your accepted rewrites applied.
- **Accounts, history, and guest limits** — optional JWT auth, per-user analysis history, and a guest free-analysis allowance (all activate only when a database is configured).
- **Responsive UI + theming** — adaptive header with a mobile navigation drawer, and Light / Dark / Mix themes available at every viewport width.

## Stack

- **Client:** React + Vite + Tailwind CSS (Vitest + Testing Library)
- **Server:** Node.js + Express, Zod validation, Mongoose (optional), JWT + bcrypt, `mammoth` (DOCX read) + `docx` (DOCX write), Vitest
- **AI providers:** Gemini, Groq, OpenRouter, Ollama, plus a deterministic `mock` for demos/tests
- **Constraint:** runs entirely on free-tier / local models — no paid services required

## Prerequisites

- Node.js 20+
- npm
- (Optional) MongoDB — only needed for accounts, history, and guest limits
- (Optional) Ollama — only needed for local live AI

## Setup

From the project root:

```bash
npm run install:all
cp .env.example .env
```

On Windows PowerShell:

```powershell
npm run install:all
Copy-Item .env.example .env
```

Then edit `.env` (see **Configuration** below). The defaults run a fully local,
stateless demo with no external services.

## Configuration

All server configuration is environment-driven; see [`.env.example`](.env.example)
for the complete, documented list. Highlights:

| Variable | Purpose |
|----------|---------|
| `AI_MODE` | `automatic` (provider chain) \| `cloud` \| `private` (Ollama) \| `demo` (mock only) |
| `AI_PROVIDER_CHAIN` | Ordered providers tried in `automatic` mode (e.g. `gemini,groq,openrouter,ollama`) |
| `AI_PROVIDER` | Legacy single-provider selector; set `mock` for a no-network demo |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY` | Cloud provider keys (server-side only, never sent to the client) |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | Local Ollama endpoint and model |
| `MONGODB_URI` | Enables auth, history, and guest limits. Empty = stateless. **Required in production.** |
| `JWT_SECRET` | JWT signing secret (must be long/random in production) |
| `GUEST_ANALYSIS_LIMIT` | Free analyses allowed before sign-up (default 1) |
| `MAX_UPLOAD_FILE_SIZE_BYTES` | Resume upload size limit (default 5 MB) |
| `JOB_EXTRACT_TIMEOUT_MS` / `JOB_EXTRACT_MAX_BYTES` / `JOB_EXTRACT_MAX_REDIRECTS` | URL-import fetch bounds |
| `JOB_EXTRACT_AI_CLEANUP` | Opt-in single LLM cleanup for noisy scraped HTML (default off) |
| `INTERVIEW_MAX_QUESTIONS` / `INTERVIEW_NUM_PREDICT` | Interview generation caps |

### AI modes

- **`demo` (recommended for presentations):** deterministic mock — no cloud/LLM calls. URL import and interview generation return built-in fixtures.
- **`automatic`:** walks `AI_PROVIDER_CHAIN`, falling back on failure. Only real providers are used (never mock); if all fail, requests return a normalized `AI_PROVIDERS_UNAVAILABLE` error rather than fabricating output.
- **`cloud`:** Gemini/Groq/OpenRouter only. **`private`:** Ollama only.

## Run

Start the API and client together:

```bash
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:5000
- Health: http://localhost:5000/api/health

## Endpoints

| Method & path | Description |
|---------------|-------------|
| `GET /api/health` | Service + provider status |
| `GET /api/ai/health` | Live AI provider reachability check |
| `POST /api/resume/parse` | Parse pasted text or an uploaded PDF/DOCX into normalized evidence |
| `POST /api/analysis/validate-input` | Validate resume + jobs before running |
| `POST /api/analysis/run` | Run the multi-job analysis (ranked results + `scoreExplanation`) |
| `POST /api/analysis/run-single` | Run a single-job analysis |
| `POST /api/jobs/extract` | Import a job posting from a public URL (SSRF-hardened) |
| `POST /api/interview/questions` | Generate interview questions on demand |
| `POST /api/export/resume/docx` | Regenerate an enhanced DOCX with accepted rewrites |
| `POST /api/auth/signup` · `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout` | Authentication (active only with a database) |
| `GET /api/history` · `GET /api/history/:id` · `DELETE /api/history/:id` | Per-user analysis history |

## Demo walkthrough

1. Open the app at http://localhost:5173.
2. Provide a resume: paste text, or **Import File** to upload a PDF/DOCX. (Or use **URL Import** to pull a job posting from a link.)
3. Add 1–3 target roles and run the analysis.
4. Review the ranked job cards; open **Why this score?** for the transparent breakdown.
5. Accept, edit, or reject the evidence-grounded bullet rewrites; copy or export the approved content. For a `.docx` upload, use **Download DOCX** (enabled after accepting a rewrite).
6. With 2–3 jobs, click **Compare Jobs** for the side-by-side view and Best-Fit badge.
7. Open **Generate Interview Questions** for on-demand prep.
8. Sign in (if a database is configured) to save and revisit analyses in **History**.

## Testing

```bash
npm test --prefix server      # backend (Vitest)
npm run test --prefix client  # frontend (Vitest + Testing Library)
npm run lint                  # ESLint across the repo
npm run build                 # production client build
```

> Note: there is a root `lint` script (`eslint .`); the `client` package itself
> has no standalone `lint` script — lint from the root.

## Security & integrity notes

- **No fabricated experience:** bullet rewrites are validated against source evidence; the score explanation is derived only from real scoring inputs (no second AI "explanation" call).
- **SSRF-hardened URL import:** http/https only; localhost, private/link-local/reserved IP ranges, and internal hostnames are rejected (including via DNS resolution and on every redirect); response size, content type, redirects, and timeout are bounded; no cookies/credentials are sent and page JavaScript is never executed.
- **Uploads are data only:** `.docm` (macro-enabled) files are rejected; temp files are cleaned up; full resume content is never logged.
- **Secrets stay server-side:** provider API keys are never exposed to the client; logs never print keys, tokens, Authorization headers, or raw prompts.

## Current limitations

- Accounts, history, and the guest limit require `MONGODB_URI`; without it the analyzer runs statelessly (as in the original MVP).
- Live cloud/Ollama runs depend on reachable providers; use `AI_MODE=demo` for a guaranteed offline demo.
- URL import cannot extract JavaScript-only job boards or pages behind bot/auth walls — those return a graceful failure and the UI falls back to manual paste.
- Interview questions are session-only (not persisted to history), and imported job **Company/Location** are captured for review but not used by scoring.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install root, client, and server dependencies |
| `npm run dev` | Run client and server concurrently |
| `npm run build` | Build the client for production |
| `npm run lint` | Lint the repository (ESLint) |
| `npm run preview` | Preview the production client build |
| `npm run test --prefix client` | Run frontend tests |
| `npm test --prefix server` | Run backend tests |

## Project structure

```text
final-project/
├── client/          # React + Vite + Tailwind frontend
├── server/          # Express API (analysis, auth, history, jobs, interview, export)
├── .env.example     # Environment template (fully documented)
└── package.json     # Root orchestration scripts
```
