import unittest

from backend.retrieval import knowledge, resolve_context


class RetrievalTests(unittest.TestCase):
    def test_ranked_alias_retrieval_and_citations(self):
        retriever = knowledge()
        self.assertEqual(retriever.services_in("I need to register my house"), ["Property registration"])
        chunks = retriever.search("register my house", "Property registration")
        self.assertEqual(chunks[0]["id"], "SVC-PROPERTY")
        self.assertEqual(chunks[0]["kind"], "illustrative-demo")
        self.assertIn("version", chunks[0])
        self.assertIn("30 days", chunks[0]["body"])
        certificate_chunks = retriever.search("birth certificate documents", "Birth certificate")
        self.assertTrue(all(chunk["service"] in (None, "Birth certificate") for chunk in certificate_chunks))
        self.assertNotIn("SVC-PENSION", [chunk["id"] for chunk in certificate_chunks])

    def test_followup_and_memory_context(self):
        history = [{"role": "user", "content": "I want a birth certificate"}, {"role": "assistant", "content": "Pension and water services also exist"}]
        context = resolve_context("What documents do I need?", history)
        self.assertEqual(context["service"], "Birth certificate")
        self.assertIn("conversation service", context["used"])
        self.assertEqual(resolve_context("How long does it take?", [], {"last_service": "Water supply"})["service"], "Water supply")

    def test_current_topic_wins_and_ambiguous_topics_are_not_guessed(self):
        history = [{"role": "user", "content": "Track SAM-2026-1042 for pension"}]
        context = resolve_context("I need a birth certificate", history)
        self.assertEqual(context["service"], "Birth certificate")
        self.assertIsNone(context["case_id"])
        explicit = resolve_context("I need a birth certificate", [{"role": "user", "content": "Compare pension and water"}])
        self.assertEqual(explicit["service"], "Birth certificate")
        self.assertFalse(explicit["ambiguous"])
        context = resolve_context("Compare pension and water supply", history)
        self.assertTrue(context["ambiguous"])
        self.assertIsNone(context["service"])

    def test_old_case_does_not_cross_a_new_topic_boundary(self):
        history = [{"role": "user", "content": "Track SAM-2026-1042 for pension"}, {"role": "user", "content": "Now I need a birth certificate"}]
        context = resolve_context("What documents do I need?", history, {"last_service": "Pension assistance", "last_case_id": "SAM-2026-1042"})
        self.assertEqual(context["service"], "Birth certificate")
        self.assertIsNone(context["case_id"])

    def test_unrelated_queries_and_sql_like_input_are_safe(self):
        self.assertEqual(knowledge().search("quasar astrophysics"), [])
        self.assertIsInstance(knowledge().search('" OR 1=1; DROP TABLE knowledge; --'), list)
        self.assertEqual(knowledge().services_in("ಜಲ ಅಲ್ಲ, ಜನನ ಪ್ರಮಾಣಪತ್ರ"), ["Birth certificate"])


if __name__ == "__main__":
    unittest.main()