# ADR-016: Adopt LobeHub as MCIT AI agent core

- Status: accepted (user-directed)
- Date: 2026-10-13
- Supersedes: ADR-015 (integration boundary / UI-only)

## Context

The Open Notebook–based agent chat remained weak (upload path issues, thin agent UI/runtime).
The product owner directed a pivot: use LobeHub open-source application as the main agent app
(agents, agent UI, tools, gateway), apply MCIT identity lightly, keep privacy for official data,
bundle local avatars (default Tutankhamun), and later re-add Studio/Notebook features on top.

## Decision

1. Primary application tree is `lobe-mcit/` — full LobeHub monorepo with MCIT branding and privacy
   defaults.
2. Branding, default agent (Thoth + Tutankhamun), avatar gallery, enlarged chat/home/sidebar
   avatars, and `telemetry: false` are first-class edits.
3. Private deploy template lives under `lobe-mcit/docker-compose/mcit/`.
4. Notebook/Studio from the previous fork are **not** deleted yet; they are a feature source to
   port into LobeHub, not the agent UI source of truth.
5. LobeHub Community License commercial-derivative terms still apply — obtain a commercial license
   from LobeHub LLC before organizational distribution.

## Consequences

- Stack becomes Next.js + Postgres + Redis + S3 + agent gateway (not SurrealDB/FastAPI alone).
- Full branding requires building from this tree; stock `lobehub/lobehub` image only gets avatar
  bind-mount until a custom image is published.
- Privacy is operational: disable analytics keys, prefer Ollama, control egress.
- ADR-015 remains historical context for why a full swap was deferred earlier.
