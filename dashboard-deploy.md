# PQM Board Dashboard — Deploy Guide

The dashboard is a **separate Apps Script web app** from your existing lead-capture `doPost`. They can't share one deployment because they need different "Execute as" settings:

| Script | Execute as | Who has access | Why |
|---|---|---|---|
| Existing `doPost` (leads) | **Me** (Katviz) | **Anyone** | Public lead form needs to write to your Sheet without the visitor's auth |
| New `doGet` (dashboard) | **User accessing** | **Anyone with Google account** | So `Session.getActiveUser().getEmail()` returns the visitor's verified email for the 5-name allowlist check |

So this is a *new* Apps Script project, parallel to the one you already have.

---

## Step-by-step

### 1. Get the Sheet ID
- Open your Leads Google Sheet in Drive.
- The URL is `https://docs.google.com/spreadsheets/d/`**`THIS_LONG_STRING`**`/edit`
- Copy the **THIS_LONG_STRING** part.

### 2. Create the dashboard Apps Script
- Go to **https://script.google.com** → **New Project**
- Name it something like **"PQM Board Dashboard"**.
- Delete the default `function myFunction(){}`.
- Open `dashboard.gs` from this repo and **paste the entire contents** in.
- At the top of the file, edit the two constants:
  ```javascript
  const SHEET_ID = '<paste the Sheet ID from step 1>';
  const ALLOWED_EMAILS = [
    'first.board.member@gmail.com',
    'second@gmail.com',
    'third@gmail.com',
    'fourth@gmail.com',
    'fifth@gmail.com',
  ];
  ```
- **Save** (Ctrl+S).

### 3. Deploy as Web App
- Top-right: **Deploy → New deployment**.
- Gear ⚙ → **Web app**.
- **Description:** "PQM Board Dashboard v1"
- **Execute as:** ⚠ **User accessing the web app** ← this is the important one
- **Who has access:** ⚠ **Anyone with Google account** ← *not* just "Anyone"
- **Deploy** → Google will ask you to **authorise**. Approve. (Standard "Google hasn't verified" → Advanced → Go to project → Allow.)

### 4. Get the URL
- Copy the **Web app URL** (ends in `/exec`).
- Send it to me — I'll add it to memory for the team.
- Share that URL with the 5 board members.

### 5. Test
- Open the `/exec` URL **in an incognito window**, sign in with one of the 5 allowed emails → you see the dashboard.
- Sign in with any other Google account → you see the "Not authorised" screen.

---

## What it shows
- Hero: **Total leads · Pipeline value · Avg quote**
- **Leads over time** (weekly bars, last 12 weeks)
- **Mode mix** — flat vs curved (donut)
- **Product mix** — Reyansh Outdoor / Indoor / Leynna (horizontal bars)
- **Recent 10 leads** table

Everything is read live from your Sheet at each page load. No caching, no databases — just Apps Script reading the Sheet and rendering server-side.

## Updating the allowlist later
Open the Apps Script project → edit `ALLOWED_EMAILS` → save → **Deploy → Manage deployments → Edit → Version: New version → Deploy**. URL stays the same. Allowlist is live within 30s.

## Updating the dashboard look/code
Same flow as above — edit, save, deploy a new version. URL stays the same.

## If the Sheet schema changes
The current `readLeads()` expects 6 columns in this order: **Date | Name | Phone | Config | Grand Total | Ref**. If you add columns, adjust the column indexes in `readLeads()` or the existing ones will still work as long as those six remain in the first six positions.
