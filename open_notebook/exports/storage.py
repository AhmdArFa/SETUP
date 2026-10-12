"""Persistent library of generated Studio files (under the data volume)."""

import json
import re
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel

from open_notebook.config import DATA_FOLDER
from open_notebook.exports.content import StudioDocument
from open_notebook.exports.renderers import RENDERERS

STUDIO_DIR = Path(DATA_FOLDER) / "studio"
INDEX = STUDIO_DIR / "index.json"
_lock = threading.Lock()


class StudioFile(BaseModel):
    id: str
    filename: str
    format: str
    kind: str
    title: str
    notebook_id: Optional[str] = None
    notebook_name: str = ""
    theme: str = ""
    size: int = 0
    created: str
    document_id: Optional[str] = None

    @property
    def path(self) -> Path:
        return STUDIO_DIR / f"{self.id}.{self.format}"


def _load() -> List[StudioFile]:
    if not INDEX.exists():
        return []
    try:
        return [StudioFile(**x) for x in json.loads(INDEX.read_text("utf-8"))]
    except Exception:
        return []


def _save(items: List[StudioFile]) -> None:
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    tmp = INDEX.with_suffix(".tmp")
    tmp.write_text(json.dumps([i.model_dump() for i in items], indent=2), "utf-8")
    tmp.replace(INDEX)


def save_document(doc: StudioDocument) -> str:
    """Store the structured document so more formats can be rendered later."""
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    doc_id = uuid.uuid4().hex[:16]
    (STUDIO_DIR / f"doc-{doc_id}.json").write_text(doc.model_dump_json(), "utf-8")
    return doc_id


def load_document(doc_id: str) -> Optional[StudioDocument]:
    if not re.fullmatch(r"[a-f0-9]{16}", doc_id or ""):
        return None
    p = STUDIO_DIR / f"doc-{doc_id}.json"
    if not p.exists():
        return None
    return StudioDocument.model_validate_json(p.read_text("utf-8"))


def store_file(
    doc: StudioDocument,
    fmt: str,
    notebook_id: Optional[str] = None,
    document_id: Optional[str] = None,
) -> StudioFile:
    fn, _media, ext = RENDERERS[fmt]
    data = fn(doc)
    slug = re.sub(r"[^A-Za-z0-9]+", "-", doc.title).strip("-")[:60] or "document"
    item = StudioFile(
        id=uuid.uuid4().hex[:16],
        filename=f"{slug}.{ext}",
        format=ext,
        kind=doc.kind,
        title=doc.title,
        notebook_id=notebook_id,
        notebook_name=doc.notebook_name,
        theme=doc.options.theme if doc.options else "",
        size=len(data),
        created=datetime.now().isoformat(timespec="seconds"),
        document_id=document_id,
    )
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    item.path.write_bytes(data)
    with _lock:
        items = _load()
        items.insert(0, item)
        _save(items)
    return item


def list_files(notebook_id: Optional[str] = None) -> List[StudioFile]:
    items = _load()
    return [i for i in items if not notebook_id or i.notebook_id == notebook_id]


def get_file(file_id: str) -> Optional[StudioFile]:
    return next((i for i in _load() if i.id == file_id), None)


def delete_file(file_id: str) -> bool:
    with _lock:
        items = _load()
        item = next((i for i in items if i.id == file_id), None)
        if not item:
            return False
        item.path.unlink(missing_ok=True)
        _save([i for i in items if i.id != file_id])
    return True
