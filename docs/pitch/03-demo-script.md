# ECCLESIA ChMS — Live Demo Script

> A 20-minute walkthrough for a parish council. The goal: show that this is a
> **real, working system** the parish can run on its own PC — not a mockup.

---

## Before the demo (30 min prep)

1. Machine with Node.js LTS and the project copied to it.
2. Load demo data (so every screen is full, not empty):
   ```bash
   npm run setup
   cd backend
   npm run db:seed:demo
   ```
3. Start the app:
   ```bash
   npm run backend   # terminal 1
   cd .. && npm run dev   # terminal 2 -> http://localhost:3000
   ```
4. **Reset the demo before every showing** so each pitch starts clean:
   ```bash
   cd backend && npm run db:clear:demo && npm run db:seed:demo
   ```
5. Have the 34 screenshots ready as a backup if the projector fails.

---

## The 20-minute script

### 0:00 — Open (2 min)
> "This is a complete church management system that runs entirely on one of
> your parish computers. No internet, no monthly fees, and all your records
> stay on your own machine."

Log in as **admin@demo.ecclesia.local / AdminDemo123!**.

### 0:02 — Dashboard (1 min)
Point at the stat cards: active members, total deposits, low-stock alerts,
recent deposits/expenses. Say: *"Everything here updates live from the data we
are about to enter."*

### 0:03 — Member Registry (4 min)
- **Find** tab: search a member (e.g. "Kamau") — show instant results.
- **Add** tab: create one new member live. Note the auto-generated
  registration number.
- **Delete** tab: show the soft-delete confirmation. Emphasize: *"Deletion is
  never permanent — it goes to Trash & Audit where it can be restored."*

### 0:07 — Sacraments (2 min)
Open the sacraments panel, pick the member you just added, record a baptism
date. Show the sacrament card updating. Mention death records too.

### 0:09 — Contributions (3 min)
- Receive a payment: pick the new member, mark Tithing, show the monthly
  tracker flipping to "Paid" for this month.
- Open Reports > Contributions > This Month — show the member listed as Paid.

### 0:12 — Finance (3 min)
- Deposits: add one deposit (auto ref no. DEP-…).
- Show creditors / debtors / expenses tabs briefly.
- Open Ledgers, do an inter-ledger transfer — show the balance updating and a
  movement being logged.

### 0:15 — Inventory (2 min)
- Show items with stock levels and the low-stock highlight.
- Process a sale; show the sales history updating.

### 0:17 — HR (1 min)
Briefly show employees + payroll list.

### 0:18 — Reports & Admin (2 min)
- Reports panel: generate a Baptism Registry, **Export Excel** and
  **Print to PDF** — show real files being produced.
- Admin > Backup Now — show a backup file appear.
- Admin > Export Data — show the full parish JSON "exit path".

### 0:20 — Close
> "You can take the whole product home today as a 30-day trial with demo data.
> No obligation. When you're ready, we install it on your parish PC and import
> your existing records. Your data never leaves your office."

---

## Killer questions they may ask — and answers

| Question | Answer |
|----------|--------|
| "Does it need internet?" | No. Fully offline. A network/HTTPS option exists for LAN or remote access. |
| "Where is our data?" | A single file on your PC, backed up automatically; optional mirror to a cloud folder you control. |
| "Can we keep using it if you disappear?" | Yes — it's installed software on your machine, plus a full data export tool. |
| "Can we import our Excel members?" | Yes — export/import is built in; we do the migration during setup. |
| "Who can see what?" | Super Admin, Admin, Staff, Viewer roles; each module can be permissioned per user. |
| "Is M-Pesa integrated?" | Collections are recorded in-app today; push-payment integration is on the roadmap. |
| "How much?" | See the pricing sheet — a one-time license plus annual support. |

---

## Go/No-Go signals

**Positive:** asking about pricing, data privacy, training, migration timeline.
**Negative:** asking "is this a website?" and expecting a subscription URL.
If negative, re-anchor: *"No — that's exactly the point. It's a private system
your parish owns."*

---

*Private & confidential — Max Bless Ngugi / Ecclesia*
