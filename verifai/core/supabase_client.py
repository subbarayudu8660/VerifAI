import os

from supabase import Client, create_client


def get_supabase() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set")
    return create_client(url, key)
