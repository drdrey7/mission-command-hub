# Mission Command Hub

Frontend dashboard for your OpenClaw operations stack.

This repository is the **UI layer** for your Mission Control setup. It is built with **React 18 + TypeScript + Vite + Tailwind CSS** and expects a backend that exposes the API used in `src/services/api.ts`.

## What this repo is

- Static frontend app
- Mobile-friendly operator dashboard
- Connects to a real backend through `VITE_OPENCLAW_API_URL`
- Can also run in mock/demo mode for UI work

## What this repo is not

- Not the OpenClaw core
- Not the OpenClaw gateway
- Not the full backend by itself

## Run locally

```bash
npm install
npm run dev
```

Vite runs on:

```text
http://localhost:8080
```

## Build for deployment

```bash
npm run build
```

The production bundle is generated in `dist/` and can be served by any static web server.

## Environment variables

Create a `.env` file at the project root.

```env
VITE_OPENCLAW_API_URL=http://localhost:8780
VITE_OPENCLAW_TOKEN=
VITE_USE_MOCK=false
```

### Variable meaning

- `VITE_OPENCLAW_API_URL`: base URL of the backend used by the UI
- `VITE_OPENCLAW_TOKEN`: optional bearer token
- `VITE_USE_MOCK`: force mock mode for frontend-only work

## Real backend routes used by the frontend

This UI currently talks to routes such as:

- `GET /api/state`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks`
- `DELETE /api/tasks`
- `POST /api/tasks/generate-prompt`
- `POST /api/tasks/dispatch`
- `GET /api/tasks/:taskId/details`
- `POST /api/tasks/:taskId/reopen`
- `POST /api/tasks/:taskId/follow-up`
- `GET /api/missions`
- `POST /api/missions`
- `POST /api/missions/:id/abort`
- `GET /api/vps/snapshot`
- `POST /api/vps/nodes/:id/action`
- `GET /api/notifications`
- `POST /api/notifications/read`
- `GET /api/attention-signals`
- `GET /api/chat/:agent`
- `POST /api/chat/:agent`
- `POST /api/chat/:agent/transcribe`
- `GET /api/fail2ban/stats`
- `GET /api/fail2ban/jails`
- `GET /api/fail2ban/banned`
- `GET /api/fail2ban/seen`

For the exact request and response shapes, use:

- `src/services/api.ts`
- `src/data/mockData.ts`

## Task persistence

The UI does not own the task truth by itself.

In your current setup, the task board is backed by the Mission Control backend, which can in turn read from `TASKS.md` and related execution stores.

## Project structure

```text
src/
├── components/
├── data/mockData.ts
├── pages/Index.tsx
├── services/api.ts
└── ...
```

## Notes

- Keep backend contract changes in sync with `src/services/api.ts`
- Keep documentation aligned with the real Vite port and real API routes
- Do not treat this repo as the OpenClaw backend
