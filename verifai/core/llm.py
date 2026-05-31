import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MODEL = "gpt-4o"


def get_client() -> OpenAI:
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
