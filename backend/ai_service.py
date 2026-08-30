import os

from dotenv import load_dotenv
from google import genai


load_dotenv()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


def create_study_plan(goal, deadline, study_time, knowledge_level):
    prompt = f"""
Create a personalized study plan for a student.

Learning goal: {goal}
Deadline: {deadline}
Available study time per day: {study_time} hours
Current knowledge level: {knowledge_level}

Create a realistic and structured study plan.
Break the goal into manageable milestones and study sessions.
"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
    )

    return response.text