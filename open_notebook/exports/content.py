"""MCIT LM Studio: turn a notebook's sources and notes into a structured document.

One LLM call (the notebook's default chat model, local Ollama by default)
produces a JSON document. Every renderer (PDF, DOCX, PPTX, SVG, HTML, MD)
consumes that same structure, so a user can generate once and download in
any format.
"""

import json
import re
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from loguru import logger
from pydantic import BaseModel, Field

from open_notebook.ai.provision import provision_langchain_model
from open_notebook.domain.notebook import Notebook
from open_notebook.exceptions import InvalidInputError

ExportKind = Literal["report", "presentation", "infographic", "summary"]

# qwen2.5:7b runs with an 8k-token window through Esperanto's Ollama default,
# so keep the source material comfortably below that.
MAX_CONTEXT_CHARS = 18_000


class Stat(BaseModel):
    value: str
    label: str


class Section(BaseModel):
    heading: str
    body: str = ""
    bullets: List[str] = Field(default_factory=list)


class StudioDocument(BaseModel):
    kind: ExportKind = "report"
    title: str
    subtitle: str = ""
    summary: str = ""
    key_points: List[str] = Field(default_factory=list)
    stats: List[Stat] = Field(default_factory=list)
    sections: List[Section] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    conclusion: str = ""
    sources: List[str] = Field(default_factory=list)
    notebook_name: str = ""
    generated_at: str = Field(
        default_factory=lambda: datetime.now().strftime("%d %B %Y")
    )


KIND_GUIDANCE: Dict[str, str] = {
    "report": (
        "Write a formal government research report. 4-6 sections, each with a "
        "2-4 sentence body and 2-5 bullets. Include 3-5 recommendations."
    ),
    "presentation": (
        "Write a slide deck. Each section is one slide: a short slide title as "
        "heading, a one-sentence body, and 3-5 concise bullets (max 12 words "
        "each). 5-8 sections."
    ),
    "infographic": (
        "Write content for a one-page infographic. 3-6 stats with short numeric "
        "or factual values taken from the sources, 3-4 sections with a very "
        "short body (max 25 words) and no more than 3 bullets each."
    ),
    "summary": (
        "Write an executive summary: a strong 4-6 sentence summary, 5-8 key "
        "points, 1-3 short sections, and a brief conclusion."
    ),
}

SCHEMA_HINT = """{
  "title": "string",
  "subtitle": "string",
  "summary": "string",
  "key_points": ["string"],
  "stats": [{"value": "string", "label": "string"}],
  "sections": [{"heading": "string", "body": "string", "bullets": ["string"]}],
  "recommendations": ["string"],
  "conclusion": "string"
}"""


async def gather_notebook_material(notebook: Notebook) -> tuple[str, List[str]]:
    sources = await notebook.get_sources(include_full_text=True)
    notes = await notebook.get_notes(include_content=True)
    parts: List[str] = []
    titles: List[str] = []
    for s in sources:
        text = (getattr(s, "full_text", None) or "").strip()
        title = s.title or "Untitled source"
        titles.append(title)
        if text:
            parts.append(f"## Source: {title}\n{text}")
    for n in notes:
        content = (getattr(n, "content", None) or "").strip()
        if content:
            parts.append(f"## Note: {n.title or 'Untitled note'}\n{content}")
    material = "\n\n".join(parts)
    if len(material) > MAX_CONTEXT_CHARS:
        material = material[:MAX_CONTEXT_CHARS] + "\n\n[...truncated...]"
    return material, titles


def _extract_json(text: str) -> Dict[str, Any]:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, flags=re.S)
    candidate = fenced.group(1) if fenced else text
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model output")
    return json.loads(candidate[start : end + 1])


def _coerce(data: Dict[str, Any]) -> Dict[str, Any]:
    """Tolerate small-model schema drift (strings vs lists, missing keys)."""

    def as_list(v: Any) -> List[str]:
        if v is None:
            return []
        if isinstance(v, str):
            return [v] if v.strip() else []
        return [str(x) if not isinstance(x, dict) else " ".join(map(str, x.values())) for x in v]

    out: Dict[str, Any] = {
        "title": str(data.get("title") or "Untitled"),
        "subtitle": str(data.get("subtitle") or ""),
        "summary": str(data.get("summary") or ""),
        "key_points": as_list(data.get("key_points")),
        "recommendations": as_list(data.get("recommendations")),
        "conclusion": str(data.get("conclusion") or ""),
        "stats": [],
        "sections": [],
    }
    for st in data.get("stats") or []:
        if isinstance(st, dict) and st.get("value"):
            out["stats"].append({"value": str(st["value"]), "label": str(st.get("label", ""))})
    for sec in data.get("sections") or []:
        if isinstance(sec, dict):
            out["sections"].append(
                {
                    "heading": str(sec.get("heading") or sec.get("title") or ""),
                    "body": str(sec.get("body") or sec.get("content") or ""),
                    "bullets": as_list(sec.get("bullets")),
                }
            )
    return out


async def generate_document(
    notebook: Notebook,
    kind: ExportKind,
    instructions: Optional[str] = None,
    model_id: Optional[str] = None,
) -> StudioDocument:
    material, titles = await gather_notebook_material(notebook)
    if not material.strip():
        raise InvalidInputError(
            "This notebook has no processed source text or notes to work from yet."
        )

    prompt = f"""You are a senior analyst at the Ministry of Communications and Information Technology (MCIT).
Using ONLY the material below, produce content for a {kind}.
{KIND_GUIDANCE[kind]}
Write in professional, formal English. Do not invent facts that are not in the material.
{f"Additional instructions from the user: {instructions}" if instructions else ""}

Return ONLY one JSON object, no commentary, matching exactly this schema:
{SCHEMA_HINT}

Notebook: {notebook.name}

MATERIAL:
{material}
"""
    llm = await provision_langchain_model(
        prompt, model_id, "transformation", max_tokens=3000
    )
    raw = ""
    for attempt in range(2):
        response = await llm.ainvoke(prompt)
        raw = response.content if isinstance(response.content, str) else str(response.content)
        try:
            data = _coerce(_extract_json(raw))
            return StudioDocument(
                kind=kind, sources=titles, notebook_name=notebook.name, **data
            )
        except Exception as e:  # malformed JSON from a small model: retry once
            logger.warning(f"Studio JSON parse failed (attempt {attempt + 1}): {e}")
    # Last resort: keep the text rather than fail the whole job
    return StudioDocument(
        kind=kind,
        title=notebook.name,
        summary=raw[:4000],
        sources=titles,
        notebook_name=notebook.name,
    )
