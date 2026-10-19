# Mini ChatGPT — Gemini API + Web Search + Offline FAQ

A beginner-friendly chatbot with a web UI, FastAPI backend, Google Gemini API, optional web search, and a lightweight offline fallback.

## Important offline limitation

Without internet, an API-only application cannot reach Gemini or search the web. This project falls back to a small built-in FAQ/rule-based responder. It does **not** generate open-ended answers like a full language model while offline, and it does not download a local AI model.

## 1. Requirements

- Python 3.10 or newer
- Internet connection for Gemini API and web search
- A Gemini API key from https://aistudio.google.com/apikey

## 2. Install

From this project folder, open Terminal:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

On Windows, activate with:

```powershell
.venv\Scripts\activate
```

## 3. Configure the API key

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` and replace `put_your_api_key_here` with your key. Do not share this file or commit it to GitHub. `.gitignore` excludes `.env`.

If the model name is not available to your API project, change `GEMINI_MODEL` to a model currently listed in Google AI Studio.

## 4. Start the application

Run from the project root:

```bash
uvicorn backend.main:app --reload
```

Open http://127.0.0.1:8000

API health check: http://127.0.0.1:8000/api/health

Interactive API docs: http://127.0.0.1:8000/docs

## 5. How it works

- Gemini API handles general questions while the API key, internet, and quota are available.
- The optional web search checkbox retrieves text results and sends snippets to Gemini as context.
- If Gemini fails, the backend returns a built-in offline FAQ response.
- Conversation history is kept in browser memory for the current page session. It is not stored in a database.
- Search results are untrusted; the model is instructed not to follow instructions inside them.

## Troubleshooting

- `GEMINI_API_KEY is missing`: check `.env` exists in the project root and contains a valid key.
- `404` or model not found: set `GEMINI_MODEL` to a model available to your API key.
- Quota or API errors: check usage and limits in Google AI Studio.
- Web search fails: the app can still ask Gemini without search results; the `ddgs` search provider may have availability/rate limits.
- `ModuleNotFoundError`: activate `.venv` and run `pip install -r requirements.txt`.

## Security

- Never place the Gemini key in `frontend/script.js`.
- Never commit `.env` to a public repository.
- For deployment, add authentication, request limits, logging controls, and appropriate secret management.
