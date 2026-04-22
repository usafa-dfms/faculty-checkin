# DFMS Faculty Check-In

A small emergency-recall web app for the USAFA Department of Mathematical
Sciences. Faculty sign in and mark themselves **Available**, **Unavailable**,
or **On leave**; an admin can pull up a live roster showing everyone's most
recent status.

Static site (HTML + CSS + vanilla ES modules). Hosted on GitHub Pages.
Backed by Firebase Auth (email/password) and Cloud Firestore.

---

## Files

| File              | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `index.html`      | Login page                                                |
| `app.html`        | Authenticated shell with Check-In / Roster / Account tabs |
| `app.js`          | Application logic                                         |
| `auth.js`         | Firebase init + shared `auth` / `db` exports              |
| `styles.css`      | Stylesheet                                                |
| `firestore.rules` | Security rules (deploy via Firebase console or CLI)       |
| `.nojekyll`       | Disables GitHub Pages' Jekyll processing                  |

No build step. No `node_modules`. Edit, commit, push.

---

## First-time setup

### 1. Firebase project

The current config in `auth.js` targets the `dfms-a47ff` project. If you're
using that project, you can skip this section.

To switch projects:

1. In the [Firebase console](https://console.firebase.google.com/), open
   **Project settings → General → Your apps** and grab the web app config.
2. Replace `firebaseConfig` in `auth.js` with the new one.
3. Repeat steps 2–5 below for the new project.

### 2. Enable Email/Password authentication

In the Firebase console:

- **Build → Authentication → Sign-in method**
- Enable **Email/Password** (leave "Email link" off).
- Optional but recommended: **Settings → User actions → Enable create (sign-up)**
  should be **disabled** so that only admins can add users.

### 3. Enable Firestore

- **Build → Firestore Database → Create database**
- Region: `nam5` (US multi-region) is fine.
- Start in **production mode** — the rules in `firestore.rules` will lock it down.

### 4. Deploy Firestore security rules

Either paste `firestore.rules` into **Firestore → Rules** in the console, or
use the Firebase CLI:

```sh
npm install -g firebase-tools
firebase login
firebase init firestore          # when prompted, use the existing firestore.rules file
firebase deploy --only firestore:rules
```

### 5. Create the Firestore index

The "personal history" query filters by `uid` and orders by `timestamp`, which
needs a composite index. Two ways to create it:

- **Easy way:** sign in to the app and click a status button. Then click
  "Check-In" again — the query will fail once and Firebase logs an error to
  the browser console with a direct link like
  `https://console.firebase.google.com/...create_composite=...`. Click it and
  press "Create index." Wait ~30 seconds.
- **Manual way:** Firestore console → **Indexes → Composite → Create index**
  - Collection ID: `checkins`
  - Fields: `uid` ascending, `timestamp` descending
  - Query scope: Collection

### 6. Add faculty users

In **Authentication → Users → Add user**, create an account per person with a
temporary password. Tell them to sign in, accept the display-name prompt, then
change their password under **Account → Change password**. They can also use
"Forgot password?" on the login page to set one themselves.

For bulk setup, use the Admin SDK or the `firebase auth:import` CLI command.

### 7. Publish to GitHub Pages

- Push to `main`.
- In the repo on GitHub → **Settings → Pages**
- Source: **Deploy from a branch**, branch: `main`, folder: `/ (root)`.
- Wait for the first build, then visit `https://<org>.github.io/<repo>/`.

### 8. Authorize the Pages domain in Firebase

Firebase Auth rejects sign-ins from unknown domains. Add your Pages domain:

- **Authentication → Settings → Authorized domains → Add domain**
- Enter `<org>.github.io`.

---

## Day-to-day tasks

### Add a new faculty member

1. Firebase console → **Authentication → Users → Add user**.
2. Give them the URL and a temporary password.
3. On first login they'll be prompted to set a display name.

### Remove someone

**Authentication → Users** → three-dot menu on the row → **Delete account**.
Their past check-ins remain in Firestore (audit trail); delete the docs
manually if you need to purge them.

### Reset someone's password

Two options:

- Have them click **Forgot password?** on the login page.
- Firebase console → **Authentication → Users** → three-dot menu → **Reset password**.

### Edit or delete a check-in

Client writes are immutable by design. To correct a bad entry, edit the doc
directly in **Firestore → Data → checkins**.

---

## Data model

Single top-level collection: **`checkins`**. Each document:

```js
{
  uid:         "abc123",               // Firebase Auth UID
  email:       "jane.doe@example.edu",
  displayName: "Jane Doe",             // snapshot at write time
  status:      "available",            // "available" | "unavailable" | "onleave"
  note:        "",                     // free-text, <= 500 chars
  timestamp:   <server timestamp>
}
```

Notes:

- No `users` collection. Display name lives on the auth record and is
  snapshotted onto every check-in. Changing your name only affects *future*
  entries — past rows preserve the name used at the time.
- The roster view is computed client-side: fetch the most recent 500
  check-ins ordered by timestamp desc, dedupe by `uid`, take the first
  occurrence per person. Trivially fast at department scale.
- **Caveat:** someone who has never checked in is invisible on the roster.
  For an emergency tool this may be worth improving later — see below.

---

## Promoting someone to admin (later)

There's no admin concept in the current build — every signed-in user can read
the full roster and write their own check-ins. When you need a real admin
role (to, for example, force-check-in on someone's behalf or delete bad
entries from the UI), the cleanest path is **Firebase custom claims**:

1. Locally, with the Admin SDK (a one-off Node script is fine):
   ```js
   const admin = require("firebase-admin");
   admin.initializeApp({ credential: admin.credential.applicationDefault() });
   await admin.auth().setCustomUserClaims("<uid>", { admin: true });
   ```
2. Update `firestore.rules` to grant extra privileges when
   `request.auth.token.admin == true` (e.g. allow `update`, `delete` on
   `checkins`).
3. In `app.js`, check `(await currentUser.getIdTokenResult()).claims.admin`
   and reveal admin-only UI.

No app rebuild needed when you flip the claim — the user just needs to sign
out and back in (or wait for the ID token to refresh).

## Possible future improvements

- **`users/{uid}` doc written on first login**, so people who haven't checked
  in yet still appear on the roster (shown as "Not checked in").
- **Push notifications** via FCM when an admin triggers a recall.
- **Map of check-in locations** (would need an explicit opt-in; not collected
  today).
- **Export filters** on the roster (status, time window).

---

## Local development

Because everything uses ES module imports from a CDN, you can't just
`open index.html` in a browser — ES modules need HTTP. Easiest:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000/
```

For Firebase Auth to accept `localhost`, add it to **Authentication →
Settings → Authorized domains** (it usually is by default).
