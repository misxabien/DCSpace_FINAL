# Database layout

DC Space uses **two MongoDB databases** on the same Atlas cluster. Every collection belongs to either the **user** or **admin** database.

| Database | Env var | Default |
|----------|---------|---------|
| User portal | `MONGODB_DB_NAME` | `dcspace_user` |
| Admin / events | `MONGODB_ADMIN_DB_NAME` | `dcspace_admin` |

## User database (`dcspace_user`)

Student and organizer portal data:

| Collection | Purpose |
|------------|---------|
| `users` | Accounts (students, faculty, organizers, admins) |
| `saved_events` | Bookmarked event IDs per user |
| `event_registrations` | Event sign-ups |
| `event_invitations` | Organizer invitations |
| `notifications` | In-app notifications |
| `attendance_records` | Tap-in / tap-out logs |
| `feedback_entries` | Post-event feedback |
| `certificates` | Issued certificates |
| `email_verifications` | Registration / reset codes |
| `event_gallery` | Organizer photo uploads |

## Admin database (`dcspace_admin`)

Event lifecycle and audit data:

| Collection | Purpose |
|------------|---------|
| `events` | All events (draft → completed) |
| `user_activities` | Audit log for admin dashboard |
| `event_reports` | Generated report snapshots |

## Code access

Use the centralized registry in `lib/db/`:

```ts
import { getUserDb, getAdminDb, eventsCollection, usersCollection } from "@/lib/db";

const userDb = await getUserDb();
const adminDb = await getAdminDb();

await usersCollection(userDb).findOne({ email });
await eventsCollection(adminDb).find({ status: "live" }).toArray();
```

## Migration

If you previously stored everything in `dcspace_user`, run:

```bash
node scripts/migrate-db-organize.mjs
node scripts/migrate-db-organize.mjs --drop-legacy
```

The first command copies admin collections into `dcspace_admin`. The second removes the old copies from the user database.

## Environment

Add to `.env`:

```env
MONGODB_DB_NAME=dcspace_user
MONGODB_ADMIN_DB_NAME=dcspace_admin
```
