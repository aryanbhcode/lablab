# Corporate Truth Terminal

Corporate Truth Terminal is a market intelligence app that analyzes public company signals from jobs, reviews, pricing pages, news, and stored watchlist history. It produces truth scores, predictive intelligence, competitor battle maps, sentinel risk alerts, and natural-language answers over monitored companies.

## Stack

- Frontend: Next.js 14, React, TypeScript, Tailwind CSS, Framer Motion
- Backend: FastAPI, SQLite, Anthropic Claude, Bright Data, Resend
- Deployment: Vercel frontend, Railway backend

## Project Structure

```text
truth-terminal/
├── backend/          # FastAPI API service
├── frontend/         # Next.js app
├── README.md
└── start.sh          # Local dev helper
```

## Features

- Company analysis from a single domain input
- Watchlist monitoring with alerts
- Competitor Battle Map
- Natural-language agent queries over stored intelligence
- Sentinel Mode collapse-pattern warning system
- Predictive intelligence cards
- Railway-ready backend health checks and CORS

## Backend Setup

```bash
cd truth-terminal/backend
cp .env.example .env
pip install -r requirements.txt
PORT=8000 uvicorn main:app --reload --host 0.0.0.0 --port "$PORT"
```

The backend will expose:

```text
GET    /
GET    /health
POST   /analyze
POST   /battle-map
POST   /query
GET    /query/history
POST   /watchlist
GET    /watchlist
DELETE /watchlist/{company}
GET    /predictions/{domain}
GET    /sentinel/{domain}
```

## Frontend Setup

```bash
cd truth-terminal/frontend
cp .env.example .env.local
npm install
npm run dev
```

Set the frontend API URL in `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Open the local URL printed by Next.js.

## Required Backend Environment Variables

```env
ANTHROPIC_API_KEY=your_anthropic_key_here
BRIGHTDATA_API_TOKEN=your_brightdata_token_here
BRIGHTDATA_API_KEY=your_brightdata_key_here
BRIGHTDATA_ZONE=your_brightdata_zone_here
BRIGHTDATA_SERP_ZONE=your_brightdata_serp_zone_here
RESEND_API_KEY=your_resend_key_here
COGNEE_API_KEY=your_cognee_key_here
FRONTEND_URL=https://your-vercel-domain.vercel.app
CORS_ORIGINS=http://localhost:3000,https://your-vercel-domain.vercel.app
DATABASE_PATH=/data/truth_terminal.db
PORT=3000
```

Notes:

- `ANTHROPIC_API_KEY` is required for synthesis, battle maps, sentinel mode, and agent queries.
- `BRIGHTDATA_API_TOKEN` or `BRIGHTDATA_API_KEY` is required for scraping.
- `RESEND_API_KEY` is only required for email alerts.
- `DATABASE_PATH=/data/truth_terminal.db` is recommended on Railway with a mounted volume.

## Railway Backend Deployment

Use these Railway settings:

```text
Root Directory: truth-terminal/backend
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

The backend includes:

- `railway.json`
- `Procfile`
- `runtime.txt`

After Railway deploys, copy the Railway public URL.

## Vercel Frontend Deployment

Set this environment variable in Vercel:

```env
NEXT_PUBLIC_API_URL=https://your-railway-backend-domain.up.railway.app
```

Set these environment variables in Railway so the deployed Vercel frontend can call the API:

```env
FRONTEND_URL=https://your-vercel-domain.vercel.app
CORS_ORIGINS=http://localhost:3000,https://your-vercel-domain.vercel.app
```

The CORS origin should not include a trailing slash.

## Local Dev Shortcut

From `truth-terminal/`:

```bash
./start.sh
```

Optional ports:

```bash
PORT=8000 FRONTEND_PORT=3000 ./start.sh
```

## Verification

Backend:

```bash
curl http://localhost:8000/
curl http://localhost:8000/health
```

Expected health response:

```json
{"status":"healthy"}
```

Frontend:

```bash
cd truth-terminal/frontend
npm run build
```

## Data Persistence

The app uses SQLite. For production on Railway, attach a volume and set:

```env
DATABASE_PATH=/data/truth_terminal.db
```

Without a persistent volume, watchlist entries and analysis history may be lost across deploys or container restarts.

## Git Hygiene

Do not commit:

- `backend/.env`
- `frontend/.env.local`
- `frontend/.next/`
- `frontend/node_modules/`
- `backend/truth_terminal.db`
