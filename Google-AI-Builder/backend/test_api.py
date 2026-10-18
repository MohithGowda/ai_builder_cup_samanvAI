import os
import base64
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.gettempdir()}/samanvai-test-{os.getpid()}.db"
os.environ["AUTH_MODE"] = "demo"
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("GOOGLE_GENAI_USE_VERTEXAI", None)

from fastapi.testclient import TestClient

from backend.main import app, identity, store
from backend.store import Store


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_dashboard_and_citizen_scope(self):
        self.assertEqual(self.client.get("/api/overview").json()["total"], 180)
        self.assertEqual(len(self.client.get("/api/cases").json()), 3)
        response = self.client.post("/api/applications", json={"service": "Birth certificate", "district": "Mysuru"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["sla"], 14)
        case_id = response.json()["id"]
        tracked = self.client.post("/api/chat", json={"message": f"Track {case_id}"}).json()
        self.assertIn(case_id, tracked["answer"])
        self.assertEqual(len(tracked["evidence"]["cases"]), 1)
        self.assertEqual(self.client.get("/api/overview").json()["total"], 181)
        self.assertEqual(len(self.client.get("/api/cases").json()), 4)

    def test_health_and_production_frontend(self):
        self.assertEqual(self.client.get("/api/health").json()["orchestration"], "LangGraph")
        response = self.client.get("/")
        if response.status_code == 200:
            self.assertIn("SamanvAI", response.text)
            self.assertEqual(self.client.get("/karnataka.jpg").status_code, 200)

    def test_workflow_escalation_is_atomic_and_idempotent(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.client.post("/api/escalations", json={"case_id": "SAM-2026-1042"}).json(), range(2)))
        self.assertEqual(sum(result["created"] for result in results), 1)
        body = {"message": "My pension application is pending for 45 days", "allow_escalation": True}
        response = self.client.post("/api/chat", json=body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["trace"]), 6)
        self.assertIn("already exists", response.json()["answer"])
        self.assertEqual(len(self.client.get("/api/audit").json()), 1)
        self.assertEqual(self.client.get("/api/overview").json()["escalations"], 1)

    def test_unauthorized_government_and_other_citizen(self):
        app.dependency_overrides[identity] = lambda: {"uid": "another-citizen", "government": False}
        try:
            self.assertEqual(self.client.get("/api/overview").status_code, 403)
            self.assertEqual(self.client.get("/api/cases?scope=government").status_code, 403)
            self.assertEqual(self.client.post("/api/chat", json={"message": "delays", "role": "government"}).status_code, 403)
            self.assertEqual(self.client.post("/api/escalations", json={"case_id": "SAM-2026-1042"}).status_code, 404)
            self.assertEqual(self.client.get("/api/cases").json(), [])
        finally:
            app.dependency_overrides.clear()

    def test_official_scope_is_enforced_across_routes_and_reports(self):
        for profile in ("chief_secretary", "deputy_commissioner", "tahsildar", "department_officer"):
            headers = {"X-Demo-Profile": profile}
            me = self.client.get("/api/me", headers=headers).json()
            rows = self.client.get("/api/cases?scope=government", headers=headers).json()
            overview = self.client.get("/api/overview", headers=headers).json()
            self.assertEqual(overview["total"], len(rows))
            for territory in overview["territories"]:
                department_rows = [row for row in overview["territory_departments"] if row["territory"] == territory["name"]]
                self.assertEqual(sum(row["total"] for row in department_rows), territory["total"])
            if me["official_scope"]["department"]:
                self.assertTrue(all(row["department"] == me["official_scope"]["department"] for row in overview["territory_departments"]))
            for row in rows:
                for key in ("district", "taluk", "department"):
                    if me["official_scope"][key]:
                        self.assertEqual(row[key], me["official_scope"][key])
            report = self.client.get("/api/reports/summary", headers=headers).json()
            self.assertEqual(report["schema"], "samanvai-review-report.v1")
            self.assertNotIn("delayed_cases", report)
        deputy = {"X-Demo-Profile": "deputy_commissioner"}
        for route in ("/api/overview?district=Mandya", "/api/cases?scope=government&district=Mandya", "/api/audit?scope=government&district=Mandya", "/api/reports/summary?district=Mandya"):
            self.assertEqual(self.client.get(route, headers=deputy).status_code, 403)
        self.assertEqual(self.client.post("/api/escalations", headers=deputy, json={"case_id": "SAM-2026-1042"}).status_code, 404)
        self.assertEqual(self.client.post("/api/chat", headers=deputy, json={"message": "delays", "role": "government", "district": "Mandya"}).status_code, 403)
        scoped_chat = self.client.post("/api/chat", headers=deputy, json={"message": "Which department is delayed?", "role": "government"}).json()
        self.assertEqual(scoped_chat["evidence"]["governance"]["total"], len(self.client.get("/api/cases?scope=government", headers=deputy).json()))
        citizen = {"X-Demo-Profile": "citizen"}
        self.assertFalse(self.client.get("/api/me", headers=citizen).json()["government"])
        self.assertEqual(self.client.get("/api/reports/summary", headers=citizen).status_code, 403)

    def test_firebase_claims_cannot_be_widened_by_demo_header(self):
        claims = {"uid": "verified-official", "government": True, "official_role": "deputy_commissioner", "district": "Mysuru"}
        with patch("backend.main.AUTH_MODE", "firebase"), patch("firebase_admin._apps", {"test": object()}), patch("firebase_admin.auth.verify_id_token", return_value=claims):
            headers = {"Authorization": "Bearer test-token", "X-Demo-Profile": "chief_secretary"}
            response = self.client.get("/api/me", headers=headers).json()
            self.assertEqual(response["official_scope"]["role"], "deputy_commissioner")
            self.assertFalse(response["demo"])
            self.assertEqual(self.client.get("/api/overview?district=Mandya", headers=headers).status_code, 403)

    def test_google_speech_discovers_matching_language_voice(self):
        from backend.speech import select_cloud_voice

        select_cloud_voice.cache_clear()
        try:
            with patch.dict(os.environ, {"GOOGLE_CLOUD_TTS_ENABLED": "true"}), patch("backend.speech.access_token", return_value="test-access"), patch("backend.speech.httpx.get") as catalog, patch("backend.speech.httpx.post") as synthesis:
                catalog.return_value.json.return_value = {"voices": [{"name": "hi-IN-TestFemale", "ssmlGender": "FEMALE", "languageCodes": ["hi-IN"]}, {"name": "hi-IN-TestMale", "ssmlGender": "MALE", "languageCodes": ["hi-IN"]}, {"name": "kn-IN-TestMale", "ssmlGender": "MALE", "languageCodes": ["kn-IN"]}]}
                synthesis.return_value.json.return_value = {"audioContent": base64.b64encode(b"test-mp3").decode()}
                for language, text in (("hi-IN", "नमस्ते"), ("kn-IN", "ನಮಸ್ಕಾರ")):
                    response = self.client.post("/api/speech/synthesize", json={"text": text, "language": language})
                    self.assertEqual(response.status_code, 200)
                    request = synthesis.call_args.kwargs["json"]
                    self.assertEqual(request["voice"]["languageCode"], language)
                    self.assertEqual(request["voice"]["name"], f"{language}-TestMale")
                    self.assertEqual(request["input"], {"text": text})
                self.assertEqual(self.client.post("/api/speech/synthesize", json={"text": "अ" * 1600, "language": "hi-IN"}).status_code, 422)
        finally:
            select_cloud_voice.cache_clear()

    def test_speech_configuration_and_audio_transport(self):
        with patch.dict(os.environ, {"GOOGLE_CLOUD_TTS_ENABLED": "false"}):
            self.assertFalse(self.client.get("/api/speech/capabilities").json()["configured"])
            self.assertEqual(self.client.post("/api/speech/synthesize", json={"text": "ನಮಸ್ಕಾರ", "language": "kn-IN"}).status_code, 503)
        with patch("backend.main.synthesize", return_value=b"mock-audio") as provider:
            response = self.client.post("/api/speech/synthesize", json={"text": "नमस्ते", "language": "hi-IN"})
            self.assertEqual(response.headers["content-type"], "audio/mpeg")
            self.assertEqual(response.headers["cache-control"], "no-store")
            provider.assert_called_once_with("नमस्ते", "hi-IN", "demo-citizen")

    def test_invalid_input(self):
        self.assertEqual(self.client.post("/api/eligibility", json={"age": -1, "annual_income": 1, "region": "Karnataka"}).status_code, 422)
        self.assertEqual(self.client.get("/api/overview?district=Unknown").status_code, 422)

    def test_assistant_localized_catalog_and_validation(self):
        for language, question, expected in [("en-IN", "What services are available?", "Birth certificate"), ("hi-IN", "कौन सी सेवाएँ उपलब्ध हैं?", "जन्म प्रमाण पत्र"), ("kn-IN", "ಯಾವ ಸೇವೆಗಳು ಲಭ್ಯ?", "ಜನನ ಪ್ರಮಾಣಪತ್ರ")]:
            response = self.client.post("/api/assistant", json={"message": question, "language": language})
            self.assertEqual(response.status_code, 200)
            self.assertIn(expected, response.json()["answer"])
            self.assertEqual(response.json()["language"], language)
            self.assertEqual(response.json()["actions"], ["services", "apply"])
        self.assertEqual(self.client.post("/api/assistant", json={"message": " ", "language": "en-IN"}).status_code, 422)
        self.assertEqual(self.client.post("/api/assistant", json={"message": "hello", "language": "fr-FR"}).status_code, 422)

    def test_assistant_retrieval_followups_and_remembered_service(self):
        response = self.client.post("/api/assistant", json={"message": "I need to register my house"}).json()
        self.assertEqual(response["context"]["service"], "Property registration")
        self.assertEqual(response["citations"][0]["id"], "SVC-PROPERTY")
        history = [{"role": "user", "content": "I need a birth certificate"}]
        response = self.client.post("/api/assistant", json={"message": "What documents do I need?", "history": history}).json()
        self.assertIn("No verified official document checklist", response["answer"])
        self.assertNotIn("income certificate", response["answer"])
        response = self.client.post("/api/assistant", json={"message": "How long does it take?", "history": history}).json()
        self.assertIn("14-day", response["answer"])
        response = self.client.post("/api/assistant", json={"message": "take me there", "history": history, "movement": "run"}).json()
        self.assertEqual(response["navigation"], {"action": "apply", "motion": "run", "service": "Birth certificate"})
        self.assertIsNone(self.client.post("/api/assistant", json={"message": "take me there"}).json()["navigation"])
        response = self.client.post("/api/assistant", json={"message": "How long does it take?", "context": {"service": "Birth certificate"}}).json()
        self.assertIn("14-day", response["answer"])
        self.assertIn("current session service", response["context"]["used"])
        response = self.client.post("/api/assistant", json={"message": "Open my applications"}).json()
        self.assertIn("SAM-2026-1042", response["answer"])
        self.assertEqual(self.client.post("/api/assistant", json={"message": "hello", "context": {"service": "Unverified scheme"}}).status_code, 422)
        app.dependency_overrides[identity] = lambda: {"uid": "context-memory-user", "government": False}
        try:
            self.client.post("/api/assistant/memory", json={"enabled": True})
            self.client.post("/api/assistant", json={"message": "I want a birth certificate"})
            response = self.client.post("/api/assistant", json={"message": "How long does it take?"}).json()
            self.assertEqual(response["context"]["service"], "Birth certificate")
            self.assertIn("approved service memory", response["context"]["used"])
            self.client.post("/api/assistant/memory/forget")
            response = self.client.post("/api/assistant", json={"message": "How long does it take?"}).json()
            self.assertIsNone(response["context"]["service"])
        finally:
            app.dependency_overrides.clear()

    def test_assistant_memory_consent_isolation_and_forgetting(self):
        app.dependency_overrides[identity] = lambda: {"uid": "memory-test-user", "government": False}
        try:
            self.assertFalse(self.client.get("/api/assistant/memory").json()["enabled"])
            self.assertEqual(self.client.post("/api/assistant/feedback", json={"request_id": "a" * 32, "source_ids": ["SVC-BIRTH"], "helpful": True}).status_code, 409)
            response = self.client.post("/api/assistant/memory", json={"enabled": True, "preferences": {"movement": "run", "district": "Mysuru", "detail": "brief"}})
            self.assertEqual(response.json()["preferences"]["district"], "Mysuru")
            self.client.post("/api/assistant/memory", json={"preferences": {"district": None}})
            self.assertNotIn("district", self.client.get("/api/assistant/memory").json()["preferences"])
            store.remember_assistant_context("memory-test-user", {"language": "en-IN"}, {"last_service": "Birth certificate", "raw_message": "must not persist"})
            memory = self.client.get("/api/assistant/memory").json()
            self.assertEqual(memory["context"]["last_service"], "Birth certificate")
            self.assertNotIn("raw_message", memory["context"])
            self.assertEqual(self.client.post("/api/assistant/memory", json={"preferences": {"district": "Unknown"}}).status_code, 422)
            self.client.post("/api/assistant/feedback", json={"request_id": "a" * 32, "source_ids": ["SVC-BIRTH"], "helpful": True})
            self.client.post("/api/assistant/feedback", json={"request_id": "a" * 32, "source_ids": ["SVC-BIRTH"], "helpful": True})
            self.assertEqual(store.assistant_memory("memory-test-user")["feedback"]["SVC-BIRTH"], 1)
            self.client.post("/api/assistant/feedback", json={"request_id": "a" * 32, "source_ids": ["SVC-BIRTH"], "helpful": False})
            self.assertEqual(store.assistant_memory("memory-test-user")["feedback"]["SVC-BIRTH"], -1)
            self.assertEqual(self.client.get("/api/assistant/memory").json()["feedback_sources"], 1)
            app.dependency_overrides[identity] = lambda: {"uid": "different-memory-user", "government": False}
            self.assertFalse(self.client.get("/api/assistant/memory").json()["enabled"])
            app.dependency_overrides[identity] = lambda: {"uid": "memory-test-user", "government": False}
            self.client.post("/api/assistant/memory", json={"enabled": False})
            store.remember_assistant_context("memory-test-user", {}, {"last_service": "Water supply"})
            self.assertEqual(self.client.get("/api/assistant/memory").json()["context"], {})
            self.client.post("/api/assistant/memory/forget")
            self.assertEqual(store.assistant_memory("memory-test-user")["preferences"], {})
        finally:
            app.dependency_overrides.clear()

    def test_assistant_memory_expires_on_access(self):
        app.dependency_overrides[identity] = lambda: {"uid": "expired-memory-user", "government": False}
        try:
            self.client.post("/api/assistant/memory", json={"enabled": True, "preferences": {"district": "Mysuru"}})
            with patch("backend.store.datetime") as clock:
                clock.now.return_value = datetime.now(timezone.utc) + timedelta(days=31)
                clock.fromisoformat.side_effect = datetime.fromisoformat
                result = self.client.get("/api/assistant/memory").json()
            self.assertFalse(result["enabled"])
            self.assertEqual(result["preferences"], {})
        finally:
            app.dependency_overrides.clear()

    def test_assistant_navigation_is_explicit_and_read_only(self):
        before = self.client.get("/api/overview").json()
        for message, action, motion in [("Walk to services", "services", "walk"), ("Run to birth certificate", "apply", "run"), ("Jump to check eligibility", "eligibility", "jump"), ("Open my applications", "track", "walk"), ("Jump to grievance", "grievance", "jump")]:
            response = self.client.post("/api/assistant", json={"message": message}).json()
            self.assertEqual(response["navigation"]["action"], action)
            self.assertEqual(response["navigation"]["motion"], motion)
        self.assertEqual(self.client.post("/api/assistant", json={"message": "Run to birth certificate"}).json()["navigation"]["service"], "Birth certificate")
        self.assertIsNone(self.client.post("/api/assistant", json={"message": "What services are available?"}).json()["navigation"])
        self.assertIsNone(self.client.post("/api/assistant", json={"message": "jump"}).json()["navigation"])
        for message in ("Do not open an application", "Don't run to birth certificate", "How do I open eligibility?", "What does jump to eligibility mean?"):
            self.assertIsNone(self.client.post("/api/assistant", json={"message": message}).json()["navigation"])
        self.assertIn("Samanvay", self.client.post("/api/assistant", json={"message": "Hello"}).json()["answer"])
        after = self.client.get("/api/overview").json()
        self.assertEqual(before["total"], after["total"])
        self.assertEqual(before["escalations"], after["escalations"])

    def test_assistant_is_read_only_and_citizen_scoped(self):
        before = self.client.get("/api/overview").json()
        response = self.client.post("/api/assistant", json={"message": "Escalate SAM-2026-1042 now"})
        self.assertIn("SAM-2026-1042", response.json()["answer"])
        self.assertIn("have not changed", response.json()["answer"])
        after = self.client.get("/api/overview").json()
        self.assertEqual(before["escalations"], after["escalations"])
        self.assertEqual(before["total"], after["total"])
        app.dependency_overrides[identity] = lambda: {"uid": "another-citizen", "government": False}
        try:
            response = self.client.post("/api/assistant", json={"message": "Track SAM-2026-1042"})
            self.assertIn("could not find", response.json()["answer"])
            self.assertNotIn("Revenue verification", response.json()["answer"])
        finally:
            app.dependency_overrides.clear()

    def test_blank_database_environment_uses_local_default(self):
        with patch.dict(os.environ, {"DATABASE_URL": ""}), patch("backend.store.create_engine", return_value=store.engine) as create:
            database = Store()
            self.assertEqual(database.engine.dialect.name, "sqlite")
            self.assertTrue(create.call_args.args[0].endswith("samanvai.db"))

    def test_chat_intents_and_persisted_history(self):
        response = self.client.post("/api/chat", json={"message": "What documents are required for pension?"})
        self.assertIn("proof of age", response.json()["answer"])
        self.assertEqual(self.client.get("/api/chat/history").json()[-1]["question"], "What documents are required for pension?")
        response = self.client.post("/api/chat", json={"message": "Which district has the highest complaints?", "role": "government"})
        self.assertIn("District signals", response.json()["answer"])
        response = self.client.post("/api/chat", json={"message": "Which services have lowest SLA compliance?", "role": "government"})
        self.assertIn("lowest first", response.json()["answer"])
        app.dependency_overrides[identity] = lambda: {"uid": "other", "government": False}
        try:
            self.assertEqual(self.client.get("/api/chat/history").json(), [])
        finally:
            app.dependency_overrides.clear()

    def test_grievance_changes_scoped_dashboard(self):
        before = self.client.get("/api/overview?district=Mysuru").json()
        response = self.client.post("/api/grievances", json={"district": "Mysuru", "service": "Water supply", "message": "Water supply is broken and delayed"})
        self.assertEqual(response.status_code, 201)
        after = self.client.get("/api/overview?district=Mysuru").json()
        self.assertEqual(after["feedback_count"], before["feedback_count"] + 1)

    @classmethod
    def tearDownClass(cls):
        store.engine.dispose()
        os.remove(f"{tempfile.gettempdir()}/samanvai-test-{os.getpid()}.db")


if __name__ == "__main__":
    unittest.main()