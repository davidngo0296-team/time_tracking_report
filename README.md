# Time Tracking Report

A utility to visualize and track time data from OrangeLogic enhancement tasks. Fetches data directly from the OrangeLogic API and renders interactive charts, Gantt timelines, and task trees.

## Features

### Charts
- **Time Spent**: Bar chart per enhancement showing time spent per assignee, by date.
- **Time Left**: Bar chart showing remaining time per assignee. Assignees with defect tasks are split into separate "Dev" and "Defect" series.
- **Blocked Time**: Hidden chart (same scale as Time Left) showing time left attributed only to blocked tasks. Toggle via the chart controls.
- **Total Estimate**: Bar chart showing total estimate (spent + left) per assignee.
- **Task Filter**: Filter tasks per enhancement by All Tasks / QA Tasks / Non-QA Tasks / Non-QA Non-Defect Tasks. Defaults to **Non-QA Non-Defect Tasks**.
- **Importance Sorting**: Enhancements sorted by their "Importance for next release" field.
- **Risk Analysis**: Input remaining dev days and check which developers are at risk of exceeding capacity. Risky assignees are highlighted in red on the Time Left legend.
- **Global Stats**: Pie charts showing total remaining work aggregated by team.
- **No ETA Section**: Lists Development and QA tasks with no estimated completion date, grouped by enhancement. Excludes tasks with status Obsolete, Implemented on Dev, Closed, Duplicate, or Needs Peer Review, and tasks whose immediate parent is Obsolete.

### Gantt Chart
- **Per-Enhancement Gantt**: Click the Gantt button on any enhancement to open a timeline modal.
- **Follows Task Filter**: The Gantt chart respects the All / QA / Non-QA / Non-QA Non-Defect filter selected on the enhancement.
- **Status Coloring**: Bars colored by status — Blocked/On Hold (red), Pending Approval/In Progress (blue), Needs Peer Review (yellow), Closed/Implemented on Dev (green), Other (grey).
- **Smart Scheduling**: Uses Estimated Start/End dates from OrangeLogic, with ETA as fallback for end date.
- **Sorted by Deadline**: Tasks sorted by soonest estimated completion date per assignee.
- **Container Tasks**: Tasks with children are marked with a folder icon.
- **No ETA Tasks Table**: Tasks without dates are shown in a separate table below the calendar.
- **Sticky Header**: Date row stays frozen during vertical scroll; legend and No ETA section stay fixed during horizontal scroll.
- **Tooltips**: Hover to see Time Spent, Time Left, estimated dates, and prerequisites.

### Task Tree
- **Per-Enhancement Tree**: Click the Task Tree button on any enhancement to open a collapsible tree modal.
- **Follows Task Filter**: The tree respects the All / QA / Non-QA / Non-QA Non-Defect filter selected on the enhancement.
- **Status Coloring**: Same color scheme as the Gantt chart.
- **Collapsible Nodes**: Container nodes at depth ≥ 1 start collapsed; click any node header to toggle.
- **Task Visibility**: Tasks with 0 time left are hidden unless their status is in the keep list (In Progress, Not Started, Ready to Start, To Be Vetted, Needs Peer Review, Pending Approval, Closed, Implemented on Dev, Completed, Approved Pending Action) or they are blocked/on hold.
- **Tooltips**: Hover to see Assignee, Time Spent, Time Left, Estimated Start/End, and Prerequisites.
- **Linked Titles**: Task titles link to their Cortex page when available.

### Blockers
- **Per-Enhancement Blockers Button**: A 🚧 Blockers button appears next to Reload on each enhancement. The button is fully opaque when blockers content exists.
- **View/Edit Modal**: Opens a modal showing rendered markdown. Click ✏️ Edit to switch to edit mode; Save returns to view mode. Supports headings, bullet lists, bold, and italic.
- **Persistent Storage**: Blockers saved server-side to `enhancement_meta.json`.

### Ticket Management
- **Manage Tickets**: Add or remove tracked ticket IDs via a modal. Supports ticket IDs or OrangeLogic URLs.
- **Selective Update**: When closing the modal after adding tickets, only the newly added tickets are fetched — existing data is not re-fetched.
- **Per-Enhancement Reload**: Reload data for a single enhancement without updating everything.
- **Persistent Storage**: Tracked tickets saved in `localStorage`; API token saved in `sessionStorage`.

