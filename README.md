# Openclaw Mission Control

Premium aviation-style Mission Control dashboard for the openclaw AI agents
(**comandante**, **cyber**, **flow**, **ledger**).

Built with **React 18 + TypeScript + Vite + Tailwind CSS**. Ships with a mock
data layer that you swap for your VPS API in **one place** (`src/services/api.ts`).

---

## 1. Run locally

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production bundle in dist/
```

## 2. Deploy to your VPS

The whole app is static. After `npm run build`, copy `dist/` to any web server.

```nginx
server {
  listen 80;
  server_name mission.openclaw.io;
  root /var/www/openclaw-mc/dist;
  index index.html;
  location / { try_files $uri /index.html; }
}
```

## 3. Connect your real backend

Create `.env` at the project root:

```env
VITE_OPENCLAW_API_URL=https://api.openclaw.io
VITE_OPENCLAW_TOKEN=your-bearer-token   # optional; or set localStorage.openclaw_token
```

Rebuild — `USE_MOCK` flips to `false` automatically when the URL is set.

### Endpoints expected

| Method | Path | Body | Returns |
|---|---|---|---|
| GET  | `/agents` | — | `Agent[]` |
| GET  | `/tasks` | — | `Task[]` |
| GET  | `/missions` | — | `Mission[]` |
| POST | `/missions` | `{ codename, objective, lead, squad, priority, eta }` | `Mission` |
| POST | `/missions/:id/abort` | — | `{ ok }` |
| GET  | `/vps/nodes` | — | `VpsNode[]` |
| POST | `/vps/nodes/:id/action` | `{ action: "restart"\|"snapshot"\|"scale" }` | `{ ok }` |
| GET  | `/audit?limit=50` | — | `ActivityEvent[]` |
| GET  | `/notifications` | — | `Notification[]` |
| POST | `/system/kill-switch` | `{ reason }` | `{ ok }` |
| POST | `/system/resume` | — | `{ ok }` |
| POST | `/chat/:agent` | `{ messages: [{role, content}] }` | `{ reply }` |

Types in `src/data/mockData.ts` and `src/services/api.ts`.
Auth: `Authorization: Bearer <token>` from env or `localStorage.openclaw_token`.

### Task execution store

The task list itself stays in `TASKS.md`, but execution history is persisted separately in:

`/root/.openclaw/projects/mission-control/data/task-executions.json`

That store keeps per-`taskId` execution runs, session keys, session ids, follow-up events, and timestamps so completed tasks can be reopened without losing their history.

## 4. Features

- 🛩️ Agent cards with orbiting plane + live flight timer
- 💬 Agent chat (slide-over) → `POST /chat/:agent`
- 🚀 Mission Builder dialog → `POST /missions`
- 🛰️ VPS panel with restart / snapshot / scale
- 🧠 Memory tab
- 📜 Audit trail with CSV export
- 🔔 Notifications popover
- 🛑 Kill switch
- 🌗 Light + dark theme

## 5. File map

```
src/
├── pages/Index.tsx
├── services/api.ts              # 🔌 SWAP HERE
├── data/mockData.ts
└── components/
    ├── theme/                   # ThemeProvider + toggle
    └── mission/
        ├── Hero.tsx
        ├── AgentCard.tsx
        ├── AgentBadge.tsx       # icon + orbit + FlightTimer
        ├── ActiveTasksPanel.tsx
        ├── SystemStatusPanel.tsx
        ├── RecentActivityPanel.tsx
        ├── OperationalTabs.tsx  # Missions / Memory / VPS / Audit
        ├── MissionBuilder.tsx
        ├── AuditTrail.tsx
        ├── VpsActions.tsx
        ├── AgentChat.tsx
        ├── NotificationsBell.tsx
        ├── KillSwitch.tsx
        └── CommandFooter.tsx
```

## 6. Suggested backend stack

- **FastAPI** or **Hono** for the REST surface
- **Postgres** for missions / audit / memory persistence
- **Redis** for live agent status pub/sub
- **LiteLLM** / OpenAI / Anthropic for `/chat/:agent`

Pousem com excelência. ✈️
