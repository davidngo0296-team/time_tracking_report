# TIME_TRACKING -- Technical Implementation

## Stack

- **Backend:** Node.js (>=18), zero npm dependencies -- uses `http`, `fs`, `path`, `https` built-ins only
- **Frontend:** Vanilla JS + Chart.js (CDN), no bundler
- **Persistence:** CSV file (`Time_tracking_data.csv`) + JSON sidecar (`enhancement_meta.json`)
- **Port:** 3001 (override with `PORT` env var)

---

## File Map

| File | Lines | Role |
|------|-------|------|
| `server.js` | 675 | HTTP server, OL API calls, CSV read/write |
| `app.js` | 611 | Frontend init, ticket management, modals, partial reload |
| `chart-render.js` | 849 | Chart.js instances, risk analysis, section layout |
| `chart-utils.js` | 226 | CSV parse, time-series aggregation, ETA extraction |
| `gantt.js` | ~600 | Gantt HTML/CSS rendering, date scheduling |
| `tree.js` | ~323 | Collapsible task tree rendering |
| `planning-review.js` | ~400 | Estimation drift analysis, stacked area chart |
| `styles.css` | ~1000 | All styling |
| `time_tracking_report.html` | 195 | Shell HTML + modal definitions |

**Script load order in HTML (order-dependent):**
`chart-utils.js` -> `chart-render.js` -> `gantt.js` -> `tree.js` -> `planning-review.js` -> `app.js`

---

## Backend: server.js

### HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serve HTML |
| GET | `/*.{css,js}` | Serve static assets |
| GET | `/Time_tracking_data.csv` | Serve CSV |
| GET | `/enhancement-meta` | Return `enhancement_meta.json` |
| POST | `/enhancement-meta` | Upsert `{ticketId, field, value}` into JSON |
| POST | `/run-update-script` | Accept `{token, ticketIds}`, run `runUpdateLogic()` |

### Core: `runUpdateLogic(token, ticketIdsStr)`

1. **Parse tickets:** Strip prefix (e.g., `L-299JUG` -> `299JUG`), comma-split
2. **Fetch root enhancement** via `SystemIdentifier:("L-<id>")` -- single item
3. **Fetch direct descendants** via `Parentfolderidentifier:("<id>")` -- up to 100 items
4. **Recursive container traversal:** Find `Development` / `QA` / `Infrastructure` containers, re-query each
5. **Step 3.5 -- CSV history lookup:** Re-query containers seen in previous CSV rows (handles tasks added since last run)
6. **Step 3.6 -- Direct lookup:** For tasks seen in CSV but missing this run, fetch by identifier directly
7. **Filter tasks:**
   - Allowed types: Development, Configuration Request, Defect - QA Vietnam, Question, QA, Infrastructure Deployment, Access Change Request, Infrastructure Project, Research Analysis, Infrastructure Configuration, Merge Request Execution
   - Excluded: entire subtrees rooted at "Technical Debt Code" nodes
8. **Zero time left** for ignored statuses: Obsolete, Duplicate, Closed, Needs Peer Review, Implemented on Dev, In Revision, Access Granted, Completed
9. **Read CSV**, auto-migrate schema (adds columns for Ticket ID, ETA, Status, etc. if missing)
10. **Upsert rows:** Dedup key = `Capture date | Enhancement title | Task Identifier` (fallback: Task title)
11. **Backfill enhancement renames:** If Ticket ID matches but title differs, update all old rows
12. **Write CSV**

### OL Search API

- URL: `https://link.orangelogic.com/API/Search/v4.0/Search`
- Auth: `token` query param
- Pagination: `limit=100`, `start=N`
- Key fields fetched: CoreField.Title, CoreField.Identifier, SystemIdentifier, CoreField.DocSubType, CoreField.Status, AssignedTo, Document.TimeSpentMn, Document.TimeLeftMn, dev.Main-dev-team, Document.CurrentEstimatedCompletionDate, Document.CortexShareLinkRaw, product.Importance-for-next-release, Document.Dependencies, Document.CurrentEstimatedStartDate, Document.CurrentEstimatedEndDate, ParentFolderIdentifier

### CSV Schema (20 columns)

```
Capture date, Enhancement title, Task title, Type, Assignee,
Time spent, Time left, Ticket ID, Main Dev Team, ETA, Cortex Link,
Status, Importance, Dependencies, Task Identifier,
Estimated Start Date, Estimated End Date, Parent Folder, Enhancement Status
```

---

## Frontend: app.js

### Initialization (`initializeApp()`)

1. Fetch `/Time_tracking_data.csv` + `/enhancement-meta`
2. `parseCSV()` -> `processDataForTimeSeries()` -> grouped data structure
3. Sort enhancements by importance
4. For each enhancement: `createChartSection()` -> 4 chart cards
5. `createGlobalTimeLeftChart()` -> team pie charts
6. `createNoETASection()` -> table of tasks without ETA

### Ticket Management

- Tickets stored in `localStorage` (`ticketIds` key)
- `parseTicketId(input)` handles both raw IDs and full Cortex URLs
- UI: `#ticket-modal` with add/remove controls

### Partial Reload

`reloadEnhancement(ticketId, btn)`:
1. POST `/run-update-script` for single ticket
2. Re-fetch CSV
3. `refreshEnhancementSection()` rebuilds only that enhancement's DOM section and charts -- no full page reload

