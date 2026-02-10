# Time Tracking Report

A utility to visualize and track time data from OrangeLogic enhancement tasks. Fetches data directly from the OrangeLogic API and renders interactive charts and Gantt timelines.

## Features

### Charts
- **Time Spent / Time Left**: Bar charts per enhancement showing time spent and remaining per assignee.
- **Enhancement Filtering**: Filter tasks by All / QA Tasks / Non-QA Tasks (defaults to Non-QA).
- **Importance Sorting**: Enhancements sorted by their "Importance for next release" field.
- **Risk Analysis**: Input remaining dev days and check which developers are at risk of exceeding capacity.
- **Global Stats**: Pie charts showing total remaining work aggregated by team.
- **No ETA Section**: Lists tasks that have no estimated completion date, grouped by enhancement.

### Gantt Chart
- **Per-Enhancement Gantt**: Click the Gantt button on any enhancement to open a timeline modal.
- **Status Coloring**: Bars colored by status (In Progress, Blocked, Needs Peer Review, Other).
- **Smart Scheduling**: Uses Estimated Start/End dates from OrangeLogic, with ETA as fallback for end date.
- **Sorted by Deadline**: Tasks sorted by soonest estimated completion date per assignee.
- **Needs Peer Review**: Tasks with this status are shown even when time left is 0.
- **Container Tasks**: Tasks with children are marked with a folder icon.
- **No ETA Tasks Table**: Tasks without dates are shown in a separate table below the calendar.
- **Sticky Header**: Date row stays frozen during vertical scroll; legend and No ETA section stay fixed during horizontal scroll.
- **Tooltips**: Hover to see Time Spent, Time Left, estimated dates, and prerequisites.

### Ticket Management
- **Manage Tickets**: Add or remove tracked ticket IDs via a modal. Supports ticket IDs or OrangeLogic URLs.
- **Per-Enhancement Reload**: Reload data for a single enhancement without updating everything.
- **Persistent Storage**: Tracked tickets saved in `localStorage`; API token saved in `sessionStorage`.

### Data Fetching (Server)
- **Native Node.js**: No PowerShell dependency. The server fetches data directly from the OrangeLogic Search API.
- **Recursive Traversal**: Fetches all descendants within Development and QA containers (up to 10 levels deep).
- **Allowed Task Types**: Development, Configuration Request, Defect - QA Vietnam, Question, QA.
- **Deduplication**: Uses composite key (date + enhancement + task title + task identifier) to prevent duplicates.
- **CSV Storage**: All data persisted to `Time_tracking_data.csv` with automatic schema migration for new fields.

## File Structure

| File                        | Description                                        |
| --------------------------- | -------------------------------------------------- |
| `server.js`                 | Node.js HTTP server, API fetching, CSV read/write  |
| `time_tracking_report.html` | Main HTML page                                     |
| `chart-utils.js`            | CSV parsing, Chart.js rendering, Gantt chart logic |
| `app.js`                    | Ticket management, API calls, initialization       |
| `styles.css`                | All styling                                        |
| `Time_tracking_data.csv`    | Persisted tracking data                            |

## Setup

1.  **Prerequisites**:
    - Node.js installed.
    - Access to OrangeLogic Link API and a valid API token.

2.  **Installation**:
    ```bash
    git clone https://github.com/davidngo0296/time_tracking_report.git
    cd time_tracking_report
    ```

## Usage

1.  Start the local server:
    ```bash
    node server.js
    ```
2.  Open your browser at `http://localhost:3001`.
3.  Click **Update Data** and enter your OrangeLogic API token when prompted. The token is retrieved from https://link.orangelogic.com/swagger/api/Authentication/v1.0/AccessToken
4.  Use **Manage Tickets** to add or remove enhancement ticket IDs.
5.  Click the **Gantt** button on any enhancement to view its timeline.
