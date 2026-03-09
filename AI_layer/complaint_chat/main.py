"""
Complaint chat service - FastAPI app and Uvicorn entrypoint.
Run: python main.py   (or: uvicorn main:app --reload)
"""
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI

from constants import API_PREFIX, APP_NAME, DEFAULT_HOST, DEFAULT_PORT
from routers import chat_router

load_dotenv()

app = FastAPI(title=APP_NAME)
app.include_router(chat_router, prefix=API_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok", "service": APP_NAME}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=DEFAULT_HOST,
        port=DEFAULT_PORT,
        reload=True,
    )
