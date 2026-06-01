import os
import re

import anthropic

MODEL = "claude-sonnet-4-5"


def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(
        api_key=os.getenv("ANTHROPIC_API_KEY"),
    )


def extract_json(text: str) -> str:
    """Strip markdown code fences that Claude sometimes wraps JSON in."""
    text = text.strip()
    match = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", text, re.DOTALL)
    return match.group(1).strip() if match else text
