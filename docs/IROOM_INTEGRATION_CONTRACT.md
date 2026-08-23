# DC Space ↔ eRoomReserve Integration Contract

**Version:** 1.0  
**Date:** August 23, 2026  
**Systems:** DC Space (MongoDB) · eRoomReserve (Firebase)

---

## 1. Purpose

Connect DC Space and eRoomReserve **without sharing databases**. DC Space sends on-campus event room requests; eRoomReserve checks availability and performs first-level room approval; DC Space admin gives final event sign-off.

---

## 2. System Ownership

| System | Database | Owns |
|--------|----------|------|
| **DC Space** | MongoDB (`dcspace_user`, `dcspace_admin`) | Users, events, registrations, attendance, certificates |
| **eRoomReserve** | Firebase | Rooms, availability, reservation approval workflow |

Neither system reads or writes the other's primary database directly.

---

## 3. Integration Flow

1. Organizer submits **On Campus** event in DC Space (status: `pending`)
2. DC Space writes reservation to eRoom Firebase (status: `pending`)
3. Organizer opens eRoomReserve (optional deep link)
4. eRoomReserve checks availability → approves or rejects room
5. eRoomReserve calls DC Space webhook with status update
6. DC Space admin reviews event → final approve/reject
7. Event goes live for students

---

## 4. Data Exchange

### 4.1 DC Space → eRoomReserve (Firebase Write)

DC Space upserts two collections using a Firebase service account provided by eRoomReserve.

**Collection: `linkedUsers`** (document ID = normalized email)

| Field | Type | Required |
|-------|------|----------|
| `dcSpaceUserId` | string | Yes |
| `email` | string | Yes |
| `fullName` | string | Yes |
| `firstName`, `lastName` | string | No |
| `studentNumber` | string | No |
| `role` | string | No |
| `organizationPart`, `organizationRole` | string | No |
| `school`, `course` | string | No |
| `sourceSystem` | string | Always `"dcspace"` |
| `updatedAt` | ISO string | Yes |

**Collection: `reservations`** (document ID = `dcspace-{eventId}`)

| Field | Type | Set by | Required |
|-------|------|--------|----------|
| `reservationId` | string | DC Space | Yes |
| `sourceSystem` | string | DC Space | Always `"dcspace"` |
| `dcSpaceEventId` | string | DC Space | Yes |
| `eventTitle` | string | DC Space | Yes |
| `eventDescription` | string | DC Space | No |
| `eventCategory` | string | DC Space | No |
| `eventStatus` | string | DC Space | No |
| `venueType` | string | DC Space | `"On Campus"` |
| `locationLabel` | string | DC Space | No |
| `department` | string | DC Space | No |
| `collaboratingDepartments` | string[] | DC Space | No |
| `startAt`, `endAt` | ISO string | DC Space | Yes |
| `purpose` | string | DC Space | No |
| `conceptPaperUrl` | string | DC Space | No |
| `conceptPaperName` | string | DC Space | No |
| `requestedByUserId` | string | DC Space | No |
| `requestedByEmail` | string | DC Space | Yes |
| `requestedByName` | string | DC Space | Yes |
| `organizationName` | string | DC Space | No |
| `organizationRole` | string | DC Space | No |
| `school`, `course`, `studentNumber` | string | DC Space | No |
| `roomId`, `roomName`, `building` | string | **eRoom** | On approval |
| `status` | string | Both | `pending` → `approved` / `rejected` / `cancelled` |
| `rejectionReason` | string | **eRoom** | On rejection |
| `approvedBy`, `approvedAt` | string | **eRoom** | On approval |
| `createdAt`, `updatedAt`, `lastSyncedAt` | ISO string | Both | Yes |

**Collection: `rooms`** (eRoom-owned, DC Space read-only)

| Field | Type |
|-------|------|
| `roomId`, `roomName`, `building` | string |
| `capacity` | number |
| `isActive` | boolean |

---

### 4.2 eRoomReserve → DC Space (HTTPS Webhook)

**Endpoint:** `POST {DC_SPACE_BASE_URL}/api/integrations/iroom/webhook`

**Headers:**
```
Content-Type: application/json
X-Iroom-Secret: {shared secret}
```

**Approved example:**
```json
{
  "reservationId": "dcspace-674abc123",
  "dcSpaceEventId": "674abc123",
  "status": "approved",
  "roomId": "avr-101",
  "roomName": "AVR Room 101",
  "building": "Main Building",
  "approvedBy": "admin@sdca.edu.ph",
  "approvedAt": "2026-08-23T08:00:00.000Z"
}
```

