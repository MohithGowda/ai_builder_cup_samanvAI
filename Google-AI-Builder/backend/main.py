import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.agents import build_workflow
from backend.assistant import answer_assistant
from backend.domain import DISTRICTS, SERVICES, pension_eligibility
from backend.store import Store
from backend.retrieval import knowledge
from backend.jurisdiction import DEPARTMENTS, OFFICIAL_ROLES, TALUKS, resolve_scope
from backend.speech import capabilities as speech_capabilities, synthesize


app = FastAPI(title="SamanvAI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","), allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type", "X-Demo-Profile"])
store = Store()
if os.getenv("SEED_DEMO", "true").lower() == "true":
    store.seed()
workflow = build_workflow(store)
AUTH_MODE = os.getenv("AUTH_MODE", "demo")
if AUTH_MODE not in ("demo", "firebase"):
    raise RuntimeError("AUTH_MODE must be demo or firebase")


def identity(authorization: str | None = Header(default=None), x_demo_profile: str = Header(default="chief_secretary")) -> dict[str, Any]:
    if AUTH_MODE == "demo":
        profiles = {
            "chief_secretary": {"official_role": "chief_secretary"},
            "deputy_commissioner": {"official_role": "deputy_commissioner", "district": "Mysuru"},
            "tahsildar": {"official_role": "tahsildar", "district": "Mysuru", "taluk": "Hunsur", "department": "Revenue"},
            "department_officer": {"official_role": "department_officer", "department": "Transport"},
            "citizen": {},
        }
        if x_demo_profile not in profiles:
            raise HTTPException(422, "Unknown synthetic demo profile")
        return {"uid": "demo-citizen", "government": x_demo_profile != "citizen", "name": "Ananya Rao", **profiles[x_demo_profile]}
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in with Firebase to continue")
    try:
        import firebase_admin
        from firebase_admin import auth

        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        return auth.verify_id_token(authorization.removeprefix("Bearer "), check_revoked=True)
    except Exception:
        raise HTTPException(401, "Invalid or expired identity token") from None


def government(user: dict[str, Any] = Depends(identity)):
    if user.get("government") is not True:
        raise HTTPException(403, "Government access required")
    return user


def valid_district(district: str | None):
    if district and district not in DISTRICTS:
        raise HTTPException(422, "Unknown district")
    return district


class Profile(BaseModel):
    age: int = Field(ge=0, le=120)
    annual_income: int = Field(ge=0, le=100000000)
    region: Literal["Karnataka", "Other"]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    role: Literal["citizen", "government"] = "citizen"
    district: str | None = None
    taluk: str | None = None
    department: str | None = None
    allow_escalation: bool = False
    profile: Profile | None = None


class ApplicationRequest(BaseModel):
    service: str
    district: str
    taluk: str | None = None


class EscalationRequest(BaseModel):
    case_id: str = Field(min_length=1, max_length=40)


class GrievanceRequest(BaseModel):
    service: str
    district: str
    taluk: str | None = None
    message: str = Field(min_length=10, max_length=2000)


class AssistantTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1600)


class AssistantSessionContext(BaseModel):
    service: str | None = None
    case_id: str | None = Field(default=None, pattern=r"^SAM-\d{4}-[A-Z0-9]+$")
    action: Literal["services", "apply", "eligibility", "track", "grievance"] | None = None


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000, pattern=r"\S")
    language: Literal["en-IN", "hi-IN", "kn-IN"] = "en-IN"
    history: list[AssistantTurn] = Field(default_factory=list, max_length=6)
    movement: Literal["walk", "run", "jump"] = "walk"
    context: AssistantSessionContext | None = None


class AssistantPreferences(BaseModel):
    language: Literal["en-IN", "hi-IN", "kn-IN"] | None = None
    movement: Literal["walk", "run", "jump"] | None = None
    district: str | None = None
    detail: Literal["brief", "detailed"] | None = None


class AssistantMemoryRequest(BaseModel):
    enabled: bool | None = None
    preferences: AssistantPreferences = Field(default_factory=AssistantPreferences)


class AssistantFeedbackRequest(BaseModel):
    request_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    source_ids: list[str] = Field(min_length=1, max_length=3)
    helpful: bool


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    language: Literal["en-IN", "hi-IN", "kn-IN"]


@app.get("/api/speech/capabilities")
def get_speech_capabilities(user: dict[str, Any] = Depends(identity)):
    return speech_capabilities()


