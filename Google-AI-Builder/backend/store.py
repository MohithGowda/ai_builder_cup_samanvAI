import os
import random
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import JSON, String, UniqueConstraint, create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from backend.domain import DISTRICTS, SERVICES, case_timing, escalation_decision
from backend.jurisdiction import OfficialScope, TALUKS, record_geography, visible_record


class Base(DeclarativeBase):
    pass


class Application(Base):
    __tablename__ = "applications"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class Audit(Base):
    __tablename__ = "audit"
    __table_args__ = (UniqueConstraint("case_id", "kind"),)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    case_id: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(30))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class ChatTurn(Base):
    __tablename__ = "chat_turns"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    citizen_id: Mapped[str] = mapped_column(String(128), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class AssistantMemory(Base):
    __tablename__ = "assistant_memory"
    citizen_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class Store:
    def __init__(self, url: str | None = None):
        data_dir = Path(__file__).parent / "data"
        data_dir.mkdir(exist_ok=True)
        self.engine = create_engine(url or os.getenv("DATABASE_URL") or f"sqlite:///{data_dir / 'samanvai.db'}")
        Base.metadata.create_all(self.engine)

    def seed(self):
        with Session(self.engine) as session:
            if session.scalar(select(Application.id).limit(1)):
                return
            generator = random.Random(42)
            today = date.today()
            services = list(SERVICES)
            names = ["Ananya Rao", "Ravi Kumar", "Meera Devi", "Arjun Patel", "Lakshmi N", "Suresh M", "Fatima Khan", "Kiran R"]
            for index in range(180):
                service = services[index % len(services)]
                district = DISTRICTS[index % len(DISTRICTS)]
                age = generator.randint(0, 62)
                status = generator.choices(["In progress", "Pending review", "Resolved"], [35, 25, 40])[0]
                sla = SERVICES[service]["sla"]
                payload = {
                    "id": f"SAM-{2026}-{1042 + index}", "citizen": names[index % len(names)],
                    "citizen_id": "demo-citizen" if index in (0, 3, 7) else f"citizen-{index}",
                    "service": service, "district": district, "department": SERVICES[service]["department"],
                    "submitted": (today - timedelta(days=age)).isoformat(), "sla": sla,
                    "status": status, "officer": ["Priya Sharma", "Vikram Hegde", "Deepa Rao"][index % 3],
                    "stage": "Completed" if status == "Resolved" else "District verification pending",
                    "resolved_on": (today - timedelta(days=max(0, age - generator.randint(1, sla + 8)))).isoformat() if status == "Resolved" else None,
                    "escalated": False, "documents": ["Application form", "Supporting certificate"],
                }
                if index == 0:
                    payload.update(service="Pension assistance", citizen="Ananya Rao", district="Bengaluru South", department="Social Welfare", sla=30, submitted=(today - timedelta(days=45)).isoformat(), status="Pending review", stage="Revenue verification pending", resolved_on=None)
                session.add(Application(id=payload["id"], payload=payload))
            for index in range(30):
                negative = index % 5 in (0, 1)
                payload = {
                    "id": f"GRV-SEED-{index}", "citizen_id": f"citizen-{index}",
                    "district": DISTRICTS[index % 6], "service": services[index % 5],
                    "message": "Application delayed without an update" if negative else "Helpful officer and timely service",
                    "sentiment": "Negative" if negative else "Positive", "method": "Seeded demo label",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                session.add(Feedback(id=payload["id"], payload=payload))
            session.commit()

    def cases(self, citizen_id: str | None = None, district: str | None = None, scope: OfficialScope | None = None):
        with Session(self.engine) as session:
            rows = [record_geography(row.payload) for row in session.scalars(select(Application))]
        rows = [row for row in rows if (not citizen_id or row["citizen_id"] == citizen_id) and (not district or row["district"] == district) and (not scope or visible_record(row, scope))]
        return [{**row, **case_timing(row)} for row in rows]

    def create_case(self, payload: dict[str, Any]):
        with Session(self.engine) as session:
            session.add(Application(id=payload["id"], payload=payload))
            session.commit()
        return {**payload, **case_timing(payload)}

    def escalate(self, case_id: str, citizen_id: str | None, actor: str, scope: OfficialScope | None = None):
        try:
            with Session(self.engine) as session:
                row = session.scalar(select(Application).where(Application.id == case_id).with_for_update())
                if not row or (citizen_id and row.payload["citizen_id"] != citizen_id) or (scope and not visible_record(record_geography(row.payload), scope)):
                    raise LookupError("Application not found")
                allowed, reason = escalation_decision(row.payload)
                if not allowed:
                    return {"created": False, "message": reason, "case_id": case_id}
                payload = dict(row.payload)
                payload.update(escalated=True, status="Escalated")
                row.payload = payload
                event = {
                    "id": f"ESC-{case_id}", "case_id": case_id, "kind": "escalation", "actor": actor,
                    "created_at": datetime.now(timezone.utc).isoformat(), "district": payload["district"],
                    "message": f"{payload['service']} routed to {payload['department']} supervisor. {reason}",
                    "notification": "Recorded in application inbox; external delivery not configured",
                }
                session.add(Audit(id=event["id"], case_id=case_id, kind="escalation", payload=event))
                session.commit()
                return {"created": True, "message": event["message"], "case_id": case_id, "audit": event}
        except IntegrityError:
            return {"created": False, "message": "An escalation already exists for this application.", "case_id": case_id}

    def audit(self, district: str | None = None, citizen_id: str | None = None, scope: OfficialScope | None = None):
        allowed = {case["id"] for case in self.cases(citizen_id, district, scope)}
        with Session(self.engine) as session:
            rows = [row.payload for row in session.scalars(select(Audit)) if row.case_id in allowed]
        return sorted(rows, key=lambda row: row["created_at"], reverse=True)

    def feedback(self, district: str | None = None, scope: OfficialScope | None = None):
        with Session(self.engine) as session:
            rows = [record_geography(row.payload) for row in session.scalars(select(Feedback))]
        return [row for row in rows if (not district or row["district"] == district) and (not scope or visible_record(row, scope))]

    def add_feedback(self, payload: dict[str, Any]):
        with Session(self.engine) as session:
            session.add(Feedback(id=payload["id"], payload=payload))
            session.commit()
        return payload

    def save_chat(self, turn_id: str, citizen_id: str, payload: dict[str, Any]):
        with Session(self.engine) as session:
            session.add(ChatTurn(id=turn_id, citizen_id=citizen_id, payload=payload))
            session.commit()

    def chat_history(self, citizen_id: str, role: str, district: str | None):
        with Session(self.engine) as session:
            turns = [row.payload for row in session.scalars(select(ChatTurn).where(ChatTurn.citizen_id == citizen_id))]
        matches = [turn for turn in turns if turn["role"] == role and turn.get("district") == district]
        return sorted(matches, key=lambda turn: turn["created_at"])[-20:]

    def assistant_memory(self, citizen_id: str):
        with Session(self.engine) as session:
            row = session.get(AssistantMemory, citizen_id)
            if row and datetime.fromisoformat(row.payload["updated_at"]) < datetime.now(timezone.utc) - timedelta(days=30):
                session.delete(row)
                session.commit()
                row = None
            return deepcopy(row.payload) if row else {"enabled": False, "preferences": {}, "context": {}, "feedback": {}, "votes": {}, "updated_at": None}

    def update_assistant_memory(self, citizen_id: str, enabled: bool | None, preferences: dict[str, str | None]):
        self.assistant_memory(citizen_id)
        with Session(self.engine) as session:
            row = session.scalar(select(AssistantMemory).where(AssistantMemory.citizen_id == citizen_id).with_for_update())
            payload = deepcopy(row.payload) if row else {"enabled": False, "preferences": {}, "context": {}, "feedback": {}, "votes": {}}
            if enabled is not None:
                payload["enabled"] = enabled
            if payload["enabled"]:
                for key, value in preferences.items():
                    if key in ("language", "movement", "district", "detail"):
                        if value is None:
                            payload["preferences"].pop(key, None)
                        else:
                            payload["preferences"][key] = value
            else:
                payload.update(preferences={}, context={}, feedback={}, votes={})
            payload["updated_at"] = datetime.now(timezone.utc).isoformat()
            if row:
                row.payload = payload
            else:
                session.add(AssistantMemory(citizen_id=citizen_id, payload=payload))
            session.commit()
        return self.assistant_memory(citizen_id)

    def remember_assistant_context(self, citizen_id: str, preferences: dict[str, str], context: dict[str, str]):
        with Session(self.engine) as session:
            row = session.scalar(select(AssistantMemory).where(AssistantMemory.citizen_id == citizen_id).with_for_update())
            if not row or not row.payload["enabled"]:
                return
            payload = deepcopy(row.payload)
            payload["preferences"].update({key: value for key, value in preferences.items() if key in ("language", "movement")})
            if context.get("last_service") and context["last_service"] != payload["context"].get("last_service"):
                payload["context"].pop("last_case_id", None)
                payload["context"].pop("last_action", None)
            payload["context"].update({key: value for key, value in context.items() if key in ("last_service", "last_action", "last_case_id")})
            payload["updated_at"] = datetime.now(timezone.utc).isoformat()
            row.payload = payload
            session.commit()

    def assistant_feedback(self, citizen_id: str, request_id: str, source_ids: list[str], helpful: bool):
        self.assistant_memory(citizen_id)
        with Session(self.engine) as session:
            row = session.scalar(select(AssistantMemory).where(AssistantMemory.citizen_id == citizen_id).with_for_update())
            if not row or not row.payload["enabled"]:
                raise ValueError("Enable assistant memory before saving personalized feedback")
            payload = deepcopy(row.payload)
            votes = payload["votes"]
            previous = votes.get(request_id)
            value = 1 if helpful else -1
            if previous:
                for source in previous["sources"]:
                    payload["feedback"][source] = max(-3, min(3, payload["feedback"].get(source, 0) - previous["value"]))
            for source in source_ids:
                payload["feedback"][source] = max(-3, min(3, payload["feedback"].get(source, 0) + value))
            votes[request_id] = {"value": value, "sources": source_ids}
            payload["votes"] = dict(list(votes.items())[-50:])
            payload["updated_at"] = datetime.now(timezone.utc).isoformat()
            row.payload = payload
            session.commit()
        return self.assistant_memory(citizen_id)

    def forget_assistant_memory(self, citizen_id: str):
        with Session(self.engine) as session:
            row = session.get(AssistantMemory, citizen_id)
            if row:
                session.delete(row)
                session.commit()

    def overview(self, district: str | None = None, scope: OfficialScope | None = None):
        cases = self.cases(district=district, scope=scope)
        feedback = self.feedback(district, scope)
        pending = [case for case in cases if case["status"] != "Resolved"]
        overdue = [case for case in pending if case["breached"]]
        resolved = [case for case in cases if case["status"] == "Resolved"]
        trend = []
        for offset in range(13, -1, -1):
            day = (date.today() - timedelta(days=offset)).isoformat()
            trend.append({"date": day, "requests": sum(case["submitted"] == day for case in cases), "resolved": sum(case.get("resolved_on") == day for case in cases)})
        departments = []
        for service in SERVICES:
            group = [case for case in cases if case["service"] == service]
            compliant = sum(not case["breached"] for case in group)
            departments.append({"service": service, "total": len(group), "compliance": round(100 * compliant / len(group)) if group else None, "delayed": sum(case["breached"] and case["status"] != "Resolved" for case in group)})
        districts = []
        for name in DISTRICTS:
            group = [case for case in cases if case["district"] == name]
            complaints = [item for item in feedback if item["district"] == name and item["sentiment"] == "Negative"]
            districts.append({"name": name, "total": len(group), "delayed": sum(case["breached"] and case["status"] != "Resolved" for case in group), "complaints": len(complaints)})
        rated = [item for item in feedback if item["sentiment"] in ("Positive", "Negative")]
        department_summary = []
        for name in dict.fromkeys(details["department"] for details in SERVICES.values()):
            group = [case for case in cases if case["department"] == name]
            if scope and scope.department and scope.department != name:
                continue
            department_summary.append({"name": name, "total": len(group), "resolved": sum(case["status"] == "Resolved" for case in group), "pending": sum(case["status"] != "Resolved" for case in group), "overdue": sum(case["breached"] and case["status"] != "Resolved" for case in group), "compliance": round(100 * sum(not case["breached"] for case in group) / len(group), 1) if group else None})
        territory_field = "taluk" if scope and scope.district else "district"
        territory_names = list(TALUKS[scope.district]) if scope and scope.district else DISTRICTS
        if scope and scope.taluk:
            territory_names = [scope.taluk]
        territories = []
        territory_departments = []
        department_names = list(dict.fromkeys(details["department"] for details in SERVICES.values()))
        if scope and scope.department:
            department_names = [name for name in department_names if name == scope.department]
        for name in territory_names:
            group = [case for case in cases if case.get(territory_field) == name]
            territories.append({"name": name, "total": len(group), "resolved": sum(case["status"] == "Resolved" for case in group), "pending": sum(case["status"] != "Resolved" for case in group), "overdue": sum(case["breached"] and case["status"] != "Resolved" for case in group), "compliance": round(100 * sum(not case["breached"] for case in group) / len(group), 1) if group else None})
            for department_name in department_names:
                department_cases = [case for case in group if case["department"] == department_name]
                territory_departments.append({
                    "territory": name,
                    "department": department_name,
                    "total": len(department_cases),
                    "active": sum(case["status"] != "Resolved" for case in department_cases),
                    "resolved": sum(case["status"] == "Resolved" for case in department_cases),
                    "overdue": sum(case["breached"] and case["status"] != "Resolved" for case in department_cases),
                })
        aging = [{"label": label, "count": sum(low <= case["age"] <= high for case in pending)} for label, low, high in [("0–7 days", 0, 7), ("8–14 days", 8, 14), ("15–30 days", 15, 30), ("31+ days", 31, 100000)]]
        return {
            "total": len(cases), "resolved": len(resolved), "pending": len(pending), "overdue": len(overdue),
            "escalations": sum(case["escalated"] for case in cases),
            "compliance": round(100 * sum(not case["breached"] for case in cases) / len(cases), 1) if cases else None,
            "satisfaction": round(100 * sum(item["sentiment"] == "Positive" for item in rated) / len(rated)) if rated else None,
            "feedback_count": len(feedback), "trend": trend, "services": departments, "districts": districts,
            "delayed_cases": sorted(overdue, key=lambda case: case["delay"], reverse=True),
            "department_summary": department_summary, "territories": territories, "territory_departments": territory_departments, "territory_level": territory_field,
            "aging": aging, "average_delay": round(sum(case["delay"] for case in overdue) / len(overdue), 1) if overdue else 0,
            "unassigned_taluk": sum(case["taluk"] == "Unassigned" for case in cases),
            "scope": scope.payload() if scope else None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }