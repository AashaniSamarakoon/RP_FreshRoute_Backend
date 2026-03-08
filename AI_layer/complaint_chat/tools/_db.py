"""Shared Supabase client for tools. Loads env from AI_layer and Backend."""
import os
from pathlib import Path

from dotenv import load_dotenv

_env_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_env_dir / ".env")
load_dotenv(_env_dir.parent / "Backend" / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")


def get_supabase_client():
    """Return Supabase client. Raises RuntimeError if env vars missing."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) must be set."
        )
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
