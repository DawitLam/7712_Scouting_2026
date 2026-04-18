# Team 7712 — Slack → Supabase → Dashboard Integration

Full end-to-end pipeline that gets scouting CSVs from Slack into the live
dashboard without any manual copy-pasting.

```
Slack channel                    Supabase                     Dashboard
(CSV pasted or                   (match_scouting +            (Vercel — separate
 file uploaded)  ─── Bot ──────► pit_scouting tables) ──────► project, REST fetch)
```

> **No changes to the existing scouting app** (`index.html`, `app.js`, `sw.js`).
> The bot and dashboard live in their own directories and Vercel/Railway projects.

---

## File map

```
7712_Scouting_2026/
├── supabase/
│   └── schema.sql          ← run once in Supabase SQL editor
│
├── slack-bot/              ← Node.js bot (deploy to Railway or Render)
│   ├── index.js
│   ├── lib/
│   │   ├── parse-csv.js
│   │   ├── supabase.js
│   │   └── slack.js
│   ├── package.json
│   ├── railway.json
│   └── .env.example
│
├── dashboard/              ← standalone Vercel deployment (separate from app)
│   ├── index.html          ← dashboard.html + Supabase fetch button
│   └── vercel.json
│
└── render.yaml             ← Render blueprint (root of repo)
```

---

## Step 1 — Create the Supabase project

1. Go to <https://supabase.com> → **New project**.
2. Note your **Project URL** and two keys (Settings → API):
   - `anon / public` key — for the browser dashboard
   - `service_role` key — for the bot (keep secret)
3. Open **SQL Editor → New query**, paste the contents of
   `supabase/schema.sql`, and click **Run**.
   This creates `match_scouting`, `pit_scouting`, and the view.

---

## Step 2 — Create the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App → From scratch**.
2. Name it `7712 Scouting Bot`, pick your workspace.

### OAuth scopes (OAuth & Permissions → Bot Token Scopes)

| Scope | Why |
|---|---|
| `channels:history` | Read messages in public channels |
| `groups:history` | Read messages in private channels |
| `files:read` | Download uploaded CSV files |
| `chat:write` | Post result summaries back to the channel |

3. **Install to workspace** → copy the **Bot User OAuth Token** (`xoxb-…`).
4. Copy the **Signing Secret** from *Basic Information → App Credentials*.

### Event subscriptions

Once the bot is deployed and has a public URL (Step 3):

1. *Event Subscriptions* → **Enable Events** → set Request URL to  
   `https://YOUR-BOT-URL.up.railway.app/slack/events`
2. Subscribe to **bot events**:
   - `message.channels`
   - `message.groups`
   - `file_shared`
3. Save.

### Invite the bot to your scouting channel

```
/invite @7712ScoutingBot
```

---

## Step 3 — Deploy the bot

### Option A — Railway (recommended)

1. Push the repo to GitHub (or connect the folder).
2. <https://railway.app> → **New Project → Deploy from GitHub repo**.
3. Set the **Root Directory** to `slack-bot`.
4. Add environment variables in Railway's *Variables* tab:

   ```
   SLACK_BOT_TOKEN        xoxb-…
   SLACK_SIGNING_SECRET   …
   SUPABASE_URL           https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY   …
   SCOUTING_CHANNEL_IDS   C012AB3CD   (optional — comma-separated)
   PORT                   3000
   ```

5. Railway auto-deploys on push. Copy the generated public URL.
6. Paste it into Slack's Event Subscriptions → Request URL (append `/slack/events`).

### Option B — Render (free tier)

1. Push to GitHub.
2. <https://render.com> → **New → Web Service** → connect repo.
3. Set **Root directory** = `slack-bot`, **Build** = `npm install`,
   **Start** = `npm start`.
4. Add the same environment variables from the table above under *Environment*.
5. The public URL is shown in the Render dashboard.
   Paste it into Slack as `https://YOUR-SERVICE.onrender.com/slack/events`.

> **Free-tier cold starts**: Render spins down after 15 min of inactivity.
> The bot still works — Slack retries the event for up to 3 minutes.
> For always-on, use Railway's hobby plan or Render's paid tier.

---

## Step 4 — Deploy the dashboard

The `dashboard/` folder is a **completely separate Vercel project** from the
existing scouting app.

```bash
# From the repo root:
cd dashboard
npx vercel --prod
# Follow the prompts — create a NEW project (not the existing app project)
```

Or via the Vercel web UI: **Add New Project → Import Git Repository →**
set **Root Directory** to `dashboard`.

You'll get a URL like `https://7712-dashboard.vercel.app`.

---

## Step 5 — Configure the dashboard

1. Open your new dashboard URL.
2. Click **⚙ Config** in the green Supabase panel.
3. Enter:
   - **URL**: `https://xxxx.supabase.co`
   - **Key**: your `anon / public` key (safe to use in the browser)
4. Click **Save**.
5. Click **⚡ Load from Supabase** — all rows appear instantly.
6. Optionally tick **Auto-refresh every 60 s**.

The URL and key are saved in `localStorage` so you only configure once per browser.

---

## How it works

### Pasted CSV text

When a scout pastes raw CSV into the Slack channel, the bot:
1. Detects the `Type,` header row in the text.
2. Parses every row with a full RFC-4180 parser (handles embedded newlines).
3. Upserts match rows into `match_scouting` and pit rows into `pit_scouting`.
4. **Skips duplicates** using `ON CONFLICT DO NOTHING` on unique keys:
   - Match: `(match, team, alliance, scout)`
   - Pit:   `(team, scout)`
5. Replies in-thread with a summary: *"3 new, 2 duplicates skipped"*.

### Uploaded CSV files

Same flow, but the file is downloaded via Slack's `files.read` scope before
parsing.  Only `.csv` / `.txt` MIME types that contain a scouting header are
processed; other attachments are silently ignored.

### Dashboard fetch

The dashboard calls Supabase's auto-generated REST API:

```
GET /rest/v1/match_scouting?select=type,match,team,…
GET /rest/v1/pit_scouting?select=type,team,scout,…
```

The JSON rows are converted back to the exact CSV text format that the
dashboard's existing `parseCSV()` / `appendCSVText()` functions expect, so
every chart, WCI ranking, and comparison tab works as before. No existing
logic was modified.

---

## Local development

```bash
cd slack-bot
cp .env.example .env      # fill in your keys
npm install
npm run dev               # uses node --watch

# In a separate terminal, expose port 3000 for Slack events:
npx ngrok http 3000
# Copy the ngrok HTTPS URL → Slack Event Subscriptions → Request URL
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Bot doesn't reply | Check Event Subscriptions Request URL is verified in Slack; ensure bot is invited to the channel |
| "Supabase match upsert error" | Verify `SUPABASE_SERVICE_KEY` (service_role, not anon) and that `schema.sql` was run |
| Dashboard shows 0 rows | Confirm anon key (not service key) in dashboard config; check Supabase RLS policies allow SELECT |
| Duplicate rows in table | The unique constraint handles this — if you see duplicates, re-run the `schema.sql` to add the constraint |
| File not downloaded | Ensure `files:read` scope is added to the bot and the app is reinstalled after adding it |