**Rejected example:**
```json
{
  "reservationId": "dcspace-674abc123",
  "dcSpaceEventId": "674abc123",
  "status": "rejected",
  "rejectionReason": "No rooms available for the requested time slot."
}
```

**Valid `status` values:** `pending`, `approved`, `rejected`, `cancelled`

**Success response:** `200` with `{ "ok": true, "event": { ... } }`  
**Auth failure:** `401`  
**Validation failure:** `400`

eRoomReserve **must** call this webhook when:
- Room is approved (with `roomId`, `roomName`, `building`)
- Room is rejected (with `rejectionReason`)
- Reservation is cancelled

---

### 4.3 DC Space Endpoints (Reference)

| Method | Endpoint | Caller | Purpose |
|--------|----------|--------|---------|
| POST | `/api/integrations/iroom/reservations` | DC Space | Create/refresh reservation |
| GET | `/api/integrations/iroom/reservations?eventId=` | DC Space | Read room status |
| POST | `/api/integrations/iroom/webhook` | **eRoomReserve** | Push status updates |

---

## 5. Deep Link (Organizer Handoff)

When configured, DC Space opens:

```
{IROOM_APP_URL}?reservationId=dcspace-{eventId}&dcSpaceEventId={eventId}&source=dcspace
```

eRoomReserve should load the reservation and show event details for room selection/approval.

**Concept paper URL** (relative from DC Space):

```
{DC_SPACE_BASE_URL}/api/events/{eventId}/attachments/concept-paper
```

---

## 6. Credentials to Exchange

| From eRoomReserve → DC Space | From DC Space → eRoomReserve |
|------------------------------|------------------------------|
| Firebase Project ID | Production webhook URL |
| Firebase Service Account JSON | `IROOM_WEBHOOK_SECRET` (shared) |
| `IROOM_APP_URL` (reserve page) | Staging webhook URL (optional) |
| Shared webhook secret | DC Space base URL |

**DC Space environment keys:**
```
IROOM_FIREBASE_PROJECT_ID=
IROOM_FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
IROOM_APP_URL=https://your-iroom-app.example/reserve
IROOM_WEBHOOK_SECRET=
IROOM_USERS_COLLECTION=linkedUsers
IROOM_RESERVATIONS_COLLECTION=reservations
```

---

## 7. Approval Responsibilities

| Stage | Owner | Action |
|-------|-------|--------|
| **1 — Room request** | DC Space | Event submitted, reservation written to Firebase |
| **2 — Availability + room approval** | eRoomReserve | Check slots, assign room, webhook status |
| **3 — Final event approval** | DC Space admin | Approve/reject event for publication |

For on-campus events, DC Space admin final approval should only happen after eRoomReserve sets `status: "approved"`.

---

## 8. Security Requirements

- All traffic over **HTTPS** in production
- Webhook authenticated via **`X-Iroom-Secret`** header
- Firebase service account scoped to write `linkedUsers` + `reservations` only
- Do **not** sync passwords, auth tokens, attendance, registrations, or full media files
- Webhook retries recommended on failure (exponential backoff, max 5 attempts)

---

## 9. Status Lifecycle

```
none → pending → approved  (happy path)
              → rejected  (no room / policy)
              → cancelled (event cancelled in either system)
```

Both systems mirror status:
- **eRoom Firebase:** `reservations.status`
- **DC Space Mongo:** `events.iroomStatus`, `events.iroomRoomId`, `events.iroomRoomName`

---

## 10. eRoomReserve Delivery Checklist

- [ ] Firebase `linkedUsers` + `reservations` collections created
- [ ] Service account issued to DC Space team
- [ ] Reservation review UI (filter `sourceSystem = "dcspace"`)
- [ ] Room availability check for `startAt` / `endAt`
- [ ] Approve/reject workflow with room assignment
- [ ] Webhook caller to DC Space on every status change
- [ ] Deep-link page for `reservationId` + `dcSpaceEventId`
- [ ] Handle `cancelled` when DC Space cancels/postpones event
- [ ] Staging environment tested end-to-end

---

## 11. Contacts

| Role | Team | Contact |
|------|------|---------|
| DC Space backend | | |
| eRoomReserve backend | | |
| Shared secret owner | | |

---

## 12. References

- Full spec: `docs/IROOM_INTEGRATION.md` (DC Space repo)
- Webhook handler: `app/api/integrations/iroom/webhook/route.ts`
- Reservation sync: `lib/iroom/sync.ts`

---

**Signatures**

| DC Space | eRoomReserve |
|----------|--------------|
| Name / Date | Name / Date |
