"""Assistant (agent) and skills API."""

from typing import List, Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from open_notebook.agent import runner, skills

router = APIRouter()


class AgentMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AgentRunRequest(BaseModel):
    messages: List[AgentMessage]
    notebook_id: Optional[str] = None


@router.post("/agent/runs")
async def create_run(body: AgentRunRequest, request: Request):
    if not body.messages or body.messages[-1].role != "user":
        raise HTTPException(
            status_code=400, detail="The last message must come from the user"
        )
    run = runner.start_run(
        [m.model_dump() for m in body.messages],
        body.notebook_id,
        request.headers.get("Authorization"),
    )
    return {"id": run["id"], "status": run["status"]}


@router.get("/agent/runs/{run_id}")
async def get_run(run_id: str, after: int = -1):
    run = runner.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "id": run["id"],
        "status": run["status"],
        "events": [e for e in run["events"] if e["seq"] > after],
    }


@router.post("/agent/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    run = runner.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    task = run.get("task")
    if task and not task.done():
        task.cancel()
    run["status"] = "cancelled"
    return {"id": run_id, "status": "cancelled"}


class SkillCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    instructions: str = Field(min_length=1, max_length=8000)
    description: str = ""
    source_url: str = ""


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    instructions: Optional[str] = None
    description: Optional[str] = None
    source_url: Optional[str] = None
    enabled: Optional[bool] = None


@router.get("/agent/skills", response_model=List[skills.Skill])
async def list_skills():
    return skills.list_skills()


@router.post("/agent/skills", response_model=skills.Skill)
async def create_skill(body: SkillCreate):
    return skills.create_skill(
        body.name, body.instructions, body.description, body.source_url
    )


@router.patch("/agent/skills/{skill_id}", response_model=skills.Skill)
async def update_skill(skill_id: str, body: SkillUpdate):
    s = skills.update_skill(skill_id, **body.model_dump())
    if not s:
        raise HTTPException(status_code=404, detail="Skill not found")
    return s


@router.delete("/agent/skills/{skill_id}")
async def delete_skill(skill_id: str):
    if not skills.delete_skill(skill_id):
        raise HTTPException(
            status_code=400,
            detail="Built-in skills cannot be deleted; disable them instead",
        )
    return {"deleted": skill_id}
