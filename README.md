# AI Study Buddy

AI Study Buddy is an AI-powered application that generates personalized study plans based on a user's learning goal, deadline, available study time, and current knowledge level.

The goal of the project is to help learners turn broad learning goals into structured and actionable study plans.

## Features

- Generate personalized AI study plans
- Customize plans based on a learning goal
- Set a target deadline
- Specify available study hours per day
- Select a current knowledge level
- Markdown-formatted study plans
- Loading states during AI generation
- Frontend and backend error handling
- Form validation
- Automatic scrolling to invalid form fields
- Responsive user interface

## Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- React Markdown

### Backend

- Python
- FastAPI
- Google Gemini API

## How It Works

1. The user enters a learning goal.
2. The user selects a target deadline.
3. The user specifies how many hours they can study each day.
4. The user selects their current knowledge level.
5. The frontend sends this information to the FastAPI backend.
6. The backend sends the information to the Gemini API.
7. Gemini generates a personalized study plan.
8. The study plan is returned to the frontend and displayed using Markdown formatting.

## Live Demo

**[Try Study Buddy Live](https://study-buddy-git-master-emmanuel-08f1.vercel.app)**


## Running the Project Locally

### Backend

Navigate to the backend directory:

```bash
cd backend

Create a virtual environment:

```bash
python -m venv venv
```

Activate the virtual environment on Windows:

```bash
venv\Scripts\activate

add:

```md
Install the required dependencies:

```bash
pip install -r requirements.txt