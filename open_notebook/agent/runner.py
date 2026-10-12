"""MCIT LM assistant: a tool-calling agent that can operate the whole app.

Runs are executed as background asyncio tasks so long multi-file jobs do not
hit HTTP timeouts. The UI polls /api/agent/runs/{id} for streamed events.
"""

import asyncio
import json
import re
import time
import uuid
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from loguru import logger

from open_notebook.agent.skills import compact_writing_rules
from open_notebook.agent.tools import ToolContext, build_tools
from open_notebook.ai.provision import provision_langchain_model

MAX_STEPS = 14
RUN_TTL_SECONDS = 6 * 3600

SYSTEM_PROMPT = """You are the MCIT LM assistant for the Ministry of Communications and Information Technology.
You operate the MCIT LM notebook app for the user through tools. You can create notebooks, add sources
(web pages, YouTube links, pasted text), read and search them, save notes, generate professional files
(PDF reports, PowerPoint presentations, infographics, executive summaries in PDF, DOCX, PPTX, SVG, HTML, MD)
and start podcasts.

How to work:
- Act, do not ask for permission. If the user asks for a file, call generate_file. For several files, call it once per file.
- If no notebook is given and the task needs one, use the current notebook; otherwise list_notebooks and pick the
  best match by name, or create_notebook when the user supplies new material.
- Always pass the exact notebook id returned by create_notebook or list_notebooks (it looks like notebook:abc123).
  Do things in order: create the notebook, add sources, then generate files.
- When the user gives URLs or text to work from, add each one with add_source before generating.
- To answer questions about content, use read_notebook or search_knowledge and cite source titles.
- Map user wording to options: "slides"/"deck" -> presentation; "report" -> report (pdf); "word"/"docx" -> docx;
  "infographic"/"visual" -> infographic; "summary"/"brief" -> summary. Pass slide_count, theme, tone, audience if mentioned.
- After tools finish, reply with a short plain summary of what you did and list the files produced. Do not paste file contents.
- Never invent facts, numbers or sources.
{rules}
{context}"""

_runs: Dict[str, Dict[str, Any]] = {}


def _cleanup() -> None:
    now = time.time()
    for rid in [r for r, v in _runs.items() if now - v["created"] > RUN_TTL_SECONDS]:
        _runs.pop(rid, None)


def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    return _runs.get(run_id)


def _emit(run: Dict[str, Any], kind: str, **data) -> None:
    run["events"].append(
        {"seq": len(run["events"]), "type": kind, "ts": time.time(), **data}
    )


_TEXT_CALL = re.compile(
    r"\{\s*\"name\"\s*:\s*\"(\w+)\"\s*,\s*\"arguments\"\s*:\s*(\{.*?\})\s*\}", re.S
)


def _fallback_tool_calls(content: str, names: set) -> List[Dict[str, Any]]:
    """Some small models print tool calls as JSON text instead of native calls."""
    calls = []
    for m in _TEXT_CALL.finditer(content or ""):
        if m.group(1) in names:
            try:
                calls.append(
                    {
                        "name": m.group(1),
                        "args": json.loads(m.group(2)),
                        "id": uuid.uuid4().hex[:8],
                    }
                )
            except json.JSONDecodeError:
                continue
    return calls


async def _execute(
    run: Dict[str, Any],
    messages: List[Dict[str, str]],
    notebook_id: Optional[str],
    auth: Optional[str],
) -> None:
    async def on_file(meta: Dict[str, Any]) -> None:
        _emit(run, "file", file=meta)

    ctx = ToolContext(auth, on_file, notebook_id)
    tools = build_tools(ctx)
    by_name = {t.name: t for t in tools}
    context = ""
    if notebook_id:
        try:
            from open_notebook.domain.notebook import Notebook

            nb = await Notebook.get(notebook_id)
            context = f"Current notebook: {nb.name} (id {nb.id})."
        except Exception:
            context = f"Current notebook id: {notebook_id}."
    rules = compact_writing_rules()
    system = SYSTEM_PROMPT.format(rules=rules, context=context)

    history: List[Any] = [SystemMessage(content=system)]
    for m in messages[-12:]:
        if m.get("role") == "user":
            history.append(HumanMessage(content=m.get("content", "")))
        elif m.get("role") == "assistant" and m.get("content"):
            history.append(AIMessage(content=m["content"]))

    llm = await provision_langchain_model(
        system + json.dumps(messages[-12:]), None, "tools", max_tokens=1500
    )
    bound = llm.bind_tools(tools)

    for step in range(MAX_STEPS):
        _emit(run, "thinking", step=step)
        reply = await bound.ainvoke(history)
        calls = list(getattr(reply, "tool_calls", None) or [])
        if not calls:
            calls = _fallback_tool_calls(str(reply.content), set(by_name))
            if calls:
                reply = AIMessage(content="", tool_calls=calls)
        history.append(reply)
        if not calls:
            text = str(reply.content).strip() or "Done."
            _emit(run, "message", content=text)
            return
        for call in calls:
            name, args = call["name"], call.get("args") or {}
            _emit(run, "tool_call", name=name, args=args, call_id=call.get("id"))
            tool = by_name.get(name)
            try:
                if not tool:
                    raise RuntimeError(f"Unknown tool {name}")
                result = await tool.ainvoke(args)
                ok = True
            except Exception as e:  # report the failure to the model so it can recover
                logger.warning(f"Agent tool {name} failed: {e}")
                result, ok = f"ERROR: {e}", False
            result_s = str(result)
            _emit(
                run,
                "tool_result",
                name=name,
                ok=ok,
                result=result_s[:1500],
                call_id=call.get("id"),
            )
            history.append(
                ToolMessage(
                    content=result_s[:6000], tool_call_id=call.get("id") or name
                )
            )
    _emit(
        run,
        "message",
        content="I stopped after the maximum number of steps. The files produced so far are listed above.",
    )


async def _run_wrapper(run: Dict[str, Any], messages, notebook_id, auth) -> None:
    try:
        await _execute(run, messages, notebook_id, auth)
        run["status"] = "completed"
    except Exception as e:
        logger.exception(e)
        _emit(run, "error", message=str(e))
        run["status"] = "failed"
    finally:
        run["finished"] = time.time()


def start_run(
    messages: List[Dict[str, str]], notebook_id: Optional[str], auth: Optional[str]
) -> Dict[str, Any]:
    _cleanup()
    run = {
        "id": uuid.uuid4().hex,
        "status": "running",
        "created": time.time(),
        "events": [],
        "notebook_id": notebook_id,
    }
    _runs[run["id"]] = run
    run["task"] = asyncio.create_task(_run_wrapper(run, messages, notebook_id, auth))
    return run
