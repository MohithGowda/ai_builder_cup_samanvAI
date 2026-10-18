import re
from dataclasses import asdict, dataclass
from typing import Any

from fastapi import HTTPException

from backend.domain import DISTRICTS, SERVICES


TALUKS = {
    "Bengaluru South": ["Bengaluru South", "Anekal"],
    "Bengaluru North": ["Bengaluru North", "Yelahanka"],
    "Mysuru": ["Mysuru", "Nanjangud", "Hunsur"],
    "Mandya": ["Mandya", "Maddur", "Srirangapatna"],
    "Tumakuru": ["Tumakuru", "Gubbi", "Tiptur"],
    "Ramanagara": ["Ramanagara", "Channapatna", "Kanakapura"],
}
DEPARTMENTS = list(dict.fromkeys(service["department"] for service in SERVICES.values()))
OFFICIAL_ROLES = {
    "chief_secretary": "Chief Secretary",
    "deputy_commissioner": "Deputy Commissioner",
    "tahsildar": "Tahsildar",
    "department_officer": "Department Officer",
}


@dataclass(frozen=True)
class OfficialScope:
    role: str
    designation: str
    level: str
    district: str | None = None
    taluk: str | None = None
    department: str | None = None

    def payload(self):
        return asdict(self)


def resolve_scope(user: dict[str, Any], district: str | None = None, taluk: str | None = None, department: str | None = None) -> OfficialScope:
    if user.get("government") is not True:
        raise HTTPException(403, "Government access required")
    role = user.get("official_role")
    if role not in OFFICIAL_ROLES:
        raise HTTPException(403, "A verified official role and jurisdiction are required")
    assigned_district = user.get("district")
    assigned_taluk = user.get("taluk")
    assigned_department = user.get("department")
    if role in ("deputy_commissioner", "tahsildar") and assigned_district not in DISTRICTS:
        raise HTTPException(403, "Official district assignment is missing")
    if role == "tahsildar" and assigned_taluk not in TALUKS.get(assigned_district, []):
        raise HTTPException(403, "Official taluk assignment is missing")
    if assigned_district and assigned_district not in DISTRICTS:
        raise HTTPException(403, "Invalid official district assignment")
    if assigned_taluk and assigned_taluk not in TALUKS.get(assigned_district, []):
        raise HTTPException(403, "Invalid official taluk assignment")
    if role == "department_officer" and assigned_department not in DEPARTMENTS:
        raise HTTPException(403, "Official department assignment is missing")
    if assigned_department and assigned_department not in DEPARTMENTS:
        raise HTTPException(403, "Invalid official department assignment")
    if assigned_district and district and district != assigned_district:
        raise HTTPException(403, "This district is outside your assigned jurisdiction")
    if assigned_taluk and taluk and taluk != assigned_taluk:
        raise HTTPException(403, "This taluk is outside your assigned jurisdiction")
    if assigned_department and department and department != assigned_department:
        raise HTTPException(403, "This department is outside your assigned responsibility")
    selected_district = assigned_district or district
    selected_taluk = assigned_taluk or taluk
    selected_department = assigned_department or department
    if selected_district and selected_district not in DISTRICTS:
        raise HTTPException(422, "Unknown district")
    if selected_taluk and (not selected_district or selected_taluk not in TALUKS.get(selected_district, [])):
        raise HTTPException(422, "Choose a valid taluk within the selected district")
    if selected_department and selected_department not in DEPARTMENTS:
        raise HTTPException(422, "Unknown department")
    level = "taluk" if selected_taluk else "district" if selected_district else "department" if role == "department_officer" else "state"
    return OfficialScope(role, OFFICIAL_ROLES[role], level, selected_district, selected_taluk, selected_department)


def visible_record(record: dict[str, Any], scope: OfficialScope) -> bool:
    return (not scope.district or record.get("district") == scope.district) and (not scope.taluk or record.get("taluk") == scope.taluk) and (not scope.department or record.get("department") == scope.department)


def record_geography(payload: dict[str, Any]) -> dict[str, Any]:
    record = dict(payload)
    record.setdefault("department", SERVICES.get(record.get("service"), {}).get("department", "Unassigned"))
    if not record.get("taluk"):
        match = re.fullmatch(r"SAM-2026-(\d+)", record.get("id", ""))
        index = int(match[1]) - 1042 if match else None
        seeded_case = index is not None and 0 <= index < 180 and record.get("citizen_id") == ("demo-citizen" if index in (0, 3, 7) else f"citizen-{index}")
        feedback = re.fullmatch(r"GRV-SEED-(\d+)", record.get("id", ""))
        if feedback:
            index = int(feedback[1])
        if (seeded_case or feedback) and record.get("district") in TALUKS:
            choices = TALUKS[record["district"]]
            record["taluk"] = choices[(index // 6) % len(choices)]
            record["geography_source"] = "Derived synthetic pilot assignment"
        else:
            record["taluk"] = "Unassigned"
    return record