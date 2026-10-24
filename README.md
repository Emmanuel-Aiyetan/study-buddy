# AI Study Buddy

[Try the live app](https://study-buddy-alpha-olive.vercel.app)

Turn a learning goal into a practical daily plan, study uploaded PDFs with an AI tutor, and track your progress.

## Features

- Supabase signup, login, password recovery, and private PDF storage.
- Gemini-generated plans with milestones, dated tasks, and validated daily workloads.
- Adaptive catch-up schedules: preview dates, change availability/deadline, and atomically reschedule unfinished work without changing completed tasks. Scheduling uses task order and available time; it does not claim to predict mastery.
- PDF summaries, contextual tutoring, and five-question quizzes with explanations.
- Saved quiz attempts and missed-question review lists (latest 20 attempts).
- Local-date current/best streaks, seven-day activity, overdue counts, and estimated minutes completed.
- Monthly calendar agenda and downloadable `.ics` calendars with reminders.
- Study session timer and task completion tracking.

## Architecture

Next.js 16 / React 19 / TypeScript talks directly to Supabase Auth, Postgres and private Storage under row-level security. AI requests carry the Supabase access token to FastAPI. FastAPI verifies it with Supabase, limits requests per user, extracts PDF text, and calls Gemini. The Gemini key stays on the server. Adaptive scheduling previews run locally; a Postgres function validates and applies the complete change in one transaction.

```
Browser -> Supabase Auth / Postgres / private Storage
Browser -> FastAPI -> Supabase token verification
                  -> PDF text extraction -> Gemini
```

## Local setup

Use Node.js 24 and Python 3.11. Development and production builds use Next.js’s supported Webpack compiler for compatibility with this Windows environment. The UI uses its existing system font, so builds do not need a Google Fonts download. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`. Fill in your project values. Never commit credentials. Supabase publishable/anon keys belong in the browser; service-role keys do not.

### Database (review before running)

Back up the database and review the migrations against the existing schema first. In a Supabase development project, run these files in order with the SQL editor:

1. `supabase/migrations/001_baseline.sql` creates missing tables and the profile trigger; existing records remain.
2. `supabase/migrations/002_adaptive_security.sql` adds quiz history, indexes, ownership guards, a private 10 MB PDF bucket, and the adaptive-plan function.

The guards are restrictive policies, so an older broad policy cannot bypass ownership checks. Bucket settings become private and PDF-only. These are intended security changes; verify existing filenames follow `user-id/plan-id/file.pdf` before applying. The adaptive function rejects stale previews, foreign tasks, completed-task changes, missing/duplicate tasks, invalid dates, and excess daily workload. It saves all changes or none.

Configure Supabase Auth Site URL and allowed redirects for your frontend URL and `/reset-password`. For local work allow `http://localhost:3000/**`. Keep email confirmation enabled in production.

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are required for API authentication, in addition to `GEMINI_API_KEY`. `GEMINI_MODEL` defaults to the project's existing `gemini-3.6-flash`; set an available model for your account. `CORS_ORIGINS` is a comma-separated list of exact frontend origins.

### Frontend (second terminal)

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The public API URL is embedded at build time; rebuild after changing it.

## Validation

```powershell
cd frontend
npm test
npm run lint
npm run build
```

```powershell
cd backend
python -m unittest discover -s tests -v
```

```powershell
cd supabase
npm ci
npm test
```

The database tests use an in-memory PostgreSQL engine with mocked Supabase auth/storage schemas. They test migration repeatability, ownership isolation, invalid/stale schedules, and rollback. They do not replace testing migrations in a Supabase staging project. Backend tests mock Gemini, so no paid AI calls occur. CI checks the frontend, backend, and database.

For a release, test with two separate accounts: create a plan, mark tasks complete, adapt it, reload, upload a PDF, analyze it, ask a follow-up, submit a quiz, reload quiz history, and export a calendar. Confirm neither account can access the other's rows or files. Test expired sessions and password reset links. Check phone and desktop layouts.

## Deployment

Deployment and pushes require owner approval. No deployment runs as part of the test commands.

- Review and test migrations in a staging Supabase project, then approve applying them to production.
- Render: use `backend` as the root, install `requirements.txt`, and start `uvicorn main:app --host 0.0.0.0 --port $PORT`. `render.yaml` supplies a health check and disables automatic deployments for a newly configured service. Existing Render service settings must be reviewed separately.
- Vercel: use `frontend` as the root and set the three `NEXT_PUBLIC_*` values from the example before building. Check existing Git deployment settings before approving a push.
- Set backend Supabase credentials, Gemini credentials/model and exact CORS origins. Deploy the authenticated backend and matching frontend together; older frontend builds do not send tokens.
- Verify `/health`, authentication redirects and the full release flow after deployment. Keep the previous deployment available for rollback. Database migrations are additive; do not drop quiz history when rolling back application code.

## Limits and behavior

PDFs must be unencrypted, text-based, no more than 10 MB and 200 pages. AI receives at most the first 50,000 extracted characters. Uploaded text is sent to the configured AI provider when the learner requests analysis/tutoring/quizzes. AI output may be incorrect; check it against the source material.

API rate limiting is 20 AI requests per minute per user **per process**. Use a shared limiter and upstream request-body limits before scaling across workers. Large uploads may be parsed by the web framework before route validation. Study materials remain in the private storage bucket until removed by the owner/project administrator.

Streaks count completed tasks by the browser's local completion date. Estimated minutes are task estimates, not timer measurements. The study timer is session-only and resets on reload. Quizzes are self-study results submitted by the client, not secure exam scores.

Calendar events use all-day dates and stable task IDs. Reminders request 9 AM on the preceding day; delivery depends on the calendar app's import/notification settings. The export is a snapshot, not a live subscription: after adapting a plan, replace/reimport events according to your calendar's duplicate handling. The website does not send background email or push notifications.
