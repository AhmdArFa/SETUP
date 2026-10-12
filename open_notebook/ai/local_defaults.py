"""MCIT LM: zero-cloud default model bootstrap.

On API startup, register the local Ollama models (via the existing ``ollama``
provider, configured through ``OLLAMA_API_BASE``) and assign them as defaults
for any slot that is still empty. Existing user choices are never overwritten.
"""

import os

from loguru import logger

from open_notebook.ai.models import DefaultModels, Model
from open_notebook.database.repository import ensure_record_id, repo_query


async def _ensure_model(name: str, model_type: str) -> str:
    rows = await repo_query(
        "SELECT * FROM model WHERE provider='ollama' AND name=$name AND type=$type;",
        {"name": name, "type": model_type},
    )
    if rows:
        return str(rows[0]["id"])
    model = Model(name=name, provider="ollama", type=model_type)
    await model.save()
    logger.info(f"Registered local Ollama {model_type} model '{name}'")
    return str(model.id)


async def bootstrap_local_models() -> None:
    if os.environ.get("MCIT_LOCAL_LLM_BOOTSTRAP", "true").lower() in ("0", "false", "no"):
        return
    llm = os.environ.get("OLLAMA_CHAT_MODEL", "qwen2.5:7b").strip()
    embed = os.environ.get("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text").strip()

    llm_id = await _ensure_model(llm, "language")
    embed_id = await _ensure_model(embed, "embedding") if embed else None

    defaults = await DefaultModels.get_instance()
    wanted = {
        "default_chat_model": llm_id,
        "default_transformation_model": llm_id,
        "large_context_model": llm_id,
        "default_tools_model": llm_id,
        "default_embedding_model": embed_id,
    }
    patch = {k: v for k, v in wanted.items() if v and not getattr(defaults, k, None)}
    if patch:
        await repo_query(
            "UPSERT $record_id MERGE $data;",
            {"record_id": ensure_record_id(DefaultModels.record_id), "data": patch},
        )
        logger.info(f"Assigned local default models: {sorted(patch)}")
