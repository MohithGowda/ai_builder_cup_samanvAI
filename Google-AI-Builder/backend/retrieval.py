import json
import re
import sqlite3
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Any

from backend.domain import SERVICES


STOP_WORDS = {"a", "an", "the", "i", "me", "my", "you", "your", "to", "for", "of", "is", "it", "this", "that", "there", "what", "how", "can", "could", "do", "does", "and", "please", "about", "with", "need", "want", "would", "like"}


class KnowledgeRetriever:
    def __init__(self):
        source = Path(__file__).parent / "knowledge" / "services.json"
        corpus = json.loads(source.read_text(encoding="utf-8"))
        self.version = corpus["version"]
        self.documents = {document["id"]: {**document, "version": corpus["version"], "kind": corpus["kind"]} for document in corpus["documents"]}
        self.connection = sqlite3.connect(":memory:", check_same_thread=False)
        self.lock = Lock()
        self.connection.execute("CREATE VIRTUAL TABLE knowledge USING fts5(id UNINDEXED, title, body, aliases, tokenize='unicode61')")
        for document in self.documents.values():
            service = document["service"]
            body = document["body"]
            if service:
                if service not in SERVICES:
                    raise ValueError(f"Unknown knowledge service: {service}")
                body += f" Demo service deadline: {SERVICES[service]['sla']} days."
            document["body"] = body
            self.connection.execute("INSERT INTO knowledge VALUES (?, ?, ?, ?)", (document["id"], document["title"], body, " ".join(document["aliases"])))
        self.connection.commit()

    def services_in(self, message: str) -> list[str]:
        question = message.casefold()
        matches = []
        for document in self.documents.values():
            service = document["service"]
            if service and any(re.search(r"(?<!\w)" + re.escape(alias.casefold()) + r"(?!\w)", question) for alias in [service, *document["aliases"]]):
                matches.append(service)
        return list(dict.fromkeys(matches))

    def search(self, message: str, service: str | None = None, feedback: dict[str, int] | None = None, limit: int = 3) -> list[dict[str, Any]]:
        tokens = [token for token in re.findall(r"[\w\u0900-\u097f\u0c80-\u0cff]+", message.casefold()) if len(token) > 1 and token not in STOP_WORDS]
        if service:
            tokens.extend(service.casefold().split())
        tokens = list(dict.fromkeys(tokens))[:24]
        if not tokens:
            return []
        query = " OR ".join('"' + token.replace('"', '""') + '"' for token in tokens)
        with self.lock:
            rows = self.connection.execute("SELECT id, bm25(knowledge, 0, 2, 1, 3) FROM knowledge WHERE knowledge MATCH ? ORDER BY bm25(knowledge, 0, 2, 1, 3) LIMIT 12", (query,)).fetchall()
        ranked = []
        for index, (identifier, _) in enumerate(rows):
            document = self.documents[identifier]
            if service and document["service"] not in (None, service):
                continue
            score = 1 / (index + 1) + (2 if service and document["service"] == service else 0)
            score += max(-3, min(3, (feedback or {}).get(identifier, 0))) * 0.05
            ranked.append({**document, "score": round(score, 3)})
        return sorted(ranked, key=lambda document: document["score"], reverse=True)[:limit]


@lru_cache(maxsize=1)
def knowledge() -> KnowledgeRetriever:
    return KnowledgeRetriever()


def resolve_context(message: str, history: list[dict[str, str]], memory: dict[str, Any] | None = None) -> dict[str, Any]:
    retriever = knowledge()
    services = retriever.services_in(message)
    identifiers = re.findall(r"SAM-\d{4}-[A-Z0-9]+", message.upper())
    result: dict[str, Any] = {"service": services[0] if len(services) == 1 else None, "case_id": identifiers[0] if len(identifiers) == 1 else None, "used": [], "ambiguous": len(services) > 1 or len(identifiers) > 1}
    if result["ambiguous"] or services or identifiers:
        return result
    for turn in reversed(history[-6:]):
        if turn.get("role") != "user":
            continue
        previous = retriever.services_in(turn["content"])
        previous_ids = re.findall(r"SAM-\d{4}-[A-Z0-9]+", turn["content"].upper())
        if len(previous) > 1 or len(previous_ids) > 1:
            result.update(service=None, case_id=None, ambiguous=True)
            return result
        if not result["service"]:
            if len(previous) == 1:
                result["service"] = previous[0]
                result["used"].append("conversation service")
        if not result["case_id"] and not services:
            if len(previous_ids) == 1 and (not previous or result["service"] in previous):
                result["case_id"] = previous_ids[0]
                result["used"].append("conversation case")
        if previous or previous_ids:
            break
    if memory:
        if not result["service"] and memory.get("last_service") in SERVICES:
            result["service"] = memory["last_service"]
            result["used"].append("approved service memory")
        if not result["case_id"] and not services and not any(label.startswith("conversation") for label in result["used"]) and memory.get("last_case_id"):
            result["case_id"] = memory["last_case_id"]
            result["used"].append("approved case memory")
    return result