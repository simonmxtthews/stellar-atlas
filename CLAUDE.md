# Stellar Atlas

Static, local-first web app that maps every known star system near the Sun in true 3D, for planning travel times and trade routes. `docs/PLAN.md` is the full spec.

## Commands

| Command           | What it does                             |
| ----------------- | ---------------------------------------- |
| `npm run data`    | Bake the catalogue into `public/data/`   |
| `npm run dev`     | Start the Vite dev server                |
| `npm run build`   | Type-check and build to `dist/`          |
| `npm run preview` | Serve the built `dist/` locally          |
| `npm test`        | Run Vitest unit tests                    |
| `npm run e2e`     | Build, then run Playwright smoke tests   |
| `npm run lint`    | Run ESLint and check Prettier formatting |
| `npm run format`  | Apply Prettier formatting                |

`npm run data -- --offline` rebuilds from `data/raw/` without re-querying the archive.

Use Node 22.22.2 or newer on the 22.x line (`.nvmrc`); `nvm install` picks it up. Node 23 is unsupported, and npm silently resolves older, vulnerable tool versions under it. Run `npx playwright install chromium` once before the first `npm run e2e`.

## Conventions

- Units: light-years everywhere in `src/`; parsecs only inside `scripts/`.
- No runtime network calls to external services. Commit generated `public/data/`; gitignore `data/raw/`.
- TypeScript strict, no `any`; catalogue types are read-only.
- Build milestone by milestone; a milestone is done when its acceptance boxes in `docs/PLAN.md` are ticked, tests pass and lint is clean. Stop and summarise after each.
- Ask before changing the `World` schema; any change bumps `schemaVersion` and adds a migration.

## Deployment

- Static build only (`vite build` → `dist/`); no server code, so both hosts serve the same output.
- **GitHub Pages**: `.github/workflows/deploy.yml` builds on push to `main` and deploys with `actions/deploy-pages`. Vite `base` comes from the `VITE_BASE` env var (`/<repo-name>/` for Pages, `/` elsewhere); load data via `import.meta.env.BASE_URL`.
- **Vercel**: import the repo, framework preset Vite, output `dist`; preview deploys per PR, production on `main`.