@app.post("/api/speech/synthesize")
def speech(body: SpeechRequest, user: dict[str, Any] = Depends(identity)):
    return Response(synthesize(body.text, body.language, user["uid"]), media_type="audio/mpeg", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


def assistant_memory_view(user: dict[str, Any]):
    memory = store.assistant_memory(user["uid"])
    return {key: memory[key] for key in ("enabled", "preferences", "context", "updated_at")} | {"feedback_sources": len(memory["feedback"]), "retention_days": 30, "shared_demo": AUTH_MODE == "demo"}


@app.get("/api/assistant/memory")
def get_assistant_memory(user: dict[str, Any] = Depends(identity)):
    return assistant_memory_view(user)


@app.post("/api/assistant/memory")
def update_assistant_memory(body: AssistantMemoryRequest, user: dict[str, Any] = Depends(identity)):
    preferences = body.preferences.model_dump(exclude_unset=True)
    if "district" in preferences:
        valid_district(preferences["district"])
    store.update_assistant_memory(user["uid"], body.enabled, preferences)
    return assistant_memory_view(user)


@app.post("/api/assistant/memory/forget")
def forget_assistant_memory(user: dict[str, Any] = Depends(identity)):
    store.forget_assistant_memory(user["uid"])
    return assistant_memory_view(user)


@app.post("/api/assistant/feedback")
def assistant_feedback(body: AssistantFeedbackRequest, user: dict[str, Any] = Depends(identity)):
    if any(identifier not in knowledge().documents for identifier in body.source_ids):
        raise HTTPException(422, "Unknown knowledge source")
    try:
        store.assistant_feedback(user["uid"], body.request_id, list(dict.fromkeys(body.source_ids)), body.helpful)
    except ValueError as error:
        raise HTTPException(409, str(error)) from None
    return assistant_memory_view(user)


@app.post("/api/assistant")
def assistant(body: AssistantRequest, user: dict[str, Any] = Depends(identity)):
    if body.context and body.context.service and body.context.service not in SERVICES:
        raise HTTPException(422, "Unknown context service")
    return answer_assistant(store, user["uid"], body.message.strip(), body.language, [turn.model_dump() for turn in body.history], body.movement, body.context.model_dump(exclude_none=True) if body.context else None)


@app.get("/api/health")
def health():
    return {"status": "ok", "auth": AUTH_MODE, "data": "synthetic demo" if os.getenv("SEED_DEMO", "true").lower() == "true" else "unseeded", "gemini": bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() == "true"), "storage": "PostgreSQL / AlloyDB-compatible" if store.engine.dialect.name == "postgresql" else "SQLite", "orchestration": "LangGraph"}


@app.get("/api/me")
def me(user: dict[str, Any] = Depends(identity)):
    official_scope = resolve_scope(user).payload() if user.get("government") is True else None
    return {"uid": user["uid"], "name": user.get("name", "Citizen"), "government": user.get("government") is True, "official_scope": official_scope, "demo": AUTH_MODE == "demo", "designation": official_scope["designation"] if official_scope else "Citizen"}


@app.get("/api/services")
def services(user: dict[str, Any] = Depends(identity)):
    scope = resolve_scope(user) if user.get("government") is True else None
    available_districts = [scope.district] if scope and scope.district else DISTRICTS
    return {"services": [{"name": name, **details} for name, details in SERVICES.items()], "districts": available_districts, "taluks": {district: [scope.taluk] if scope and scope.taluk else TALUKS[district] for district in available_districts}, "departments": [scope.department] if scope and scope.department else DEPARTMENTS}


@app.get("/api/overview")
def overview(district: str | None = None, taluk: str | None = None, department: str | None = None, user: dict[str, Any] = Depends(government)):
    return store.overview(scope=resolve_scope(user, district, taluk, department))


@app.get("/api/reports/summary")
def overall_report(district: str | None = None, taluk: str | None = None, department: str | None = None, user: dict[str, Any] = Depends(government)):
    result = store.overview(scope=resolve_scope(user, district, taluk, department))
    return {"schema": "samanvai-review-report.v1", "title": "Public service delivery review", "scope": result["scope"], "summary": {key: result[key] for key in ("total", "resolved", "pending", "overdue", "compliance", "satisfaction", "average_delay")}, "departments": result["department_summary"], "territories": result["territories"], "services": result["services"], "trend": result["trend"], "updated_at": result["updated_at"], "data_notice": "Synthetic six-district Karnataka pilot. Derived taluk assignments are illustrative, not government records.", "definitions": {"compliance": "Share of selected open and completed cases within service-specific deadlines", "overdue": "Unresolved cases beyond their deadline", "satisfaction": "Positive / (positive + negative) labeled feedback"}}


@app.get("/api/cases")
def cases(scope: Literal["citizen", "government"] = "citizen", district: str | None = None, taluk: str | None = None, department: str | None = None, user: dict[str, Any] = Depends(identity)):
    if scope == "government" and user.get("government") is not True:
        raise HTTPException(403, "Government access required")
    if scope == "government":
        return store.cases(scope=resolve_scope(user, district, taluk, department))
    return store.cases(user["uid"], valid_district(district))


