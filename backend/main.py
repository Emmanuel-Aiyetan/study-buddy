from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ai_service import create_study_plan

class StudyPlanRequest(BaseModel):
    goal: str
    deadline: str
    study_time: str
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