# Time Tracking Report

A simple utility to visualize tracking data from OrangeLogic tasks.

## Features
- **Time Sheet Visualization**: Interactive charts for time spent and time left.
- **Risk Analysis**: Checks for developers with excessive remaining hours.
- **Global Stats**: Aggregated view of remaining work.
- **Data Update**: PowerShell script to fetch latest data from the API.
- **Local Server**: Node.js server to host the report and trigger updates securely.

## Setup

1.  **Prerequisites**:
    - Node.js installed.
    - PowerShell installed.
    - Access to OrangeLogic Link API.

2.  **Installation**:
    Clone the repository:
    ```bash
    git clone https://github.com/davidngo0296/time_tracking_report.git
    cd time_tracking_report
    ```

3.  **Configuration**:
    - Update `update_time_tracking_script.ps1` with your API Token and Ticket IDs.
    - **Note**: Do not commit your real token to public repositories.

## Usage

1.  Start the local server:
    ```bash
    node server.js
    ```
2.  Open your browser at `http://localhost:3001`.
3.  Click **Update Data** to fetch the latest stats.
