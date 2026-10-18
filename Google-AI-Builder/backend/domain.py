from datetime import date
from typing import Any


SERVICES = {
    "Pension assistance": {"department": "Social Welfare", "sla": 30},
    "Birth certificate": {"department": "Civil Registration", "sla": 14},
    "Property registration": {"department": "Revenue", "sla": 30},
    "Driving license renewal": {"department": "Transport", "sla": 21},
    "Water supply": {"department": "Public Works", "sla": 7},
}
DISTRICTS = ["Bengaluru South", "Bengaluru North", "Mysuru", "Mandya", "Tumakuru", "Ramanagara"]


def case_timing(case: dict[str, Any], today: date | None = None) -> dict[str, int | bool]:
    current = today or date.today()
    submitted = date.fromisoformat(case["submitted"])
    end = date.fromisoformat(case["resolved_on"]) if case.get("resolved_on") else current
    age = max(0, (end - submitted).days)
    delay = max(0, age - case["sla"])
    return {"age": age, "delay": delay, "breached": delay > 0}


def escalation_decision(case: dict[str, Any], today: date | None = None) -> tuple[bool, str]:
    if case["status"] == "Resolved":
        return False, "This application is already resolved."
    if case.get("escalated"):
        return False, "An escalation already exists for this application."
    timing = case_timing(case, today)
    if not timing["breached"]:
        return False, "This application is still within its service deadline."
    return True, f"Service deadline exceeded by {timing['delay']} days."


def pension_eligibility(age: int, annual_income: int, region: str) -> dict[str, Any]:
    checks = [
        {"rule": "Age 60 or above", "passed": age >= 60},
        {"rule": "Annual household income at or below INR 32,000", "passed": annual_income <= 32000},
        {"rule": "Resident of Karnataka", "passed": region == "Karnataka"},
    ]
    return {
        "eligible": all(check["passed"] for check in checks),
        "checks": checks,
        "documents": ["Proof of age", "Income certificate", "Proof of residence", "Bank account details"],
        "source": "DEMO-POL-001, illustrative pension policy, section 2",
        "notice": "Illustrative rules only, not official eligibility or legal advice. No identity documents are collected in this demo.",
    }