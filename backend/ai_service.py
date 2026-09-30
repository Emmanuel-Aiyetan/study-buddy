import json
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

Return ONLY valid JSON.
Do not use Markdown.
Do not wrap the JSON in ```json or ```.

The JSON must follow exactly this structure:

{{
  "title": "Short title for the study plan",
  "goal": "The student's learning goal",
  "deadline": "{deadline}",
  "knowledge_level": "{knowledge_level}",
  "study_time": {study_time},
  "milestones": [
    {{
      "title": "Milestone title",
      "description": "What the student should accomplish"
    }}
  ],
  "tasks": [
    {{
      "title": "Specific study task",
      "description": "What the student should do",
      "scheduled_date": "YYYY-MM-DD",
      "estimated_minutes": 60
    }}
  ]
}}

Requirements:

- Create realistic milestones based on the student's goal and experience level.
- Break the milestones into specific study tasks.
- Every task must have a scheduled_date between today and the deadline.
- Do not schedule tasks after the deadline.
- Keep the daily workload realistic based on the available study time.
- estimated_minutes should represent the expected time needed for the task.
- Tasks should progressively increase in difficulty.
- Include enough tasks to reasonably reach the goal by the deadline.
"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
    )

    try:
        return json.loads(response.text)
    except json.JSONDecodeError:
        raise ValueError("Gemini returned an invalid study plan format.")


def analyze_study_material(text):
    prompt = f"""
You are an AI study assistant.

Analyze the study material below and help a student understand what they should learn from it.

Return ONLY valid JSON.
Do not use Markdown.
Do not wrap the JSON in ```json or ```.

The JSON must follow exactly this structure:

{{
  "summary": "A clear summary of the study material",
  "key_concepts": [
    "Important concept 1",
    "Important concept 2"
  ],
  "focus_areas": [
    "Topic the student should focus on",
    "Another important topic"
  ]
}}

Requirements:
- Base the analysis only on the provided study material.
- Explain the material in student-friendly language.
- Identify the most important concepts.
- Identify areas that deserve extra study or practice.
- Do not invent information that is not supported by the material.
- Keep the summary concise but useful.

Study material:

{text[:50000]}
"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
    )

    try:
        return json.loads(response.text)
    except json.JSONDecodeError:
        raise ValueError("Gemini returned an invalid material analysis format.")

def ask_study_tutor(material_text, question, conversation_history=""):
    prompt = f"""
You are Study Buddy, an AI tutor helping a student understand their
uploaded study material.

Answer the student's latest question using the provided study material
and the conversation history.

Rules:
- Base your answers primarily on the provided study material.
- Use the conversation history to understand follow-up questions.
- Do not pretend the material contains information that it does not contain.
- If the material does not provide enough information to answer the question,
  clearly tell the student.
- Explain concepts in clear, student-friendly language.
- Teach the student instead of simply giving a short answer.
- Use examples when they help explain the concept.
- Keep the response focused on the student's question.

STUDY MATERIAL:

{material_text[:50000]}

CONVERSATION HISTORY:

{conversation_history}

LATEST STUDENT QUESTION:

{question}
"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
    )

    return response.text
def generate_material_quiz(material_text):
    prompt = f"""
You are Study Buddy, an AI study assistant.

Create a quiz based ONLY on the study material provided below.

Return ONLY valid JSON.
Do not use Markdown.
Do not wrap the response in ```json or ```.

Return exactly this structure:

{{
  "title": "Quiz title based on the material",
  "questions": [
    {{
      "question": "Question text",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "correct_answer": 0,
      "explanation": "Explain why the correct answer is correct."
    }}
  ]
}}

Requirements:
- Generate exactly 5 multiple-choice questions.
- Every question must have exactly 4 answer options.
- correct_answer must be the index of the correct option.
- The indexes are 0, 1, 2, or 3.
- Only one option should be correct.
- Base every question only on information contained in the study material.
- Include a mix of understanding and application questions.
- Avoid trivial questions when possible.
- Make incorrect options believable but clearly incorrect based on the material.
- Give a useful explanation for every correct answer.
- Do not include information unsupported by the study material.

STUDY MATERIAL:

{material_text[:50000]}
"""

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
    )

    try:
        return json.loads(response.text)
    except json.JSONDecodeError:
        raise ValueError("Gemini returned an invalid quiz format.")