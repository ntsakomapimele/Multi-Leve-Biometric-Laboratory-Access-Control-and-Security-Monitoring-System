# SentryLab Console

A React (Vite) frontend for the `access_control` Django REST backend — a
biometric lab access-control system (laboratories, biometric profiles,
access permissions, authentication log, security events).

## What's here

- JWT login against `/api/token/` (SimpleJWT), with automatic refresh via
  `/api/token/refresh/` on 401s.
- **Dashboard** — live counts and a recent-activity feed.
- **Laboratories** — full CRUD (`/api/laboratories/`).
- **Biometric Profiles** — full CRUD (`/api/biometric-profiles/`).
- **Access Permissions** — full CRUD, with a laboratory picker
  (`/api/access-permissions/`).
- **Authentication Log** — read-only feed with Granted/Denied filters,
  delete for cleanup (`/api/authentication-events/`).
- **Security Events** — CRUD plus a Resolve/Reopen toggle
  (`/api/security-events/`).
- **Simulate Scan** — calls `/api/authenticate/` directly, the same
  endpoint a physical badge reader would hit, and shows the GRANTED/DENIED
  decision.

Every page reads the backend's DRF permission errors directly rather than
guessing a user's role client-side — there's no `/api/me/` endpoint, so the
sidebar shows every section to any authenticated user, and a 403 from the
API renders a "Restricted" panel with the exact message the permission
class (`IsAdministrator`, `CanViewSecurityEvents`, `CanManageLaboratories`,
etc.) returned.

## Setup

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies `/api/*` to
`http://localhost:8000` (see `vite.config.js`), so it talks to the Django
backend without needing `django-cors-headers` installed. Start the backend
separately:

```bash
cd ../backend
python manage.py runserver
```

### Backend accounts & groups

The backend has no self-signup — create users and assign them to the
groups the permission classes check for via Django admin
(`/admin/`) or the shell:

```bash
python manage.py createsuperuser
```

Then, in `/admin/`, create the groups `Administrator`, `Security Officer`,
and `Laboratory User`, and add users to them:

| Group | Can do |
|---|---|
| Administrator | Everything, including writing laboratories |
| Security Officer | View/manage authentication + security events, read laboratories |
| Laboratory User | Read laboratories only |

`BiometricProfile` and `AccessPermission` just require `IsAuthenticated` —
any logged-in user can manage them.

Because there's no `/api/users/` list endpoint on the backend, the
Biometric Profiles and Access Permissions forms take a raw Django **user
ID** rather than a name picker — look IDs up in `/admin/`.

### Production build

```bash
npm run build
```

Outputs static files to `dist/`. Set `VITE_API_BASE_URL` (see
`.env.example`) if the backend isn't reachable at a same-origin `/api`
path in production.
