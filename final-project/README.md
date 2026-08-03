# Resume / Job-Match Analyzer

Evidence-grounded, multi-job career intelligence system. The MVP now supports a complete frontend flow for resume input, review, submission, ranked analysis results, rewrite approvals, copy/export actions, and reset.

## Stack

- **Client:** React + Vite
- **Server:** Node.js + Express + CORS + dotenv
- **Constraint:** No paid models or services

## Prerequisites

- Node.js 20+
- npm

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

## Modes

- **Mock provider (default):** recommended for local development and demos. Set `AI_PROVIDER=mock`.
- **Ollama provider:** for live AI execution, install Ollama and set `AI_PROVIDER=ollama` plus `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.

## Run

Start the API and client together:

```bash
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:5000
- Health: http://localhost:5000/api/health

## Endpoints

- `GET /api/health`
- `POST /api/resume/parse`
- `POST /api/analysis/validate-input`
- `POST /api/analysis/run`

## MVP demo steps

1. Open the app at http://localhost:5173.
2. Paste a resume or upload a PDF resume.
3. Add one or more jobs and submit the form.
4. Review the resume and jobs, then confirm the analysis.
5. Inspect the ranked job cards, select a job, review skills/ATS keywords/gaps, approve or edit rewrites, copy approved content, or export JSON.
6. Use Start new analysis to reset and begin again.

## Current limitations

- The MVP uses the existing backend orchestration and deterministic scoring. It does not add auth, persistence, database history, charts, PDF generation, GitHub integration, or company research.
- Live Ollama runs depend on a reachable local Ollama instance.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install root, client, and server dependencies |
| `npm run dev` | Run client and server concurrently |
| `npm run build` | Build the client for production |
| `npm run lint` | Lint client and server source |
| `npm run preview` | Preview the production client build |
| `npm run test --prefix client` | Run frontend component tests |
| `npm test --prefix server` | Run backend tests |

## Project structure

```text
final-project/
├── client/          # React + Vite frontend
├── server/          # Express API
├── .env.example     # Environment template
└── package.json     # Root orchestration scripts
```