### Token Handling

- OL API token stored in `sessionStorage` (cleared on tab close)
- If missing on update, user is prompted via inline input modal

---

## Frontend: chart-utils.js

### `parseCSV(csv)`

- Handles double-quoted fields with embedded commas
- Returns array of objects keyed by header row

### `processDataForTimeSeries(data)`

Groups rows by: enhancement -> assignee -> date

Returns:
```js
{
  "Enhancement Title": {
    dates: ["2025-12-18", ...],
    assignees: {
      "Alice": {
        spent: [hours, ...],
        left:  [hours, ...],
        tasks: [[taskObj, ...], ...]  // per date
      }
    }
  }
}
```

QA tasks tracked separately (`qaAssignees`). Blocked tasks tracked in `blockedAssignees`.

### `getEnhancementETA(rawData, enhancementTitle, globalMaxDate)`

Finds the `Development` container task for the enhancement; returns its ETA if not completed.

### Time Unit Conversions

- Minutes to hours: `/ 60`
- Hours to days: `/ 6.5` (6.5-hour workday assumed)

---

## Frontend: chart-render.js

### `createChartSection(container, title, index, groupedData, rawData, globalMaxDate)`

Builds an enhancement card with:
- Title + badges (Importance, Ticket ID, Status, blocker warning)
- Filter dropdown: All / QA / Non-QA / Non-QA Non-Defect
- Action buttons: Reload, Gantt Chart, Task Tree, Blockers, Test Case, Figma, Planning Review
- 4 chart wrappers (bar trend + pie latest): Time Spent, Time Left, Time Left Blocked (hidden), Total Estimate

### `renderChart(canvasId, type)`

Reads `window.chartData[canvasId]`, creates Chart.js instance. Replaces existing instance if present.

### Defect Split

If an assignee has both Dev and Defect tasks, their bar series splits into:
- `"Assignee - Dev"` (solid color)
- `"Assignee - Defect"` (semi-transparent, 0.5 alpha)

### `checkRisk()`

- Sums time left per assignee across all enhancements
- Compares against `riskDays * 8` threshold (user input)
- Highlights risky assignees red+bold in all chart legends
- Re-renders all charts

### `buildStoreData(metricKey, label, filterFn, blockedOnly, extraMetricKey)`

Helper that populates `window.chartData[canvasId]` for a given metric/filter combo.

---

## Frontend: gantt.js

### `buildGanttData(rawData, enhancementTitle, globalMaxDate, filterValue)`

- Parses `Estimated Start Date` / `Estimated End Date` from CSV
- Fallback: derive missing date from time-left estimate
- Excludes Closed/Obsolete unless in keep list or task is Blocked/container
- Sorts by soonest end date per assignee
- Applies filter (All/QA/Non-QA/Non-QA Non-Defect)

### `renderGanttChart(container, ganttData)`

Pure HTML/CSS rendering (no canvas):
- Sticky date header row with M/D columns
- Assignee rows with alternating background
- Task bars: `left` + `width` calculated from day offset
- Status colors: Red (Blocked/On Hold), Orange (Blocked by Customer), Blue (In Progress), Yellow (Needs Peer Review), Green (Closed/Completed), Grey (other)
- Weekend columns highlighted
- Tasks without dates listed in separate table below

---

## Frontend: tree.js

### `buildTreeData(rawData, enhancementTitle, globalMaxDate, filterValue)`

- Builds parent-child map from `Parent Folder` CSV column
- Identifies roots: tasks with no parent in dataset
- Sorts children: containers first, then alphabetical
- Applies same filter + status exclusion as Gantt

### `renderTreeNode(task, depth)`

Recursive. Depth >= 1 -> collapsed by default. Depth 0 -> open.
Warning icon if task is green-status but has non-green descendants.

---

## Frontend: planning-review.js

### Key Metrics

| Metric | Definition |
|--------|-----------|
| Baseline Total | Sum of (spent + left) for all tasks on baseline date |
| Re-estimate Delta | Change in total estimates for tasks existing in both dates |
| Scope Creep | Sum of estimates for tasks added after baseline |
| Removed Total | Sum of estimates for tasks removed since baseline |
| Current Total | Final (spent + left) sum |

### Cross-Date Matching

Prefers `Task Identifier` field match. Falls back to title match. Categorizes tasks as: existing, new (current only), removed (baseline only).

---

## Data Storage

### Time_tracking_data.csv

Append-only with upsert behavior. Auto-migrated on read if columns are missing.

### enhancement_meta.json

Structure:
```json
{
  "<ticketId>": {
    "blockers": "<markdown string>",
    "testCaseUrl": "<url>",
    "figmaUrl": "<url>"
  }
}
```

Written atomically on each POST `/enhancement-meta` call.

---

## Architectural Constraints

- **100-item API cap:** OL Search API returns max 100 items per call; workaround is multi-step container re-querying + CSV history
- **No real-time data:** All data is snapshot-based; updates are manual
- **Token expiry:** OL API token is session-scoped; no refresh flow
- **No auth on server:** Any client with network access can write CSV/metadata
- **Single-file CSV:** Concurrent writes are not safe; not designed for multi-user
