# TEDxNTU 2027 Planner

A shared planning app for the TEDxNTU 2027 committee (event day: **19 September 2027**). One timeline, eight team columns, and a full record of **who changed what, when**. Hosted free on GitHub Pages; data lives in the admin's own Google Drive via a private Google Apps Script — the same approach as the Expenses app.

| File | Purpose |
|---|---|
| `index.html` | The whole app (timeline, teams, activity feed, people, admin panel) |
| `Code.gs` | Backend: paste into Google Apps Script once |

## How access works

- The **admin** (you) has an **admin code** (`TEDX1-A-…`). Keep it private.
- In the **Admin** tab you **generate one access code per person** and name it after them (e.g. `Nandini – Speaker Curation`). Each code is 6 characters like `7KQ2M9`.
- You send each person the **join link** + their code. They open the link, type the code and their name, and they're in.
- The admin panel shows, for every code: who redeemed it, from which device, when, and how many changes they've made. One click filters the Activity feed to that person. You can **rename**, **revoke** or **restore** a code at any time; revoking logs them out everywhere.
- Every edit (create, assign, status change, date move, note, update, delete) is stamped with the person's name and their access code, in the task's own history and in the global **Activity** feed.

## Setup (admin, ~5 minutes)

### 1. Backend (Google Apps Script)
1. Go to <https://script.google.com> → **New project**. Delete the sample code, paste the contents of `Code.gs`, save.
2. In the toolbar pick the function **`setup`** and click **Run**. Approve the permissions (it only touches a folder it creates: *My Drive → TEDxNTU Planner*). Open **Execution log** and copy the **ADMIN KEY**.
3. **Deploy → New deployment → Web app**. Execute as **Me**; who has access: **Anyone**. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).

### 2. Host the app (GitHub Pages)
1. Put `index.html`, `Code.gs` and this README in a public repo (e.g. `tedx-planner`).
2. **Settings → Pages → Deploy from a branch → main / (root)**. The app is live at `https://<username>.github.io/tedx-planner/` after a minute.

### 3. Connect
Open the app → **⚙** → paste the Web app URL and the admin key → **Build admin code** → **Connect with it now**. Then in **Admin** click **Load 2026 template** to start from last year's 52 milestones, and generate access codes for your team.

## Everyday use
- **Timeline** — Jan–Oct 2027 axis, cards coloured by team, filter by team/status/"mine".
- **Teams** — eight columns with done counts.
- **Activity** — live feed; filter by person or search.
- **People** — per person: tasks owned, done, changes made, last seen, device.
- Click a task to assign an owner, change status/date, add notes, or **post an update**.
- Syncs every 5 seconds while open, and immediately after every change.

## Updating the backend later
Paste the new `Code.gs`, then **Deploy → Manage deployments → ✎ → Version: New** so the same URL serves the new code. Your data file is untouched.
