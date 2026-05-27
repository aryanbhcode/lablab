## Setup

### 1. Get your API keys
- Bright Data: brightdata.com → sign up → create a Web Unlocker zone → copy API token and zone name
- Anthropic: console.anthropic.com → API keys → create key

### 2. Backend
cd backend
cp .env.example .env
# Fill in your keys in .env
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

### 3. Frontend  
cd frontend
npm install
npm run dev

### 4. Open http://localhost:3000