### Data Fetching (Server)
- **Native Node.js**: No external dependencies or PowerShell required. The server fetches data directly from the OrangeLogic Search API.
- **Recursive Traversal**: Fetches all descendants within Development and QA containers (up to 10 levels deep).
- **API Cap Handling**: The OrangeLogic API caps results at 100 items per query. The server works around this by:
  - Querying known containers from CSV history that may have been cut off (Step 3.5).
  - Directly looking up by identifier any tasks seen in CSV history that are still missing (Step 3.6).
- **Allowed Task Types**: Development, Configuration Request, Defect - QA Vietnam, Question, QA, Infrastructure Deployment, Access Change Request, Infrastructure Project, Research Analysis, Infrastructure Configuration.
- **Excluded Task Types**: Technical Debt Code tasks and all their descendants are excluded.
- **Ignored Statuses**: Tasks with status Obsolete, Duplicate, Closed, Needs Peer Review, Implemented on Dev, In Revision, Access Granted, or Completed have their Time Left zeroed out automatically.
- **Deduplication**: Uses composite key (date + enhancement + task title + task identifier) to prevent duplicates.
- **Enhancement Rename Detection**: If an enhancement ticket is renamed in OrangeLogic, historical CSV rows are automatically backfilled with the new title.
- **CSV Storage**: All data persisted to `Time_tracking_data.csv` with automatic schema migration for new fields.

## File Structure

| File                        | Description                                              |
| --------------------------- | -------------------------------------------------------- |
| `server.js`                 | Node.js HTTP server, OrangeLogic API fetching, CSV read/write, enhancement metadata API |
| `time_tracking_report.html` | Main HTML page and modal definitions                     |
| `chart-utils.js`            | CSV parsing, data aggregation, ETA extraction, markdown renderer |
| `chart-render.js`           | Chart.js rendering, risk analysis, enhancement sections, No ETA section |
| `gantt.js`                  | Gantt chart building and rendering                       |
| `tree.js`                   | Task tree building and rendering                         |
| `app.js`                    | Ticket management, API calls, blockers modal, initialization |
| `styles.css`                | All styling                                              |
| `Time_tracking_data.csv`    | Persisted tracking data (auto-created on first update)   |
| `enhancement_meta.json`     | Per-enhancement metadata (blockers text, auto-created)   |

## Setup

**Prerequisites**
- Node.js v18 or later
- Access to the OrangeLogic Link API and a valid API token

**Installation**
```bash
git clone https://github.com/davidngo0296/time_tracking_report.git
cd time_tracking_report
```

No `npm install` is needed — the server uses only Node.js built-in modules.

## Usage

1. **Start the server:**
   ```bash
   node server.js
   ```
   The server listens on port `3001` by default. Set the `PORT` environment variable to override.

2. **Open the app** at `http://localhost:3001`.

3. **Add your tickets** via **Manage Tickets**. Enter comma-separated OrangeLogic ticket IDs (e.g. `299JUG`) or full OrangeLogic URLs.

4. **Fetch data** by clicking **Update Data**. You will be prompted for your OrangeLogic API token.
   - Obtain the token from `https://link.orangelogic.com/swagger/api/Authentication/v1.0/AccessToken`.
   - The token is stored in `sessionStorage` for the duration of the browser session.

5. **Explore the data:**
   - Use the **Filter** dropdown on each enhancement to switch between All / QA / Non-QA / Non-QA Non-Defect task views.
   - Click **📊 Gantt Chart** to open the timeline modal for an enhancement.
   - Click **🌳 Task Tree** to open the hierarchy modal for an enhancement.
   - Click **🚧 Blockers** to view or edit blocker notes for an enhancement.
   - Click **🔄 Reload** to refresh data for a single enhancement without re-fetching everything.

6. **Risk analysis:** Enter the number of remaining dev days in the **Risk** field and click **Check Risk**. Developers whose total remaining hours exceed the threshold are highlighted in red across all Time Left charts.
