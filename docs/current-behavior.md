# TIME_TRACKING -- Current Behavior (QA / Documentation View)

## What This App Does

TIME_TRACKING is a local web application for monitoring the progress of OrangeLogic enhancement tickets. It pulls task data from the OrangeLogic Link API, stores it locally, and renders interactive charts, timelines, and trees so the team can track time spent, time remaining, risks, and estimation drift over time.

---

## How to Start the App

1. In a terminal, navigate to the `TIME_TRACKING` folder
2. Run: `node server.js`
3. Open browser at `http://localhost:3001`

---

## Main Sections of the Page

### 1. Risk Analysis (top)

- Input: "Dev days remaining" (a number you type in)
- Button: "Check Risk"
- Effect: Scans all enhancements and highlights assignees whose remaining work exceeds the threshold in red in every chart legend

### 2. Enhancement Sections (main body)

One card per tracked enhancement, sorted by importance. Each card contains:

**Header:**
- Enhancement title (links to Cortex ticket if available)
- Importance badge (color-coded)
- Ticket ID badge
- Status badge (current enhancement status)
- Blocker warning icon (orange) if blockers have been entered

**ETA line:** Shows the Development container's estimated completion date (only if not completed)

**Last reloaded:** Timestamp of last data fetch for this enhancement

**Filter Dropdown:** Narrows charts and Gantt/Tree to:
- All
- QA only
- Non-QA
- Non-QA, Non-Defect

**Action Buttons:**
| Button | What it does |
|--------|-------------|
| Reload | Re-fetches this enhancement from OL API and updates charts (no full page reload) |
| Gantt Chart | Opens timeline modal |
| Task Tree | Opens collapsible task tree modal |
| Blockers | Opens markdown editor to document blockers |
| Test Case | Opens/saves a URL to the test case document |
| Figma | Opens/saves a URL to the Figma design |
| Planning Review | Opens estimation drift analysis modal |

**4 Charts per Enhancement:**
| Chart | Description |
|-------|-------------|
| Time Spent (trend) | Bar chart: hours spent per assignee over time |
| Time Spent (latest) | Pie chart: current snapshot |
| Time Left (trend) | Bar chart: hours remaining per assignee over time |
| Time Left (latest) | Pie chart: current snapshot |
| Total Estimate (trend) | Bar chart: (spent + left) per assignee over time |
| Total Estimate (latest) | Pie chart: current snapshot |

Note: "Time Left Blocked" charts exist but are hidden by default.

Assignees with both Development and Defect tasks appear as two split series (e.g., "Alice - Dev" and "Alice - Defect").

**Chart interactions:**
- Hover over bar/slice: tooltip shows hours, days (6.5h/day), and task list
- Click legend item: toggle that assignee on/off
- Double-click legend item: solo that assignee (hide all others)

### 3. Global Stats (bottom of page)

- Pie charts showing Time Left per team (grouped by "Main Dev Team" field)
- Appears after all enhancement sections

### 4. No ETA Section

- Lists all tasks that have no ETA date
- Grouped by enhancement

---

## Floating Action Buttons (bottom-right corner)

| Button | Action |
|--------|--------|
| Update Data | Opens modal to select which enhancements to refresh from OL API |
| Manage Tickets | Opens modal to add/remove tracked enhancement ticket IDs |
| Clear Token | Removes stored OL API token (forces re-entry on next update) |

---

## Updating Data

1. Click "Update Data"
2. In the modal, check the enhancements you want to refresh (all are pre-checked)
3. Click "Fetch Selected"
4. If no OL API token is stored, you'll be prompted to enter one
5. Server fetches task data from OL API and appends to CSV
6. Page reloads automatically when done

On success, all chart data is refreshed. On error, an error modal shows the failure message.

---

## Managing Tickets

1. Click "Manage Tickets"
2. Current tracked ticket IDs are listed
3. To add: paste an ID (e.g., `L-29AFC7`) or a full Cortex URL -- the ID is extracted automatically
4. To remove: click the X next to any ticket
5. Changes persist in browser localStorage (survive page refresh, cleared if browser data is cleared)

---

## Gantt Chart Modal

Opens from "Gantt Chart" button on any enhancement card.

