# Agent Viz Deployment

`agent-viz` deploys as a Vite React app plus a long-running trace API server.
The production server can serve both from one origin:

- `GET /` and browser routes: Vite build output from `dist/`
- `GET /api/data`: current trace snapshot
- `GET /api/stream`: live Server-Sent Events stream
- `POST /api/events` or `POST /events`: trace event ingest
- `GET /api/health` or `GET /health`: health check

## Docker

Build and run locally:

```bash
docker build -t agent-viz .
docker run --rm -p 8080:8080 -e TRACE_API_TOKEN=change-me agent-viz
```

Open `http://localhost:8080`. The frontend defaults to same-origin `/api`, so it will contact the API server in the same container.

Configure Pi or any trace producer with:

```bash
PI_TRACE_URL=http://localhost:8080/events
PI_TRACE_TOKEN=change-me
```

For a hosted deployment, replace `localhost:8080` with the public app origin.

## Railway

Railway builds the `Dockerfile` (config in `railway.json`) and serves the frontend
and trace API from one public origin. The container reads `PORT` from Railway and
serves the built `dist/` via `AGENT_VIZ_STATIC_DIR=dist` (set in the Dockerfile).

From this directory (`agent-viz/`, the repo root):

```bash
# one-time
npm i -g @railway/cli
railway login
railway init        # or: railway link  (to attach to an existing project)

# deploy
railway up
```

Or connect the GitHub repo (`Instalily/Lily-Runtime-Visualizer`) in the Railway
dashboard and set this directory as the service root for push-to-deploy.

Set service variables in Railway before exposing a public domain:

- `TRACE_API_TOKEN` — **required**. Without it, trace reads and writes are open to anyone.

Then generate a public domain (Railway detects port `8080` from the Dockerfile).
Health check is `GET /api/health`.

Point local Pi at the public origin:

```bash
PI_TRACE_URL=https://<your-app>.up.railway.app/events
PI_TRACE_TOKEN=<TRACE_API_TOKEN>
```

Your Mac only needs outbound internet — the harness pushes events to Railway, and
browsers anywhere read the live stream from the same origin. Nothing on your machine
is exposed.

## Node Host Without Docker

```bash
npm ci
npm run build
PORT=8080 AGENT_VIZ_STATIC_DIR=dist TRACE_API_TOKEN=change-me npm start
```

## Production Notes

- Set `TRACE_API_TOKEN` in production. Without it, trace reads and writes are unauthenticated.
- The current trace store is in-memory. Restarting the process clears live traces.
- The app uses Server-Sent Events, so the host or proxy must allow long-lived HTTP responses for `/api/stream`.
