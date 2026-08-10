---
name: update-readme
description: Update the project README to accurately reflect the current codebase, setup, architecture, features, environment variables, testing, and limitations.
disable-model-invocation: true
---

# Update README

## Purpose

Keep README.md synchronized with the actual project implementation.

The README must describe what the repository currently does, not planned or assumed functionality.

## Instructions

1. Inspect the repository before editing README.md.

Review at minimum:
- README.md
- package.json files
- client structure
- server structure
- .env.example
- relevant configuration files
- routes
- services
- AI providers
- tests
- recently changed files

Use Git when useful:
- `git status`
- `git diff --stat`
- `git diff`
- `git log --oneline -10`

2. Preserve correct existing README content.

Do not rewrite the entire README unnecessarily.

Update only sections that are:
- outdated
- incomplete
- inconsistent with the code
- missing important implemented functionality

3. Never document features that are not implemented.

If implementation cannot be confirmed from the repository:
- do not claim it exists
- mention it as a limitation or omit it

4. README structure

Use or maintain these sections when relevant:

# Project Name

Short description of what the application does.

## Features

Document implemented user-facing functionality, including:
- resume input/upload
- job description input
- multi-job analysis
- fit scoring and ranking
- skill matching
- ATS analysis
- evidence-grounded bullet rewrites
- anti-fabrication validation
- rewrite Accept / Reject / Edit workflow
- approved-content export

Only include features verified in the codebase.

## Architecture

Explain the high-level architecture:

Frontend
- React / Vite

Backend
- Node.js / Express

AI workflow
- Supervisor
- Skill Match
- ATS
- Bullet Rewrite
- deterministic scoring
- anti-fabrication validation

Clearly distinguish logical workers from workers that actually make LLM calls.

## AI Provider Strategy

Document supported modes and provider routing based on the current code.

For example, if still accurate:

- automatic: Gemini → Groq → OpenRouter → Ollama
- cloud: Gemini → Groq → OpenRouter
- private: Ollama
- demo: Mock

Explain that:
- provider fallback is sequential
- quota/rate-limit/unavailability can trigger fallback
- mock is not silently used in normal automatic/cloud operation

Do not expose API keys.

## Scoring

Describe the current scoring methodology at a useful high level.

Include:
- mandatory requirement coverage
- preferred requirement coverage
- contextual/nice-to-have coverage
- ATS coverage
- evidence confidence
- worker-health effects
- deterministic caps
- score labels

Do not copy internal implementation formulas unless useful for users/developers.

Ensure README does not describe the old additive scoring formula.

## Anti-Fabrication

Explain that rewrites are checked against resume evidence.

Mention relevant risk categories if implemented:
- invented metrics
- unsupported skills/tools
- unsupported leadership/ownership claims

Explain:
- risky rewrites require review
- direct acceptance may be blocked
- users can edit and revalidate

## Setup

Provide exact repository setup instructions based on package scripts.

Include:
- prerequisites
- dependency installation
- backend startup
- frontend startup
- Ollama setup if supported
- cloud provider setup if supported

Do not invent commands.

Read package.json scripts before documenting commands.

## Environment Variables

Use `.env.example` as the source of truth.

Document variables by category:

General AI configuration
Cloud providers
Ollama/local inference
Debugging

Never copy values from `.env`.

Never expose:
- API keys
- tokens
- secrets
- credentials

Use placeholders only.

## Running the Application

Explain which terminals/directories are required.

Example only if verified:

Terminal 1:
`cd server`
`npm run dev`

Terminal 2:
`cd client`
`npm run dev`

## Testing

Read the actual package scripts and document:
- backend tests
- frontend tests
- lint commands

Do not hard-code test counts because they change frequently unless specifically requested.

Prefer:
"All automated tests should pass"

instead of:
"263 tests pass"

## API

Document important backend endpoints only when confirmed from route files.

For each endpoint include:
- method
- route
- purpose

Do not expose internal implementation unnecessarily.

## Privacy and Security

Document important behavior:
- API keys remain server-side
- `.env` must not be committed
- cloud mode sends resume/job content to configured external AI providers
- private mode keeps inference local through Ollama, if implemented
- debug response logging should not be enabled in production

## Current Limitations

Inspect the implementation and document meaningful current limitations.

Examples only if still true:
- deterministic ATS matching may miss synonyms
- local Ollama performance depends heavily on hardware
- free cloud-provider quotas can be exhausted
- provider/model availability can change
- anti-fabrication validation can produce false positives or negatives

Do not list already-fixed defects as limitations.

## Project Structure

Add/update a concise tree showing important folders only.

Do not dump the entire repository.

Example:

```text
client/
server/
  src/
    routes/
    services/
      agents/
      ai/
    schemas/
    utils/
.claude/
  skills/