- Horizontal timeline from earliest task start to latest task end
- Each row is one assignee
- Task bars are color-coded by status:
  - Red: Blocked / On Hold
  - Orange: Blocked by Customer
  - Blue: In Progress / Pending Approval
  - Yellow: Needs Peer Review
  - Green: Closed / Completed / Implemented on Dev
  - Grey: Everything else
- Task icon indicates type (dev, QA, config, question, defect, etc.)
- Hover over a task bar: tooltip shows title, time spent/left, estimated dates, dependencies
- Tasks with no date appear in a separate table below the calendar
- Active filter (All/QA/Non-QA/etc.) is applied

**Known behavior:** Completed/Closed/Obsolete tasks are hidden from the Gantt unless they are Blocked or a container task.

---

## Task Tree Modal

Opens from "Task Tree" button on any enhancement card.

- Hierarchical tree of all tasks under the enhancement
- Root-level nodes expanded by default; child nodes collapsed (click arrow to expand)
- Each node shows:
  - Status color dot
  - Task type icon
  - Task title (links to Cortex if available)
  - Assignee, time spent, time left, estimated dates
- Warning icon (triangle) on a node if it shows green status but has non-green descendants -- indicates a potentially incorrect status roll-up
- Active filter applied
- Status legend at top of modal

---

## Blockers Modal

Opens from "Blockers" button on any enhancement card.

- Free-text markdown editor for documenting project blockers
- Supports: headings (#, ##, ###), bold (**text**), italic (*text*), bullet lists (- item)
- Saved to server (`enhancement_meta.json`) per enhancement
- Preview rendered as HTML when viewing (non-edit mode)
- If blockers exist, an orange warning icon appears on the enhancement header

---

## Planning Review Modal

Opens from "Planning Review" button on any enhancement card.

- **Baseline Date Dropdown:** Select any past capture date to compare against current
- **Summary Cards:** Show deltas for Re-estimate, Scope Creep, Removed work, Net change
- **Stacked Area Chart:** Shows Time Spent + Time Left evolving from baseline to current date
- **Per-Task Table:** Lists every task with columns: Task, Baseline Estimate, Current Estimate, Change, % Change, Status
  - Green rows: tasks existing in both baseline and current
  - Blue rows: new tasks added since baseline (scope creep)
  - Red rows: tasks removed since baseline

---

## Data Persistence

| What | Where | Lifetime |
|------|-------|---------|
| Tracked ticket IDs | Browser localStorage | Until manually removed or browser data cleared |
| OL API token | Browser sessionStorage | Until tab/browser is closed |
| Enhancement metadata (blockers, URLs) | `enhancement_meta.json` on server | Permanent (file on disk) |
| Task tracking data | `Time_tracking_data.csv` on server | Permanent, append-only |

---

## Known Behaviors and Edge Cases

- **100-item API limit:** OL API caps responses at 100 items. The app works around this with multi-step querying, but very large enhancements with >100 tasks may not be fully captured in a single run. A second update run typically fills gaps.
- **Duplicate detection:** If you run an update twice on the same day, rows are updated (not duplicated) as long as the task title or task identifier is the same.
- **Enhancement renames:** If an enhancement is renamed in OL, the app detects the mismatch by Ticket ID and backfills all old CSV rows with the new title.
- **Defect split in charts:** Assignees with both Development and Defect tasks get two separate chart series. This is intentional to separate defect-only work visually.
- **Time Left zeroed for terminal statuses:** Tasks with status Obsolete, Duplicate, Closed, Completed, etc. have their Time Left set to 0 in the CSV regardless of what OL reports. Time Spent is preserved.
- **No ETA tasks:** Tasks missing an ETA still appear in charts and trees but are excluded from the Gantt timeline (they land in the "No ETA" table at the bottom of the Gantt modal).
- **Partial reload:** The "Reload" button on each enhancement fetches only that ticket from OL and rebuilds only that section's charts. Other enhancements on the page are not affected.
- **Filter state:** The filter dropdown (All/QA/Non-QA/etc.) applies to charts, Gantt, and Tree for that enhancement. It does not affect other enhancements.
- **Risk check:** Risk highlighting does not persist across page reloads. You must click "Check Risk" again after a reload.
