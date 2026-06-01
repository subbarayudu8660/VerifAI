import os

from openai import OpenAI

MODEL = "gpt-4o"


def get_client() -> OpenAI:
    return OpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        timeout=120.0,
        max_retries=3,
    )
