"""Duplicate document detector — sentence embeddings with TF-IDF cosine fallback."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

THRESHOLD = 0.85

# ── numpy (required for both backends) ────────────────────────────────────────

try:
    import numpy as np
    NUMPY_OK = True
except ImportError:
    NUMPY_OK = False
    logger.warning("numpy not installed — duplicate detection disabled")

# ── sentence-transformers (primary) ───────────────────────────────────────────

_model = None
EMBEDDINGS_OK = False

if NUMPY_OK:
    try:
        from sentence_transformers import SentenceTransformer as _ST
        _model = _ST("paraphrase-multilingual-MiniLM-L12-v2")
        EMBEDDINGS_OK = True
        logger.info("sentence-transformers loaded (paraphrase-multilingual-MiniLM-L12-v2)")
    except Exception as _e:
        logger.warning("sentence-transformers unavailable (%s) — using TF-IDF fallback", _e)

# ── sklearn (fallback) ────────────────────────────────────────────────────────

SKLEARN_OK = False
if NUMPY_OK and not EMBEDDINGS_OK:
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer  # noqa: F401
        from sklearn.preprocessing import normalize  # noqa: F401
        SKLEARN_OK = True
        logger.info("scikit-learn TF-IDF loaded for duplicate detection")
    except ImportError:
        logger.warning("scikit-learn not installed — duplicate detection disabled (install sentence-transformers or scikit-learn)")


def _embed(texts: list[str]) -> "np.ndarray":
    """Return L2-normalised embedding matrix (n, dim)."""
    if _model is not None:
        return _model.encode(texts, normalize_embeddings=True)
    if SKLEARN_OK:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.preprocessing import normalize as sk_normalize
        vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 4), max_features=8000)
        mat = vec.fit_transform(texts).toarray().astype(float)
        return sk_normalize(mat)
    raise RuntimeError("No embedding backend available")


def is_duplicate(
    new_text: str,
    existing_texts: list[str],
    threshold: float = THRESHOLD,
) -> tuple[bool, int, float]:
    """Check if new_text duplicates any in existing_texts.

    Returns (is_duplicate, best_match_index, similarity_score).
    Returns (False, -1, 0.0) when a backend is unavailable.
    """
    if not NUMPY_OK or (not EMBEDDINGS_OK and not SKLEARN_OK):
        return False, -1, 0.0
    if not existing_texts or not new_text.strip():
        return False, -1, 0.0
    try:
        all_texts = existing_texts + [new_text]
        embs = _embed(all_texts)
        new_emb: "np.ndarray" = embs[-1]
        scores: "np.ndarray" = embs[:-1] @ new_emb
        best_idx = int(np.argmax(scores))
        best_score = float(scores[best_idx])
        return best_score >= threshold, best_idx, best_score
    except Exception as exc:
        logger.warning("Duplicate detection error: %s", exc)
        return False, -1, 0.0
