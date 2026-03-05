# Time Tracking Report

A utility to visualize and track time data from OrangeLogic enhancement tasks. Fetches data directly from the OrangeLogic API and renders interactive charts, Gantt timelines, and task trees.

## Features

### Charts
- **Time Spent / Time Left**: Bar charts per enhancement showing time spent and remaining per assignee, rounded to 1 decimal hour.
- **Task Filter**: Filter tasks by All Tasks / QA Tasks / Non-QA Tasks (defaults to All Tasks).
- **Importance Sorting**: Enhancements sorted by their "Importance for next release" field.
- **Risk Analysis**: Input remaining dev days and check which developers are at risk of exceeding capacity.
- **Global Stats**: Pie charts showing total remaining work aggregated by team.
- **No ETA Section**: Lists Development and QA tasks with no estimated completion date, grouped by enhancement. Excludes tasks with status Obsolete, Implemented on Dev, Closed, Duplicate, or Needs Peer Review, and tasks whose immediate parent is Obsolete.

### Gantt Chart
- **Per-Enhancement Gantt**: Click the Gantt button on any enhancement to open a timeline modal.
- **Follows Task Filter**: The Gantt chart respects the All / QA / Non-QA filter selected on the enhancement.
- **Status Coloring**: Bars colored by status — Blocked/On Hold (red), Pending Approval/In Progress (blue), Needs Peer Review (yellow), Closed/Implemented on Dev (green), Other (grey).
- **Smart Scheduling**: Uses Estimated Start/End dates from OrangeLogic, with ETA as fallback for end date.
- **Sorted by Deadline**: Tasks sorted by soonest estimated completion date per assignee.
- **Container Tasks**: Tasks with children are marked with a folder icon.
- **No ETA Tasks Table**: Tasks without dates are shown in a separate table below the calendar.
- **Sticky Header**: Date row stays frozen during vertical scroll; legend and No ETA section stay fixed during horizontal scroll.
- **Tooltips**: Hover to see Time Spent, Time Left, estimated dates, and prerequisites.

### Task Tree
- **Per-Enhancement Tree**: Click the Task Tree button on any enhancement to open a collapsible tree modal.
- **Follows Task Filter**: The tree respects the All / QA / Non-QA filter selected on the enhancement.
- **Status Coloring**: Same color scheme as the Gantt chart.
- **Collapsible Nodes**: Nodes at depth ≥ 1 start collapsed; click any node header to toggle.
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
- **Native Node.js**: No PowerShell dependency. The server fetches data directly from the OrangeLogic Search API.
- **Recursive Traversal**: Fetches all descendants within Development and QA containers (up to 10 levels deep).
- **Allowed Task Types**: Development, Configuration Request, Defect - QA Vietnam, Question, QA, Infrastructure Deployment, Access Change Request.
- **Excluded Task Types**: Technical Debt Code tasks and all their descendants are excluded.
- **Deduplication**: Uses composite key (date + enhancement + task title + task identifier) to prevent duplicates.
- **Enhancement Rename Detection**: If an enhancement ticket is renamed in OrangeLogic, historical CSV rows are automatically backfilled with the new title.
- **CSV Storage**: All data persisted to `Time_tracking_data.csv` with automatic schema migration for new fields.

## File Structure

| File                        | Description                                              |
| --------------------------- | -------------------------------------------------------- |
| `server.js`                 | Node.js HTTP server, OrangeLogic API fetching, CSV read/write, enhancement metadata API |
| `time_tracking_report.html` | Main HTML page and modal definitions                     |
| `chart-utils.js`            | CSV parsing, data aggregation, ETA extraction, markdown renderer |
| `chart-render.js`           | Chart.js rendering, enhancement sections, No ETA section |
| `gantt.js`                  | Gantt chart building and rendering                       |
| `tree.js`                   | Task tree building and rendering                         |
| `app.js`                    | Ticket management, API calls, blockers modal, initialization |
| `styles.css`                | All styling                                              |
| `Time_tracking_data.csv`    | Persisted tracking data                                  |
| `enhancement_meta.json`     | Per-enhancement metadata (blockers text)                 |

## Setup

1. **Prerequisites**:
   - Node.js installed.
   - Access to OrangeLogic Link API and a valid API token.

2. **Installation**:
   ```bash
   git clone https://github.com/davidngo0296/time_tracking_report.git
   cd time_tracking_report
   ```

## Usage

1. Start the local server:
   ```bash
   node server.js
   ```
2. Open your browser at `http://localhost:3001`.
3. Click **Update Data** and enter your OrangeLogic API token when prompted. The token is retrieved from `https://link.orangelogic.com/swagger/api/Authentication/v1.0/AccessToken`.
4. Use **Manage Tickets** to add or remove enhancement ticket IDs.
5. Use the filter dropdown on each enhancement to switch between All / QA / Non-QA task views.
6. Click **📊 Gantt Chart** or **🌳 Task Tree** to open the respective modal for an enhancement.
7. Click **🚧 Blockers** to view or edit blocker notes for an enhancement.
