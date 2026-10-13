# MCIT AI

The private AI workspace for the Ministry of Communications and Information Technology.
**Thoth** is the agent; the notebook Assistant answers questions using notebook sources.

Developed by Eng Ahmed Arfa for MCIT.

## Run Locally

Docker Compose starts SurrealDB, Ollama, Kokoro TTS, the API/worker and the Next.js UI.
The first start downloads the `qwen2.5:7b` and `nomic-embed-text` models.

```bash
docker compose up -d --build
```

Open `http://localhost:8502`. The API health endpoint is `http://localhost:5055/health`.
Set unique `OPEN_NOTEBOOK_ENCRYPTION_KEY`, `SURREAL_PASSWORD`, and
`OPEN_NOTEBOOK_PASSWORD` values in `.env` before putting the app on a shared network.
See [MCIT_LM_SETUP_GUIDE.md](MCIT_LM_SETUP_GUIDE.md) for setup and troubleshooting.

The Alloy preview uses `.alloy/environment.json` and `docker-compose.alloy.yaml`:

```bash
.alloy/populate-env.sh
docker compose -f docker-compose.alloy.yaml up -d --build
```

## Features

- Source ingestion, notebook-grounded chat, vector search and notebook management.
- Thoth agent with tool execution, expandable progress and model-reported token usage.
- Studio: presentations, PDF reports, infographics, summaries and Excel dashboards.
- Files: edit generated slides, spreadsheets and documents in place; organize PDF pages and
  edit Markdown/text. Export the latest native file from the panel.
- Local TTS via Kokoro for podcast generation. Ollama is the default LLM; optional cloud
  providers send task content to their endpoints when selected.

The approved Thoth avatar is **not included**. Supply the authorized image at
`frontend/public/thoth-avatar.png` and set `NEXT_PUBLIC_THOTH_AVATAR=true` when building
the frontend (`NEXT_PUBLIC_THOTH_AVATAR=true docker compose up -d --build`). Without it,
the UI displays a text monogram, not a fabricated emblem.

## Deployment Status

This refactor is **not certified for production**. Read [TEST_REPORT.md](TEST_REPORT.md) and
[PRIVACY_AUDIT.md](PRIVACY_AUDIT.md) before deployment. In particular, the default Docker
configuration is for local development; not all data is stored in SurrealDB and cloud
provider retention has not been verified. Do not claim 100% privacy or zero egress.

## Attribution

MCIT AI is derived from Open Notebook by Luis Novo and contributors under the MIT License.
The original copyright and licence notice remain in [LICENSE](LICENSE), and the upstream
README is archived in [docs/upstream-README.md](docs/upstream-README.md). The application
UI contains no upstream product branding.
