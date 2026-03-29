# Spatial AI Lab

A real-time performance benchmark that visualises the layout cost of streaming LLM output. It compares two rendering strategies side-by-side while a live Gemini stream drives the content.

**Live demo:** https://www.protimroy.com/spatial-ai-lab

---

## What it measures

| Mode | Strategy | Cost |
| :--- | :--- | :--- |
| **Traditional** | `getBoundingClientRect()` after every token | Layout thrashing — forced reflows visible as jank |
| **Pretext** | `@chenglou/pretext` arithmetic layout | Zero DOM reads — stays at 120 fps |

Metrics tracked in real time: FPS, layout budget (ms), forced reflow count, and reflow-to-token ratio.

---

## Architecture

```
Browser (GitHub Pages)
  └── src/App.tsx          React frontend, streams text from Worker
        │
        ▼
Cloudflare Worker          Proxy — holds the API key, never exposes it
  └── worker/index.ts
        │
        ▼
Gemini API (gemini-2.0-flash-lite)
```

The Gemini API key lives exclusively in Cloudflare's encrypted secrets store. It is never embedded in the frontend bundle.

---

## Local development

**Prerequisites:** Node 20+, a [Cloudflare account](https://dash.cloudflare.com/sign-up) (free), a [Gemini API key](https://aistudio.google.com/app/apikey).

### 1. Install dependencies
```bash
npm install
```

### 2. Deploy the Cloudflare Worker and set the secret
```bash
npx wrangler login
npx wrangler deploy --config worker/wrangler.toml
npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.toml
# paste your key when prompted — it is stored encrypted, not in any file
```

### 3. Create `.env` at the project root
```
VITE_WORKER_URL=https://spatial-ai-lab-proxy.<your-subdomain>.workers.dev
```

### 4. Run the dev server
```bash
npm run dev
```

Optionally run the Worker locally instead (no remote calls during dev):
```bash
# Terminal 1
echo "GEMINI_API_KEY=your_key" > worker/.dev.vars
npx wrangler dev --config worker/wrangler.toml

# Terminal 2
echo "VITE_WORKER_URL=http://localhost:8787" > .env
npm run dev
```

---

## Deployment (CI/CD via GitHub Actions)

Every push to `master` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the app and publishes to the `gh-pages` branch automatically.

**Required GitHub Actions secrets** (repo → Settings → Secrets → Actions):

| Secret | Value |
| :--- | :--- |
| `VITE_WORKER_URL` | Your Worker URL from Step 2 above |

No `GEMINI_API_KEY` secret is needed in GitHub — the key lives only in Cloudflare.

---

## Project structure

```
├── src/
│   └── App.tsx              Main React app
├── worker/
│   ├── index.ts             Cloudflare Worker proxy
│   └── wrangler.toml        Worker config
├── .github/workflows/
│   └── deploy.yml           CI deploy to GitHub Pages
├── vite.config.ts
└── .gitignore               Excludes .env, dist/, worker/.wrangler/
```

