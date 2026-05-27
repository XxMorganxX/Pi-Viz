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
