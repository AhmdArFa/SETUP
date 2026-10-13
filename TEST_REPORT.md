# MCIT AI refactor: test report

Date: 2026-10-13. Status: **in progress; not production-ready**.

The attached brief defines 19 test passes. This report records what was actually run, including
missing prerequisites and known failures. A check is not marked green merely because an endpoint
exists.

## Automated checks

- Docker Compose (Alloy host-network variant) starts SurrealDB, Ollama, Kokoro, API/worker and
  Next.js; `/health` returns `healthy` and `/agent` responds with HTTP 200.
- Backend `uv run pytest tests/ -q`: **1,005 passed** (including five new editor/error/context tests),
  2 dependency warnings.
- `ruff check api open_notebook tests`: passed after the fixes. Frontend lint: zero errors, seven
  existing warnings. Frontend Vitest: **181/181 passed** when run separately from the backend;
  an earlier concurrent run timed out its 30-second locale key scanner at 180/181.
- Docker image built and the app rendered in Playwright at `http://localhost:8080/agent` and
  `/files`. An initial `/agent` navigation sometimes redirected to `/notebooks` during auth
  hydration; navigating again loaded Thoth. This race remains uninvestigated.
- A final Docker rebuild passed after disabling Next.js telemetry. The rebuilt API returned
  `healthy`, the UI returned HTTP 200 and Playwright rendered `/agent` with no console errors.
- During Docker `npm ci`, npm reported **25 dependency advisories** (6 low, 7 moderate, 12 high)
  and a React 19 peer-version conflict in `@emoji-mart/react` via `@lobehub/ui`. No dependency
  remediation was attempted; inspect `npm audit` before production deployment.

## Brief acceptance passes

| # | Pass | Observed result |
|---|---|---|
| 1 | Boot and identity | MCIT AI title, Thoth agent, specified footer/About credit and dark three-pane agent UI render. The required avatar asset and approved reference screenshot are missing. |
| 2 | Models | A saved Groq credential initially had zero registered models. Startup sync registered eight usable models; the Groq SDK double-prefix bug was fixed. Switching Groq's `openai/gpt-oss-20b` into an agent run worked. Other providers not exercised. |
| 3 | Thinking | Low and High on Groq succeeded. Provider usage: Low 65 reasoning tokens across four calls; High 679 across three calls (different paths, so counts are not a controlled benchmark). qwen2.5:7b correctly disables adjustable thinking. |
| 4 | Steps | Live events recorded actual model/tool transitions, skills and progress in an API run; visual expand/collapse not exercised with a live run. |
| 5 | Uploads | Previously uploaded PDF processed and was used for chat. Agent `+` uploads for image, spreadsheet and archive were not exercised. Some formats may not have extractors. |
| 6 | Skills | Default writing instructions injected into prompts and announced during a live agent run. User-added skills and executable plugins were not exercised; these skills are instructions, not executable plugins. |
| 7 | Document workflow | Custom Data Story deck: reference, design, real PPTX audit, zero issues, downloadable file. A deliberately overflowing deck was caught and converged to zero after two passes. Other custom templates/types not exhaustively tested. |
| 8 | PDF lengths | Short/Medium/Long labels and long-form section expansion implemented; comparative page counts were not measured. |
| 9 | Infographic | Digital Egypt's two processed PDF sources contained 6,250 characters in the notebook material builder. The reported empty notebook was genuinely empty. Re-running the infographic from an uploaded file was not performed here. |
| 10 | Podcast/TTS | A previous end-to-end run produced a 7.7 MB local MP3 with qwen2.5:7b and Kokoro. Not repeated after this refactor. |
| 11 | Image generation | Not implemented; no image provider integration was demonstrated. |
| 12 | Usage | Groq API calls persisted provider-reported tokens (input, output, reasoning), request count and last-used timestamp; cost cannot be calculated without verified pricing. Other model call paths are not fully instrumented. |
| 13 | Privacy | New run errors redacted; repository scan performed. No complete packet capture, cloud retention proof or failure-path coverage. See `PRIVACY_AUDIT.md`. |
| 14 | Copy | MCIT AI/Thoth on primary screens; upstream README and internal docs still contain old identity. Full copy sweep incomplete. |
| 15 | Two surfaces | Notebook Assistant remains source-grounded; Thoth agent lists notebooks, searches and generates files. An empty notebook now offers source-add/process actions. Full interaction test pending. |
| 16 | Design | Three-pane dark layout rendered. Pixel comparison impossible: `chat-ui-reference.png` was not attached. Thoth avatar falls back to a text monogram until the approved image is supplied. |
| 17 | Privacy audit | Partial audit with open findings, not a 100% privacy certificate. |
| 18 | Embedded editors | Created PPTX, XLSX and PDF via editor API. A PPTX was opened, edited and saved from Playwright; version advanced from 1 to 2 with same id. PDF page reorder returned HTTP 200. Full PDF annotation, arbitrary PPTX shapes, and native Excel PivotTables are not implemented. |
| 19 | Editor sync | Edited PPTX title persisted in the same file id, appeared as version 2 in Files and reopened in the panel. Chat attachment synchronization after a reload was not exercised. |

## Fixes made during the run

- Default scratch PPTX now starts with two content slides so the four-slide minimum does not create an immediate audit failure.
- PDF page edits now return metadata after detaching the stale structured document reference.
- Thoth and Studio error events no longer return raw exception strings; attachment and tool proxy errors no longer echo server response bodies.
- Next.js build/runtime telemetry was disabled after its notice appeared during Docker validation.
- The context label incorrectly showed Ollama's 32K model maximum rather than the active 8K
  runtime window. It now reads the active value from `/api/ps` and keeps the maximum separate;
  two mocked capability tests cover loaded and unloaded models.
- Version checking against upstream GitHub was disabled and saved Groq credentials are synchronized into the model table.

## Required before production sign-off

Provide the approved avatar/reference design, test all 19 flows on a secured deployment, remediate
dependency advisories, add a real image provider, decide on editor scope for arbitrary imported files, address privacy findings and
run the full privacy/network audit. Do not represent this report as a final acceptance certificate.
