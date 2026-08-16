"""Phase 4 (T3) — lightweight real retrieval over the research corpus.

Dep budget on this device rules out torch/sentence-transformers, so the
retriever uses char n-gram TF-IDF vectors built with pure numpy:

- documents are chunked into ~600-char paragraphs
- each chunk gets a TF-IDF vector over 2..4-gram character tokens
- cosine similarity scores every chunk against the query
- `retrieve(query, top_k)` returns ranked chunks with similarity scores

This is real vector retrieval (deterministic, offline) — no truncation,
no keyword-only matching, no fabricated scores.
"""

import logging
import math
import re
from typing import Dict, List

import numpy as np

log = logging.getLogger(__name__)

CHUNK_SIZE = 600
CHUNK_OVERLAP = 80
NGRAM_RANGE = (2, 4)


def chunk_text(text: str) -> List[str]:
    """Split text into overlapping paragraph-aware chunks."""
    text = re.sub(r"\r\n", "\n", text)
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: List[str] = []
    for para in paragraphs:
        if len(para) <= CHUNK_SIZE:
            chunks.append(para)
            continue
        # Oversized paragraph: slide a window with overlap
        start = 0
        while start < len(para):
            chunk = para[start:start + CHUNK_SIZE]
            chunks.append(chunk)
            if start + CHUNK_SIZE >= len(para):
                break
            start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def ngrams(text: str) -> Dict[str, int]:
    """Count character n-grams in [NGRAM_RANGE]."""
    lowered = text.lower()
    counts: Dict[str, int] = {}
    for n in range(NGRAM_RANGE[0], NGRAM_RANGE[1] + 1):
        for i in range(len(lowered) - n + 1):
            gram = lowered[i:i + n]
            counts[gram] = counts.get(gram, 0) + 1
    return counts


class Retriever:
    """TF-IDF cosine retriever over a list of {source, content} docs."""

    def __init__(self, documents: List[Dict[str, str]]):
        self.chunks: List[Dict[str, str]] = []
        self.df: Dict[str, int] = {}  # document frequency per gram
        self.vectors: List[Dict[str, float]] = []  # L2-normalized tf-idf
        self.n_chunks = 0

        for doc in documents:
            for chunk in chunk_text(doc["content"]):
                self.chunks.append({"source": doc["source"], "chunk": chunk})
        self.n_chunks = len(self.chunks)

        chunk_grams = [ngrams(c["chunk"]) for c in self.chunks]
        for grams in chunk_grams:
            for gram in set(grams):
                self.df[gram] = self.df.get(gram, 0) + 1

        idf = lambda gram: math.log((1 + self.n_chunks) / (1 + self.df.get(gram, 0))) + 1
        for grams in chunk_grams:
            vec = {gram: count * idf(gram) for gram, count in grams.items()}
            norm = math.sqrt(sum(v * v for v in vec.values()))
            self.vectors.append({gram: v / norm for gram, v in vec.items()} if norm else {})

    def retrieve(self, query: str, top_k: int = 3) -> List[Dict]:
        """Return top-k chunks ranked by cosine similarity with scores."""
        if not query.strip() or not self.n_chunks:
            return []
        q_grams = ngrams(query)
        q_vec = {}
        for gram, count in q_grams.items():
            if gram in self.df:
                q_vec[gram] = count * (math.log((1 + self.n_chunks) / (1 + self.df[gram])) + 1)
        q_norm = math.sqrt(sum(v * v for v in q_vec.values()))
        if q_norm == 0:
            return []
        q_vec = {g: v / q_norm for g, v in q_vec.items()}

        scored = []
        for i, vec in enumerate(self.vectors):
            dot = sum(q_vec[g] * vec[g] for g in q_vec if g in vec)
            scored.append((dot, self.chunks[i]))

        scored.sort(key=lambda t: t[0], reverse=True)
        return [
            {"source": chunk["source"], "chunk": chunk["chunk"], "score": round(float(score), 4)}
            for score, chunk in scored[:top_k]
        ]
