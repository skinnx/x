# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Crimson Desert - 3D Action RPG (`artifacts/3d-game`)
- **Type**: react-vite (3D game)
- **Preview path**: `/`
- **Stack**: React + Three.js + React Three Fiber + @react-three/drei + Zustand
- **Features**:
  - Third-person 3D action RPG inspired by Crimson Desert
  - Keyboard controls: WASD to move, Space to dodge, F to attack
  - Wave-based enemy system — enemies spawn in rounds that get harder
  - Combo system (up to 3x combo for chained attacks)
  - Stamina system — attacks and dodges cost stamina
  - Blood particle effects on hit
  - Fantasy terrain with procedural height variation, trees, rocks
  - Atmospheric lighting with fog
  - Star field skybox
  - HUD: health bar, stamina bar, combo counter, score, wave counter
  - Game states: menu → playing → paused → game over
  - Error boundary for graceful WebGL fallback message

### Threadsmith - AI-native X thread scheduler (`artifacts/threadsmith`)
- **Type**: single-process Node app (Hono API + React/Vite UI on one port), self-hosted, no accounts
- **Run**: `cd artifacts/threadsmith && pnpm build && pnpm start` (dev: `pnpm dev`); see its README.md
- **Stack**: Hono + @hono/zod-openapi (zod v4), node:sqlite, React 19, Vite 8, Tailwind 4, TanStack Query, dnd-kit, Anthropic SDK, MCP SDK
- **Surfaces**: web UI, REST + OpenAPI (`/docs`), MCP (`/mcp`), CLI (`cli/threadsmith.mjs`), `/llms.txt`, webhooks, SSE, Web Push, Agent Skill
- **Config**: secrets in `.env` (X API keys optional, manual copy-and-post mode without them); posting slots in `threadsmith.config.json`
