"""Shared constants for the VerifAI pipeline.

All hardcoded thresholds, sets, and maps live here.
Agent files import from this module — nothing hardcoded inline.
"""

# ---------------------------------------------------------------------------
# GitHub scraper
# ---------------------------------------------------------------------------

# Repos created within this many days are flagged RECENT_CREATION
RECENT_CREATION_DAYS = 20

# Repos with fewer total bytes across all languages are flagged EMPTY_OR_MINIMAL_REPO
MINIMAL_REPO_BYTES_THRESHOLD = 500

# Max .ipynb files fetched and parsed per candidate (github_scraper notebook import scan)
MAX_NOTEBOOK_SCANS = 5

# Repo-name keywords that indicate ML/data-science relevance — used to prioritize
# which notebook-containing repos get scanned first within the MAX_NOTEBOOK_SCANS budget
ML_KEYWORDS = ["classifier", "prediction", "model", "analysis", "ml", "data", "neural", "regression"]

# ---------------------------------------------------------------------------
# Coherence verifier — skill matching
# ---------------------------------------------------------------------------

# Skills that cannot be verified on GitHub (tools, environments, processes)
SKIP_SKILLS = {
    "git", "github", "vs code", "vscode", "visual studio", "visual studio code",
    "jupyter", "jupyter notebook", "virtualenv", "virtual environments",
    "terminal", "linux", "windows", "macos", "unix", "bash", "zsh",
    "agile", "scrum", "jira", "confluence", "slack", "notion", "trello",
}

# Maps a resume skill name to GitHub language names that act as a first-pass filter.
# A repo only counts if the language alias matches AND the skill keyword appears in
# README/description/repo name. Empty list = text match only (no language pre-filter).
SKILL_ALIASES: dict[str, list[str]] = {
    # Frontend frameworks — JSX/TSX files are a stronger signal than plain JS
    "react": ["jsx", "tsx"],
    "react native": ["tsx"],
    "next.js": ["nextjs", "next.js"],
    "vue": ["vue"],
    "angular": ["angular"],
    "javascript (es6+)": ["javascript"],
    "typescript": ["typescript"],

    # Backend — text confirmation required alongside language match
    "node.js": ["javascript"],
    "express": ["javascript"],
    "fastapi": ["python"],
    "flask": ["python"],

    # Auth / API patterns — must appear explicitly in text, no language shortcut
    "jwt": [],
    "oauth 2.0": [],
    "oauth": [],
    "rest apis": [],
    "websockets": [],
    "microservices": [],
    "graphql": [],

    # ML / AI libraries — Python repos only count if the library name is in text
    "langchain": [],
    "langgraph": [],
    "pytorch": [],
    "tensorflow": [],
    "scikit-learn": [],
    "pandas": [],
    "numpy": [],
    "matplotlib": [],
    "huggingface transformers": [],
    "peft": [],
    "xgboost": [],
    "lightgbm": [],
    "langsmith": [],
    "pinecone (vector db)": [],
    "chromadb": [],

    # Databases — must appear in text
    "mongodb": [],
    "mysql": [],
    "sql": ["jupyter notebook"],
    "postgresql": [],
    "redis": [],

    # Infrastructure — must appear in text
    "docker": ["dockerfile"],
    "kubernetes": ["yaml"],
    "github api": [],

    # Web scraping / utilities — must appear in text
    "beautifulsoup": [],
    "selenium": [],
    "requests": [],
    "streamlit": [],

    # Languages — direct GitHub language match
    "python": ["python"],
    "java": ["java"],
    "c++": ["c++", "c"],
    "swift": ["swift"],
    "latex": ["tex"],
}

# ---------------------------------------------------------------------------
# Coherence verifier — project matching
# ---------------------------------------------------------------------------

# Words ignored when computing keyword overlap between a project claim and repo text
STOPWORDS = {
    "a", "an", "the", "and", "or", "for", "to", "in", "of", "with",
    "on", "at", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "has", "have", "had", "that", "this", "it", "its",
}

# Keyword overlap score (0–1) required to count a project claim as matched
PROJECT_MATCH_THRESHOLD = 0.35

# Python standard library modules — excluded from notebook_imports skill evidence
# since importing them demonstrates no meaningful third-party skill
STDLIB_MODULES = {
    "os", "sys", "json", "re", "math", "datetime", "collections", "itertools",
    "functools", "typing", "pathlib", "random", "time", "logging", "argparse",
    "subprocess", "shutil", "copy", "io", "csv", "string", "threading",
    "multiprocessing", "unittest", "abc", "enum", "dataclasses", "contextlib",
    "warnings", "traceback", "glob", "pickle", "base64", "hashlib", "socket",
    "http", "urllib", "email", "sqlite3", "queue", "operator", "uuid",
}

# ---------------------------------------------------------------------------
# Coherence verifier — unmatched project classification
# ---------------------------------------------------------------------------

# Words in a project claim that suggest classified/government work (checked first)
CLASSIFIED_HINTS = [
    "classified", "secret", "top secret", "itar", "dod", "darpa",
    "satellite", "defense", "government", "federal", "mitre",
]

# Words that suggest corporate private-repo work
CORPORATE_HINTS = [
    "optimized", "molecular", "property", "enterprise", "production",
    "deployed", "client", "company", "organization", "business",
    "automated", "pipeline", "system", "platform", "infrastructure",
    "internship", "intern", "contracted", "corporation", "inc.", "llc",
    "lockheed", "raytheon", "booz", "palantir", "saic", "darpa", "mitre",
]
