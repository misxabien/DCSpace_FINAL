# DC Space — Next.js Frontend

Next.js (App Router) port of the DC Space HTML prototype.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

## User vs admin links (Vercel)

One deployment can serve two public URLs. Attach both domains to the same Vercel project, then set:

```bash
NEXT_PUBLIC_USER_HOST=dcspace.vercel.app          # student / faculty
NEXT_PUBLIC_ADMIN_HOST=admin.your-domain.edu      # admin / super-admin
```

| Portal | Link |
|--------|------|
| User | `https://<NEXT_PUBLIC_USER_HOST>/` → `/login` |
| Admin | `https://<NEXT_PUBLIC_ADMIN_HOST>/` → `/admin` |

If those env vars are empty, both portals work on one host via paths (`/login` and `/admin`).

Local dual-host check: set `NEXT_PUBLIC_ADMIN_HOST=admin.localhost` and open [http://admin.localhost:3000](http://admin.localhost:3000).

## Routes

| Legacy HTML | Next.js route |
|-------------|---------------|
| `01-login.html` | `/login` |
| `09-home.html` | `/home` |
| `14-event.html` | `/events` |
| `36-profile.html` | `/profile` |
| `37-notif.html` | `/notifications` |

All 38 prototype pages are available under clean URLs. See `content/legacy/manifest.json` for the full map.

## Project structure

```
app/
  (auth)/          # Login, signup, forgot-password flow
  (app)/           # Main app pages (home, events, attendance, etc.)
components/
  layout/          # React sidebar shell
  legacy/          # Legacy HTML renderer + script loader
content/legacy/    # Extracted page content from HTML files
public/legacy/     # Original JS modules (events, feedback, tour, etc.)
scripts/
  convert-legacy.mjs  # Re-generate pages from parent HTML files
```

## Re-syncing from HTML prototypes

If you update the original `.html` files in the parent folder:

```bash
npm run convert:legacy
```

Then restart the dev server.

## Notes

- Page markup and styles are preserved from the HTML prototype via the legacy renderer.
- Interactive behavior still uses the original JS modules in `public/legacy/`.
- The sidebar is a React component with Next.js `Link` navigation.
- Auth is a frontend mock: one SDCA login resolves student vs organizer permissions (cookie session).
- Demo accounts: `organizer@sdca.edu.ph` / `student.organizer@sdca.edu.ph` (password: `password`) see **Events Organized**. Any other `@sdca.edu.ph` email signs in as a student.
