# Repository Guidelines

## Project Structure & Module Organization
- App router: `src/app` (pages, API routes under `src/app/api/**/route.ts`).
- UI components: `src/components` (React, `.tsx`, PascalCase file names).
- Core logic and utilities: `src/lib` (TypeScript modules; prefer kebab-case or concise camelCase like `plateUrl.ts`).
- Public assets: `public`.
- Dev sandboxes: `src/app/dev/*` for experiments and manual testing.

## Build, Test, and Development Commands
- `npm run dev` — Run Next.js locally on port 3001.
- `npm run build` — Production build (Turbopack).
- `npm start` — Start the production server.
- `npm run lint` — Lint the codebase with ESLint.

Environment: create `.env.local` with keys as needed (e.g., `OPENAI_API_KEY`, `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `STRIPE_SECRET_KEY`, `PUBLIC_BASE_URL`). Do not commit secrets.

## Coding Style & Naming Conventions
- Language: TypeScript, React Server/Client Components.
- Indentation: 2 spaces; keep lines < 100 chars when reasonable.
- Components: PascalCase (`FurniturePreview3D.tsx`). Hooks: `useXyz.ts`.
- Modules in `src/lib`: concise, descriptive file names (kebab-case preferred; existing mix like `plateUrl.ts` is acceptable—be consistent within a feature).
- Styling: Tailwind CSS v4 (`@tailwindcss/postcss` via `postcss.config.mjs`). Prefer utility classes over custom CSS; global styles in `src/app/globals.css`.
- Linting: ESLint with `eslint-config-next`. Fix warnings before PR.

## Testing Guidelines
- No formal test runner yet. Use `src/app/dev/*` pages for manual and visual checks.
- Add type-level tests via strict TypeScript types and narrow Zod schemas where applicable.
- When adding tests later, mirror file structure and name tests `<file>.test.ts`.

## Commit & Pull Request Guidelines
- Commits: short, imperative, lower-case summaries (e.g., `add all missing routers`, `3d render`). Group related changes.
- PRs: include a clear description, steps to validate locally, screenshots for UI, and note required env vars. Link issues if applicable.
- Keep diffs focused; update or add dev pages under `src/app/dev/*` to demonstrate new behavior.

## Security & Configuration Tips
- Never log or commit secrets. Use `process.env` with fallbacks only where safe.
- External services: OpenAI, Upstash Redis, Stripe. Ensure keys exist before calling; fail fast with helpful messages.