@app.get("/api/audit")
def audit(scope: Literal["citizen", "government"] = "citizen", district: str | None = None, taluk: str | None = None, department: str | None = None, user: dict[str, Any] = Depends(identity)):
    if scope == "government" and user.get("government") is not True:
        raise HTTPException(403, "Government access required")
    if scope == "government":
        return store.audit(scope=resolve_scope(user, district, taluk, department))
    return store.audit(valid_district(district), user["uid"])


@app.post("/api/applications", status_code=201)
def create_application(body: ApplicationRequest, user: dict[str, Any] = Depends(identity)):
    if body.service not in SERVICES:
        raise HTTPException(422, "Unknown service")
    valid_district(body.district)
    if body.taluk and body.taluk not in TALUKS[body.district]:
        raise HTTPException(422, "Unknown taluk for this district")
    service = SERVICES[body.service]
    return store.create_case({"id": f"SAM-{date.today().year}-{uuid4().hex[:8].upper()}", "citizen": user.get("name", "Citizen"), "citizen_id": user["uid"], "service": body.service, "district": body.district, "taluk": body.taluk or "Unassigned", "department": service["department"], "sla": service["sla"], "submitted": date.today().isoformat(), "status": "Pending review", "stage": "Document review pending", "officer": "Intake desk", "escalated": False, "resolved_on": None, "documents": []})


@app.post("/api/eligibility")
def eligibility(body: Profile, user: dict[str, Any] = Depends(identity)):
    return pension_eligibility(body.age, body.annual_income, body.region)


@app.post("/api/escalations")
def escalate(body: EscalationRequest, user: dict[str, Any] = Depends(identity)):
    try:
        return store.escalate(body.case_id, None if user.get("government") is True else user["uid"], user["uid"], resolve_scope(user) if user.get("government") is True else None)
    except LookupError:
        raise HTTPException(404, "Application not found") from None


@app.post("/api/grievances", status_code=201)
def grievance(body: GrievanceRequest, user: dict[str, Any] = Depends(identity)):
    if body.service not in SERVICES:
        raise HTTPException(422, "Unknown service")
    valid_district(body.district)
    if body.taluk and body.taluk not in TALUKS[body.district]:
        raise HTTPException(422, "Unknown taluk for this district")
    words = set(re.findall(r"\w+", body.message.lower()))
    negative = len(words & {"delay", "delayed", "pending", "poor", "bad", "frustrated", "broken", "complaint", "unhappy"})
    positive = len(words & {"helpful", "good", "excellent", "thanks", "timely", "resolved", "happy"})
    sentiment = "Negative" if negative > positive else "Positive" if positive > negative else "Neutral"
    return store.add_feedback({"id": f"GRV-{uuid4().hex[:8].upper()}", "citizen_id": user["uid"], "district": body.district, "taluk": body.taluk or "Unassigned", "department": SERVICES[body.service]["department"], "service": body.service, "message": body.message, "sentiment": sentiment, "method": "Lexicon baseline (may misinterpret negation); not a Gemini assessment", "created_at": datetime.now(timezone.utc).isoformat()})


@app.post("/api/chat")
def chat(body: ChatRequest, user: dict[str, Any] = Depends(identity)):
    if body.role == "government" and user.get("government") is not True:
        raise HTTPException(403, "Government access required")
    scope = resolve_scope(user, body.district, body.taluk, body.department) if body.role == "government" else None
    state = workflow.invoke({"message": body.message, "role": body.role, "citizen_id": user["uid"], "district": valid_district(body.district), "official_scope": scope, "allow_escalation": body.allow_escalation, "profile": body.profile.model_dump() if body.profile else None, "trace": [], "evidence": {}})
    result = {key: state[key] for key in ("answer", "engine", "trace", "evidence")}
    store.save_chat(uuid4().hex, user["uid"], {"question": body.message, "result": result, "role": body.role, "district": scope.district if scope else body.district, "official_scope": scope.payload() if scope else None, "created_at": datetime.now(timezone.utc).isoformat()})
    return result


@app.get("/api/chat/history")
def chat_history(role: Literal["citizen", "government"] = "citizen", district: str | None = None, taluk: str | None = None, department: str | None = None, user: dict[str, Any] = Depends(identity)):
    if role == "government" and user.get("government") is not True:
        raise HTTPException(403, "Government access required")
    if role == "government":
        scope = resolve_scope(user, district, taluk, department)
        rows = store.chat_history(user["uid"], role, scope.district)
        return [row for row in rows if row.get("official_scope") == scope.payload()]
    return store.chat_history(user["uid"], role, valid_district(district))


frontend = Path(__file__).resolve().parent.parent / "dist"
if frontend.is_dir():
    app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")