from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
)

# CORS — Cross-Origin Resource Sharing
# Browsers block requests from one domain to another by default.
# Your React frontend (localhost:5173) calling your FastAPI backend
# (localhost:8000) counts as cross-origin. This middleware tells
# FastAPI to include the right headers so the browser allows it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server (React)
        "http://localhost:3000",   # Next.js dev server (if you switch)
    ],
    allow_credentials=True,       # Allow cookies/auth headers
    allow_methods=["*"],          # Allow GET, POST, PUT, DELETE etc.
    allow_headers=["*"],          # Allow any headers including Authorization
)


@app.get("/health")
async def health_check():
    """
    A simple endpoint to confirm the server is running.
    You'll call this from your CI/CD pipeline and monitoring.
    """
    return {"status": "ok", "app": settings.app_name}