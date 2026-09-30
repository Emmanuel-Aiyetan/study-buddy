from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader
import io

from ai_service import (
    create_study_plan,
    analyze_study_material,
    ask_study_tutor,
    generate_material_quiz,
)


class StudyPlanRequest(BaseModel):
    goal: str
    deadline: str
    study_time: float
    knowledge_level: str


app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Study Buddy API is running"}


@app.post("/generate-plan")
def generate_plan(request: StudyPlanRequest):
    try:
        study_plan = create_study_plan(
            request.goal,
            request.deadline,
            request.study_time,
            request.knowledge_level,
        )

        return {
            "message": "Study plan generated successfully",
            "study_plan": study_plan,
        }

    except Exception as error:
        return {
            "message": "Unable to generate a study plan right now. Please try again.",
            "error": str(error),
        }
@app.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return {
            "message": "Please upload a PDF file.",
            "error": "Invalid file type",
        }

    try:
        file_bytes = await file.read()

        reader = PdfReader(io.BytesIO(file_bytes))

        text = ""

        for page in reader.pages:
            page_text = page.extract_text()

            if page_text:
                text += page_text + "\n"

        if not text.strip():
            return {
                "message": "The PDF was uploaded, but no readable text was found.",
                "error": "No text found",
            }

        analysis = analyze_study_material(text)

        return {
            "message": "PDF analyzed successfully",
            "analysis": analysis,
        }

    except Exception as error:
        return {
            "message": "Unable to read the PDF.",
            "error": str(error),
        }
@app.post("/ask-tutor")
async def ask_tutor(
    file: UploadFile = File(...),
    question: str = Form(...),
    conversation_history: str = Form("")
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return {
            "message": "Please upload a PDF file.",
            "error": "Invalid file type",
        }

    if not question.strip():
        return {
            "message": "Please enter a question.",
            "error": "Question is empty",
        }

    try:
        file_bytes = await file.read()

        reader = PdfReader(io.BytesIO(file_bytes))

        text = ""

        for page in reader.pages:
            page_text = page.extract_text()

            if page_text:
                text += page_text + "\n"

        if not text.strip():
            return {
                "message": "No readable text was found in the PDF.",
                "error": "No text found",
            }

        answer = ask_study_tutor(
            text,
            question,
            conversation_history,
        )

        return {
            "message": "Question answered successfully",
            "answer": answer,
        }

    except Exception as error:
        return {
            "message": "Unable to answer the question right now.",
            "error": str(error),
        }
@app.post("/generate-quiz")
async def generate_quiz(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return {
            "message": "Please upload a PDF file.",
            "error": "Invalid file type",
        }

    try:
        # Read the uploaded PDF
        file_bytes = await file.read()

        # Convert the PDF bytes into something pypdf can read
        reader = PdfReader(io.BytesIO(file_bytes))

        text = ""

        # Extract text from every page
        for page in reader.pages:
            page_text = page.extract_text()

            if page_text:
                text += page_text + "\n"

        if not text.strip():
            return {
                "message": "No readable text was found in the PDF.",
                "error": "No text found",
            }

        # Send the extracted material to Gemini
        quiz = generate_material_quiz(text)

        return {
            "message": "Quiz generated successfully",
            "quiz": quiz,
        }

    except Exception as error:
        return {
            "message": "Unable to generate a quiz right now.",
            "error": str(error),
        }