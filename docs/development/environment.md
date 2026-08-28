# Environment variables

Copy `.env.example` to `.env.local` for local development, then provide only the values needed by the command you are running. Never commit `.env.local` or any other secret-bearing environment file, and never log environment variable values.

## Variables

- `DATABASE_URL` is the pooled PostgreSQL connection used for application runtime access. It is server-only.
- `DATABASE_URL_UNPOOLED` is the direct PostgreSQL connection preferred for migrations. It is server-only. Migration tooling may fall back to `DATABASE_URL` when a direct connection is unavailable.
- `NEXT_PUBLIC_MAP_STYLE_URL` is the MapLibre style URL. It is intentionally public and may be included in the client bundle. The local default is `/map-style.json`.
- `HEROUI_AUTH_TOKEN` is used only while installing licensed HeroUI Pro packages. Keep it in local secure storage, GitHub Actions secrets, or Vercel encrypted environment variables. Do not expose it to application runtime code or the client bundle.

Treat all variables without the `NEXT_PUBLIC_` prefix as server-only. When diagnosing configuration, report whether a variable is present, never its value.
