# Contributing guidelines

Here is some help to contribute to this project.

## Architecture and Data Flow

Put here or link out to high level information to understand the application architecture.

## Branching convention

Describe the branching strategy (GitHub flow,  Git flow), branch naming convention, submission process (PR reviews).

## Change instructions

- Commit titles
- Change log update guideline
- Branch protection, code owners
- PR title and description
- You break it (build), you fix it.

## Developer environment

- **Backend** (FastAPI, Python 3.12): `cd backend`, create a venv, `pip install -r requirements.txt`, then `python run_server.py` (listens on `0.0.0.0:8000`). Backend configuration lives in `backend/config/.env` (the only env file the backend loads). On Windows, run with `PYTHONUTF8=1` to avoid console-encoding crashes.
- **Frontend** (Next.js 14): `cd frontend`, `npm install`, `npm run dev` (port 3000).
- **Frontend → backend URL**: all API calls go through `getApiUrl()` (`frontend/lib/api-config.ts`), controlled by `NEXT_PUBLIC_API_URL` in `frontend/.env.local`. Unset, it derives the backend from whatever host served the page (`http://<page-host>:8000`), so plain `localhost` dev **and** LAN sharing via `http://<LAN-IP>:3000` both work with no hardcoded IP. Set `NEXT_PUBLIC_API_URL` only when the backend is not co-located with the frontend on `:8000`. (`NEXT_PUBLIC_BACKEND_URL`/`NEXT_PUBLIC_API_BASE` are retired — do not reintroduce them.)
- **CORS**: extra allowed origins (e.g. a LAN IP) go in the `EXTRA_CORS_ORIGINS` env var (comma-separated) in `backend/config/.env`, not in code.
- **Tests**: backend — `python -m pytest` from the repo root (scoped to `backend/tests` via pytest.ini; requires `pytest`, `pytest-timeout`, `pytest-html`); frontend — `npx tsc --noEmit` for typechecking.

## How to get credentials

Describe how to get the credential a developer needs.
