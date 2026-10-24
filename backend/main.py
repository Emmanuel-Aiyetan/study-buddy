import io
import logging
import os
import threading
import time
from collections import defaultdict, deque
from datetime import date
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, model_validator
from pypdf import PdfReader
from ai_service import create_study_plan, analyze_study_material, ask_study_tutor, generate_material_quiz

logger = logging.getLogger(__name__)
MAX_PDF_BYTES = 10 * 1024 * 1024
app = FastAPI(title="Study Buddy API")
app.add_middleware(CORSMiddleware,
    allow_origins=[s.strip() for s in os.getenv("CORS_ORIGINS", "http://localhost:3000,https://study-buddy-git-master-emmanuel-08f1.vercel.app").split(",") if s.strip()],
    allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
bearer = HTTPBearer(auto_error=False)
requests_by_user = defaultdict(deque)
rate_lock = threading.Lock()


def rate_limit(user_id: str):
    now = time.monotonic()
    with rate_lock:
        for key in list(requests_by_user):
            if not requests_by_user[key] or requests_by_user[key][-1] <= now - 60:
                del requests_by_user[key]
        hits = requests_by_user[user_id]
        while hits and hits[0] <= now - 60:
            hits.popleft()
        if len(hits) >= 20:
            raise HTTPException(429, "Too many requests. Try again in a minute.", headers={"Retry-After": "60"})
        hits.append(now)


async def authenticated_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credentials:
        raise HTTPException(401, "Please log in to continue.")
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    if not url or not key:
        raise HTTPException(503, "Authentication service is not configured.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{url}/auth/v1/user", headers={"apikey": key, "Authorization": f"Bearer {credentials.credentials}"})
        if response.status_code in (401, 403):
            raise HTTPException(401, "Your session has expired. Please log in again.")
        response.raise_for_status()
        user_id = response.json()["id"]
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, KeyError):
        raise HTTPException(503, "Authentication service is temporarily unavailable.") from None
    rate_limit(user_id)
    return user_id


class StudyPlanRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=2000)
    deadline: date
    today: date = Field(default_factory=date.today)
    study_time: float = Field(ge=0.25, le=12, allow_inf_nan=False)
    knowledge_level: Literal["Beginner", "Some experience", "Intermediate", "Advanced"]

    @model_validator(mode="after")
    def validate_dates(self):
        if not self.goal.strip() or self.deadline < self.today or (self.deadline - self.today).days > 366:
            raise ValueError("Choose a learning goal and a deadline within the next year.")
        if abs((self.today - date.today()).days) > 1:
            raise ValueError("Your device date is incorrect.")
        return self


class GeneratedTask(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(max_length=5000)
    scheduled_date: date
    estimated_minutes: int = Field(gt=0, le=720, strict=True)


class Milestone(BaseModel):
    title: str
    description: str


class GeneratedPlan(BaseModel):
    title: str = Field(min_length=1)
    goal: str
    deadline: date
    knowledge_level: str
    study_time: float
    milestones: list[Milestone] = Field(min_length=1, max_length=100)
    tasks: list[GeneratedTask] = Field(min_length=1, max_length=1000)


class Analysis(BaseModel):
    summary: str
    key_concepts: list[str]
    focus_areas: list[str]


class Question(BaseModel):
    question: str
    options: list[str] = Field(min_length=4, max_length=4)
    correct_answer: int = Field(ge=0, le=3, strict=True)
    explanation: str


class Quiz(BaseModel):
    title: str
    questions: list[Question] = Field(min_length=5, max_length=5)


def validate_plan(raw, request):
    plan = GeneratedPlan.model_validate(raw)
    daily = defaultdict(int)
    for task in plan.tasks:
        if not request.today <= task.scheduled_date <= request.deadline:
            raise ValueError("Invalid generated task date")
        daily[task.scheduled_date] += task.estimated_minutes
    if any(minutes > int(request.study_time * 60) for minutes in daily.values()):
        raise ValueError("Generated workload exceeds availability")
    result = plan.model_dump(mode="json")
    result.update(goal=request.goal, deadline=request.deadline.isoformat(), knowledge_level=request.knowledge_level, study_time=request.study_time)
    return result


async def ai_call(function, *args):
    try:
        return await run_in_threadpool(function, *args)
    except Exception:
        logger.warning("AI request failed", exc_info=False)
        raise HTTPException(502, "The AI service could not complete this request. Please try again.") from None


def extract_text(content: bytes):
    if not content.startswith(b"%PDF-"):
        raise HTTPException(400, "Please upload a valid PDF.")
    try:
        reader = PdfReader(io.BytesIO(content))
        if reader.is_encrypted or len(reader.pages) > 200:
            raise HTTPException(400, "Use an unencrypted PDF with at most 200 pages.")
        text = ""
        for page in reader.pages:
            text += (page.extract_text() or "") + "\n"
            if len(text) >= 50000:
                break
        if not text.strip():
            raise HTTPException(400, "This PDF has no readable text. Try a text-based PDF.")
        return text[:50000]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Unable to read this PDF.") from None


async def pdf_text(file: UploadFile):
    try:
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            raise HTTPException(400, "Please upload a PDF file.")
        content = await file.read(MAX_PDF_BYTES + 1)
        if len(content) > MAX_PDF_BYTES:
            raise HTTPException(413, "PDF files must be 10 MB or smaller.")
        return await run_in_threadpool(extract_text, content)
    finally:
        await file.close()


@app.get("/")
def root():
    return {"message": "Study Buddy API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate-plan", dependencies=[Depends(authenticated_user)])
async def generate_plan(request: StudyPlanRequest):
    def generate():
        raw = create_study_plan(request.goal, request.deadline.isoformat(), request.study_time, request.knowledge_level, request.today.isoformat())
        return validate_plan(raw, request)
    return {"study_plan": await ai_call(generate)}


@app.post("/extract-pdf", dependencies=[Depends(authenticated_user)])
async def extract_pdf(file: UploadFile = File(...)):
    text = await pdf_text(file)
    return {"analysis": await ai_call(lambda: Analysis.model_validate(analyze_study_material(text)).model_dump())}


@app.post("/ask-tutor", dependencies=[Depends(authenticated_user)])
async def ask_tutor(file: UploadFile = File(...), question: str = Form(..., min_length=1, max_length=2000), conversation_history: str = Form("", max_length=20000)):
    if not question.strip():
        raise HTTPException(422, "Please enter a question.")
    text = await pdf_text(file)
    return {"answer": await ai_call(ask_study_tutor, text, question, conversation_history)}


@app.post("/generate-quiz", dependencies=[Depends(authenticated_user)])
async def generate_quiz(file: UploadFile = File(...)):
    text = await pdf_text(file)
    return {"quiz": await ai_call(lambda: Quiz.model_validate(generate_material_quiz(text)).model_dump())}
