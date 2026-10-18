import unittest
from datetime import date

from backend.domain import case_timing, escalation_decision, pension_eligibility


class DomainTests(unittest.TestCase):
    def setUp(self):
        self.case = {"submitted": "2026-09-01", "sla": 30, "status": "In progress", "escalated": False}
        self.today = date(2026, 10, 16)

    def test_overdue_case_is_escalatable(self):
        self.assertEqual(case_timing(self.case, self.today)["delay"], 15)
        self.assertTrue(escalation_decision(self.case, self.today)[0])

    def test_repeated_escalation_is_rejected(self):
        self.case["escalated"] = True
        self.assertFalse(escalation_decision(self.case, self.today)[0])

    def test_exact_sla_boundary_is_not_overdue(self):
        self.assertFalse(escalation_decision(self.case, date(2026, 10, 1))[0])

    def test_resolved_case_cannot_be_escalated(self):
        self.case["status"] = "Resolved"
        self.case["resolved_on"] = "2026-09-10"
        self.assertFalse(escalation_decision(self.case, self.today)[0])
        self.assertEqual(case_timing(self.case, self.today)["age"], 9)

    def test_policy_checks_all_criteria(self):
        self.assertTrue(pension_eligibility(60, 32000, "Karnataka")["eligible"])
        self.assertFalse(pension_eligibility(59, 32000, "Karnataka")["eligible"])
        self.assertFalse(pension_eligibility(70, 32001, "Karnataka")["eligible"])
        self.assertFalse(pension_eligibility(70, 10000, "Other")["eligible"])


if __name__ == "__main__":
    unittest.main()