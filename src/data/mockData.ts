/**
 * Type definitions used across the Mission Control UI.
 * NOTE: This file no longer exports mock data — all values come from /api/*.
 */

export type AgentKey = "comandante" | "cyber" | "flow" | "ledger";

/** Aviation-themed status derived from `lastActivity`. */
export type AgentStatus = "em_voo" | "taxiing" | "on_ground" | "hangar";

export interface Agent {
  key: AgentKey;
  name: string;
  status: AgentStatus;
  sessions: number;
  /** Pre-formatted relative string ("há 3 min"). */
  lastActivity: string;
  /** Raw ISO timestamp for sorting / further formatting. */
  lastActivityIso: string;
}

export interface Task {
  id: string;
  title: string;
  /** Section parsed from /api/tasks markdown. */
  column: "standby" | "in_progress" | "blocked" | "done";
  /** Optional agent prefix found in title (e.g. "**Comandante:**"). */
  agent?: AgentKey;
}

export interface VpsNode {
  id: string;
  name: string;
  region: string;
  cpu: number;   // %
  ram: number;   // %
  ramRaw: string; // "2.0Gi/7.6Gi"
  disk: number;  // %
  status: "online" | "warning" | "offline";
  uptime: string;
  containers: { name: string; status: string; healthy: boolean }[];
  banned: number;
}

export interface ActivityEvent {
  id: string;
  text: string;
  source: string;
  time: string;
}
