"""Application constants (override via env where needed)."""
import os

APP_NAME = os.getenv("APP_NAME", "complaint-chat")
API_PREFIX = os.getenv("API_PREFIX", "/api")
DEFAULT_HOST = os.getenv("HOST", "0.0.0.0")
DEFAULT_PORT = int(os.getenv("PORT", "8000"))
