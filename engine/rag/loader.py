import os
import glob
import logging
from typing import List, Dict

from rag.retriever import Retriever

class RAGLoader:
    def __init__(self, data_dir: str = "data/research"):
        self.data_dir = data_dir
        self._retriever = None
        # Ensure directory exists
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir, exist_ok=True)

    def _get_retriever(self) -> Retriever:
        """Build (and cache) the retriever over the current corpus."""
        docs = self.load_documents()
        if not docs:
            return None
        if self._retriever is None:
            self._retriever = Retriever(docs)
        return self._retriever

    def load_documents(self) -> List[Dict[str, str]]:
        """
        Scans the data directory for text and pdf files.
        Returns a list of dicts: {'source': filename, 'content': text}

        Documents that are upstream error stubs (written by vibe research
        when data fetches fail, e.g. '# backtest run failed' / '**Error**:')
        are skipped: they are diagnostics, not research, and poison the
        context given to the Fundamental agent.
        """
        documents = []
        # Search for .txt files
        for filepath in glob.glob(os.path.join(self.data_dir, "**/*.txt"), recursive=True):
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    if not content.strip():
                        continue
                    if self._is_error_stub(content):
                        logging.info(f"Skipping error-stub research doc: {filepath}")
                        continue
                    documents.append({
                        "source": os.path.basename(filepath),
                        "content": content
                    })
            except Exception as e:
                logging.error(f"Error reading {filepath}: {e}")

        # TODO: Add PDF support here (requires pypdf or similar)

        return documents

    @staticmethod
    def _is_error_stub(content: str) -> bool:
        """True when the doc is a failed-run report, not actual research."""
        first_lines = [ln.strip() for ln in content.splitlines()[:3] if ln.strip()]
        if not first_lines:
            return False
        if any(ln.startswith("# ") and "failed" in ln for ln in first_lines):
            return True
        if "**Error**" in content and "run failed" in content[:400]:
            return True
        return False

    def get_relevant_context(self, query: str, top_k: int = 3) -> str:
        """
        Real retrieval: rank corpus chunks against the query via TF-IDF
        cosine similarity and return the top-k as context (with scores).
        """
        retriever = self._get_retriever()
        if retriever is None:
            return "No research documents found."
        hits = retriever.retrieve(query, top_k=top_k)
        if not hits:
            return "No relevant research chunks found for query."
        parts = []
        for hit in hits:
            parts.append(
                f"--- SOURCE: {hit['source']} (similarity {hit['score']:.3f}) ---\n{hit['chunk']}\n"
            )
        return "\n".join(parts)

    def get_summary_context(self, query: str = None, max_chars: int = 4000) -> str:
        """
        Returns research context for the analysis prompt. When a query is
        given, top-k retrieval replaces the old naive first-2000-chars
        truncation; otherwise the corpus is concatenated up to max_chars.
        """
        if query and query.strip():
            return self.get_relevant_context(query, top_k=3)

        docs = self.load_documents()
        if not docs:
            return "No research documents found."

        context_parts = []
        remaining = max_chars
        for doc in docs:
            if remaining <= 0:
                break
            snippet = doc['content'][:remaining]
            remaining -= len(snippet)
            context_parts.append(f"--- SOURCE: {doc['source']} ---\n{snippet}\n")
        return "\n".join(context_parts)
