"""MCIT LM Studio: generate reports, presentations, infographics and summaries
from a notebook, then download them in any supported format."""

import re
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from loguru import logger
from pydantic import BaseModel

from open_notebook.domain.notebook import Notebook
from open_notebook.exceptions import OpenNotebookError
from open_notebook.exports.content import ExportKind, StudioDocument, generate_document
from open_notebook.exports.renderers import RENDERERS

router = APIRouter()

ExportFormat = Literal["pdf", "docx", "pptx", "svg", "html", "md", "txt", "json"]


class StudioGenerateRequest(BaseModel):
    notebook_id: str
    kind: ExportKind = "report"
    instructions: Optional[str] = None
    model_id: Optional[str] = None


class StudioRenderRequest(BaseModel):
    document: StudioDocument
    format: ExportFormat = "pdf"


@router.get("/studio/formats")
async def studio_formats():
    return {
        "kinds": ["report", "presentation", "infographic", "summary"],
        "formats": list(RENDERERS.keys()),
    }


@router.post("/studio/generate", response_model=StudioDocument)
async def studio_generate(request: StudioGenerateRequest):
    notebook = await Notebook.get(request.notebook_id)
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")
    try:
        return await generate_document(
            notebook, request.kind, request.instructions, request.model_id
        )
    except OpenNotebookError:
        raise
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")


@router.post("/studio/render")
async def studio_render(request: StudioRenderRequest):
    fn, media_type, ext = RENDERERS[request.format]
    try:
        data = fn(request.document)
    except Exception as e:
        logger.exception(e)
        raise HTTPException(status_code=500, detail=f"Rendering failed: {e}")
    slug = re.sub(r"[^A-Za-z0-9]+", "-", request.document.title).strip("-")[:60] or "mcit-lm"
    filename = f"MCIT-LM-{request.document.kind}-{slug}.{ext}"
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
