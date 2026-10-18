import unittest

from fastapi import HTTPException

from backend.jurisdiction import record_geography, resolve_scope, visible_record


class JurisdictionTests(unittest.TestCase):
    def test_chief_secretary_can_drill_down_without_widening_others(self):
        chief = {"government": True, "official_role": "chief_secretary"}
        self.assertEqual(resolve_scope(chief).level, "state")
        scope = resolve_scope(chief, "Mysuru", "Hunsur", "Revenue")
        self.assertEqual(scope.level, "taluk")
        self.assertTrue(visible_record({"district": "Mysuru", "taluk": "Hunsur", "department": "Revenue"}, scope))

    def test_dc_and_tahsildar_cannot_cross_assigned_boundaries(self):
        deputy = {"government": True, "official_role": "deputy_commissioner", "district": "Mysuru"}
        self.assertEqual(resolve_scope(deputy).district, "Mysuru")
        with self.assertRaises(HTTPException) as denied:
            resolve_scope(deputy, "Mandya")
        self.assertEqual(denied.exception.status_code, 403)
        tahsildar = {**deputy, "official_role": "tahsildar", "taluk": "Hunsur", "department": "Revenue"}
        self.assertEqual(resolve_scope(tahsildar).taluk, "Hunsur")
        for filters in ({"taluk": "Nanjangud"}, {"department": "Transport"}):
            with self.assertRaises(HTTPException):
                resolve_scope(tahsildar, **filters)

    def test_missing_claims_fail_closed_and_department_is_restricted(self):
        for user in ({"government": True}, {"government": False}, {"government": True, "official_role": "tahsildar"}):
            with self.assertRaises(HTTPException):
                resolve_scope(user)
        officer = {"government": True, "official_role": "department_officer", "department": "Transport"}
        officer_scope = resolve_scope(officer)
        self.assertEqual(officer_scope.department, "Transport")
        self.assertEqual(officer_scope.level, "department")
        with self.assertRaises(HTTPException):
            resolve_scope(officer, department="Revenue")

    def test_legacy_demo_geography_is_labeled_not_applied_to_real_records(self):
        demo = record_geography({"id": "SAM-2026-1042", "citizen_id": "demo-citizen", "district": "Bengaluru South", "service": "Pension assistance"})
        self.assertEqual(demo["taluk"], "Bengaluru South")
        self.assertIn("synthetic", demo["geography_source"])
        other = record_geography({"id": "SAM-2026-1042", "citizen_id": "real-user", "district": "Bengaluru South", "service": "Pension assistance"})
        self.assertEqual(other["taluk"], "Unassigned")


if __name__ == "__main__":
    unittest.main()