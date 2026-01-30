const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const HTML_FILE = 'time_tracking_report.html';
const CSV_FILE = 'Time_tracking_data.csv';

const API_URL = "https://link.orangelogic.com/API/Search/v4.0/Search";

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    // Serve HTML
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        fs.readFile(path.join(__dirname, HTML_FILE), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading report file.');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }

    // Serve CSV
    if (req.method === 'GET' && req.url.replace(/%20/g, ' ').includes(CSV_FILE)) {
        fs.readFile(path.join(__dirname, CSV_FILE), (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('CSV file not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(data);
        });
        return;
    }

    // Handle Script execution (Now native JS)
    if (req.method === 'POST' && req.url === '/run-update-script') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            let token = '';
            let ticketIdsStr = '';
            try {
                const parsed = JSON.parse(body);
                token = parsed.token;
                ticketIdsStr = parsed.ticketIds;
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid JSON body' }));
                return;
            }

            if (!token || !ticketIdsStr) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Token and Ticket IDs are required.' }));
                return;
            }

            try {
                const result = await runUpdateLogic(token, ticketIdsStr);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, output: result }));
            } catch (err) {
                console.error("Update Error:", err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

// --- Logic ---

const ALLOWED_TYPES = ["Development", "Configuration Request", "Defect - QA Vietnam", "Question"];
const IGNORED_STATUSES = ["Obsolete", "Duplicate", "Closed", "Needs Peer Review", "Implemented on Dev", "In Revision"];

async function runUpdateLogic(token, ticketIdsStr) {
    const ticketIds = ticketIdsStr.split(',').map(s => s.trim()).filter(s => s);
    const csvPath = path.join(__dirname, CSV_FILE);
    const captureDate = new Date().toISOString().split('T')[0];

    // Read Existing CSV
    let trackingData = [];
    if (fs.existsSync(csvPath)) {
        const fileContent = fs.readFileSync(csvPath, 'utf8');
        trackingData = parseCSV(fileContent);
    }

    // Migration: If no "Ticket ID" field, add it
    if (trackingData.length > 0 && !('Ticket ID' in trackingData[0])) {
        console.log("Migrating CSV to include Ticket ID...");
        trackingData.forEach(row => row['Ticket ID'] = '');
    }
    // Migration: If no "Main Dev Team" field, add it
    if (trackingData.length > 0 && !('Main Dev Team' in trackingData[0])) {
        console.log("Migrating CSV to include Main Dev Team...");
        trackingData.forEach(row => row['Main Dev Team'] = '');
    }

    // Index for fast lookup
    const dataIndex = {};
    trackingData.forEach((row, i) => {
        const key = `${row['Capture date']}|${row['Enhancement title']}|${row['Task title']}`;
        dataIndex[key] = i;
    });

    let updatesLog = '';
    const log = (msg) => {
        console.log(msg);
        updatesLog += msg + '\n';
    };

    for (const rawId of ticketIds) {
        const fullTicketId = rawId.startsWith('L-') ? rawId : `L-${rawId}`;
        log(`Processing Ticket: ${fullTicketId}`);

        // 1. Get Enhancement Details
        const enhancementTasks = await searchOLTask(`SystemIdentifier:("${fullTicketId}")`, token);
        if (!enhancementTasks || enhancementTasks.length === 0) {
            log(`  Warning: Enhancement ticket not found: ${fullTicketId}`);
            continue;
        }

        const enhancementTitle = enhancementTasks[0]["CoreField.Title"];
        if (!enhancementTitle) {
            log(`  Warning: Title empty for ${fullTicketId}`);
            continue;
        }
        log(`  Enhancement: ${enhancementTitle}`);

        // Extract Main Dev Team from the enhancement (parent level)
        const teamField = enhancementTasks[0]["dev.Main-dev-team"];
        let enhancementTeam = "";
        if (Array.isArray(teamField) && teamField.length > 0) {
            // It's an array of objects like [{Value: "Corgis (Trang)", RecordID: "...", ...}]
            enhancementTeam = teamField[0].Value || teamField[0].KeywordText || teamField[0] || "";
        } else if (typeof teamField === 'string') {
            enhancementTeam = teamField;
        }
        if (enhancementTeam) {
            log(`  Team: ${enhancementTeam}`);
        }

        // 2. Get Direct Children
        let directChildren = await searchOLTask(`Parentfolderidentifier:("${fullTicketId}")`, token);
        directChildren = directChildren || [];
        log(`    Direct Children: ${directChildren.length}`);

        let allTasks = [...directChildren];

        // 3. Find 'Development' folder and its children
        const devTask = directChildren.find(t => t["CoreField.Title"] === "Development");
        if (devTask) {
            const devId = devTask["CoreField.Identifier"];
            log(`    Found Development container: ${devId}`);
            const devChildren = await searchOLTask(`Parentfolderidentifier:("${devId}")`, token);
            if (devChildren) {
                allTasks.push(...devChildren);
            }
        }

        // 4. Process Tasks
        let addedCount = 0;
        for (const task of allTasks) {
            const type = (task["CoreField.DocSubType"] || '').trim();
            if (!ALLOWED_TYPES.includes(type)) continue;

            const taskTitle = task["CoreField.Title"];
            const assignee = task.AssignedTo || '(unassigned)';
            const status = (task["CoreField.Status"] || '').trim();

            const timeSpent = task["Document.TimeSpentMn"] || "0";
            let timeLeft = task["Document.TimeLeftMn"] || "0";
            // Use team from enhancement (parent level) - child tasks don't have this field

            if (IGNORED_STATUSES.includes(status)) {
                timeLeft = "0";
            }

            const rowKey = `${captureDate}|${enhancementTitle}|${taskTitle}`;

            const newRow = {
                'Capture date': captureDate,
                'Enhancement title': enhancementTitle,
                'Task title': taskTitle,
                'Type': type,
                'Assignee': assignee,
                'Time spent': timeSpent,
                'Time left': timeLeft,
                'Ticket ID': rawId.replace(/^L-/, ''), // Store short ID
                'Main Dev Team': enhancementTeam
            };

            // Backfill History Logic
            trackingData.forEach(existingRow => {
                // Ticket ID backfill
                if (existingRow['Enhancement title'] === enhancementTitle && (!existingRow['Ticket ID'] || existingRow['Ticket ID'] === '')) {
                    existingRow['Ticket ID'] = newRow['Ticket ID'];
                }
                // Team backfill
                if (existingRow['Enhancement title'] === enhancementTitle && (!existingRow['Main Dev Team'] || existingRow['Main Dev Team'] === '')) {
                    existingRow['Main Dev Team'] = newRow['Main Dev Team'];
                }
            });

            if (dataIndex[rowKey] !== undefined) {
                // Update existing row for today
                trackingData[dataIndex[rowKey]] = newRow;
                log(`    Updated: ${taskTitle}`);
            } else {
                // Add new row
                trackingData.push(newRow);
                dataIndex[rowKey] = trackingData.length - 1;
                log(`    Added: ${taskTitle}`);
                addedCount++;
            }
        }
        if (addedCount === 0) log(`  No new tasks added.`);
    }

    // Save CSV
    if (trackingData.length > 0) {
        fs.writeFileSync(csvPath, stringifyCSV(trackingData), 'utf8');
        log(`CSV updated at ${csvPath}`);
    }

    return updatesLog;
}

// --- Utils ---

function searchOLTask(query, token) {
    return new Promise((resolve, reject) => {
        const fields = [
            "CoreField.Title", "CoreField.Identifier", "SystemIdentifier",
            "CoreField.DocSubType", "CoreField.Status", "AssignedTo",
            "Document.TimeSpentMn", "Document.TimeLeftMn", "dev.Main-dev-team"
        ].join(",");

        const params = new URLSearchParams({
            query: query,
            token: token,
            fields: fields,
            format: "JSON",
            limit: 1000
        });

        const url = `${API_URL}?${params.toString()}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.success === false) {
                        reject(new Error(`API Error: ${json.error}`));
                    } else {
                        resolve(json.APIResponse ? json.APIResponse.Items : []);
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse API response: ${e.message}`));
                }
            });
        }).on('error', (e) => {
            reject(new Error(`Request failed: ${e.message}`));
        });
    });
}

function parseCSV(content) {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    // Naive CSV split that respects quotes is complex, 
    // but assuming simple format from PS helper (quotes are preserved inside logic)
    // Actually, PS Export-Csv puts quotes around everything.
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    const results = [];
    const splitRegex = /,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/;

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(splitRegex);
        const obj = {};
        headers.forEach((h, index) => {
            let val = values[index] ? values[index].trim() : '';
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            }
            // Unescape double quotes back to single quotes
            val = val.replace(/""/g, '"');
            obj[h] = val;
        });
        results.push(obj);
    }
    return results;
}

function stringifyCSV(data) {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    // Allow variable headers? No, assume consistent schema from first row + migration
    // Fix: If some rows miss keys (due to migration adding keys to some but not all?)
    // trackingData should be consistent if migrated properly.

    const headerLine = headers.map(h => `"${h}"`).join(',');
    const rows = data.map(row => {
        return headers.map(h => {
            let val = row[h] || '';
            // Escape quotes
            val = val.toString().replace(/"/g, '""');
            return `"${val}"`;
        }).join(',');
    });
    return [headerLine, ...rows].join('\n');
}

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('Press Ctrl+C to stop.');
});
