# Vercel preview deployment

The Vercel project is named `mke-service-equity`. Configure its Root Directory as `apps/web`, Framework Preset as Next.js, and Node.js version as 24. A code deployment never publishes a score run; the public application will read only an explicitly `published` run once later plans add analytical data.

## Environment boundary

Configure values through Vercel's encrypted environment settings. Never pass values on a command line or commit them.

| Variable | Exposure | Preview policy |
| --- | --- | --- |
| `HEROUI_AUTH_TOKEN` | Secret, install/build only | Required so licensed Pro artifacts can hydrate during install |
| `DATABASE_URL` | Server-only | May target only an approved isolated non-production Neon branch |
| `DATABASE_URL_UNPOOLED` | Server-only | May target only the same isolated branch; never used in browser code |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Public | Optional; provider attribution must remain visible |

Do not attach a production database to a preview. The approved `moo-750-foundation` branch expires after seven days and may be replaced only by another explicitly confirmed development branch.

## Link and inspect

Run the identity check before changing local project linkage:

```bash
vercel whoami
vercel link --cwd apps/web --project mke-service-equity --yes
vercel env ls --cwd apps/web
```

The environment listing may be recorded by variable name and scope only. Never record values.

## Create a preview

Force the preview target so a newly created project cannot be promoted implicitly:

```bash
vercel deploy --cwd apps/web --target preview
```

Verify the returned HTTPS URL at 375 and 1440 px, including keyboard focus, the responsive Sidebar, MapLibre controls and attribution, the explicit no-analytical-layers status, and the absence of secrets in browser source and network responses.
