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

    // Serve static files (CSS, JS)
    const staticFiles = {
        '/styles.css': { file: 'styles.css', type: 'text/css' },
        '/chart-utils.js': { file: 'chart-utils.js', type: 'application/javascript' },
        '/chart-render.js': { file: 'chart-render.js', type: 'application/javascript' },
        '/gantt.js': { file: 'gantt.js', type: 'application/javascript' },
        '/tree.js': { file: 'tree.js', type: 'application/javascript' },
        '/app.js': { file: 'app.js', type: 'application/javascript' },
        '/planning-review.js': { file: 'planning-review.js', type: 'application/javascript' }
    };

    if (req.method === 'GET' && staticFiles[req.url]) {
        const { file, type } = staticFiles[req.url];
        fs.readFile(path.join(__dirname, file), (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end(`${file} not found`);
                return;
            }
            res.writeHead(200, { 'Content-Type': type });
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
            res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
            res.end(data);
        });
        return;
    }

    // Serve enhancement metadata
    if (req.method === 'GET' && req.url === '/enhancement-meta') {
        const metaPath = path.join(__dirname, 'enhancement_meta.json');
        const data = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : '{}';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
        return;
    }

    if (req.method === 'POST' && req.url === '/enhancement-meta') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const { ticketId, field, value } = JSON.parse(body);
                const metaPath = path.join(__dirname, 'enhancement_meta.json');
                let meta = {};
                if (fs.existsSync(metaPath)) {
                    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                }
                if (!meta[ticketId]) meta[ticketId] = {};
                meta[ticketId][field] = value;
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
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

const ALLOWED_TYPES = ["Development", "Configuration Request", "Defect - QA Vietnam", "Question", "QA", "Infrastructure Deployment", "Access Change Request", "Infrastructure Project", "Research Analysis", "Infrastructure Configuration", "Merge Request Execution"];
const CONTAINER_TYPES = ["Development", "QA", "Infrastructure Deployment", "Access Change Request"];
const NO_RECURSE_TYPES = ["Technical Debt Code"];
const IGNORED_STATUSES = ["Obsolete", "Duplicate", "Closed", "Needs Peer Review", "Implemented on Dev", "In Revision", "Access granted", "Completed"];

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
    // Migration: If no "ETA" field, add it
    if (trackingData.length > 0 && !('ETA' in trackingData[0])) {
        console.log("Migrating CSV to include ETA...");
        trackingData.forEach(row => row['ETA'] = '');
    }
    // Migration: If no "Cortex Link" field, add it
    if (trackingData.length > 0 && !('Cortex Link' in trackingData[0])) {
        console.log("Migrating CSV to include Cortex Link...");
        trackingData.forEach(row => row['Cortex Link'] = '');
    }
    // Migration: If no "Status" field, add it
    if (trackingData.length > 0 && !('Status' in trackingData[0])) {
        console.log("Migrating CSV to include Status...");
        trackingData.forEach(row => row['Status'] = '');
    }
    // Migration: If no "Enhancement Status" field, add it
    if (trackingData.length > 0 && !('Enhancement Status' in trackingData[0])) {
        console.log("Migrating CSV to include Enhancement Status...");
        trackingData.forEach(row => row['Enhancement Status'] = '');
    }
    // Migration: If no "Importance" field, add it
    if (trackingData.length > 0 && !('Importance' in trackingData[0])) {
        console.log("Migrating CSV to include Importance...");
        trackingData.forEach(row => row['Importance'] = '');
    }
    // Migration: If no "Dependencies" field, add it
    if (trackingData.length > 0 && !('Dependencies' in trackingData[0])) {
        console.log("Migrating CSV to include Dependencies...");
        trackingData.forEach(row => row['Dependencies'] = '');
    }
    // Migration: If no "Task Identifier" field, add it
    if (trackingData.length > 0 && !('Task Identifier' in trackingData[0])) {
        console.log("Migrating CSV to include Task Identifier...");
        trackingData.forEach(row => row['Task Identifier'] = '');
    }
    // Migration: If no "Estimated Start Date" field, add it
    if (trackingData.length > 0 && !('Estimated Start Date' in trackingData[0])) {
        console.log("Migrating CSV to include Estimated Start Date...");
        trackingData.forEach(row => row['Estimated Start Date'] = '');
    }
    // Migration: If no "Estimated End Date" field, add it
    if (trackingData.length > 0 && !('Estimated End Date' in trackingData[0])) {
        console.log("Migrating CSV to include Estimated End Date...");
        trackingData.forEach(row => row['Estimated End Date'] = '');
    }
    // Migration: If no "Parent Folder" field, add it
    if (trackingData.length > 0 && !('Parent Folder' in trackingData[0])) {
        console.log("Migrating CSV to include Parent Folder...");
        trackingData.forEach(row => row['Parent Folder'] = '');
    }

    // Index for fast lookup — prefer Task Identifier as key (handles renames)
    const dataIndex = {};
    trackingData.forEach((row, i) => {
        const tid = (row['Task Identifier'] || '').trim();
        const key = tid
            ? `${row['Capture date']}|${row['Enhancement title']}|${tid}`
            : `${row['Capture date']}|${row['Enhancement title']}|${row['Task title']}`;
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

        // Extract Importance for next release from the enhancement
        const importanceField = enhancementTasks[0]["product.Importance-for-next-release"];
        let enhancementImportance = "";
        if (typeof importanceField === 'string') {
            enhancementImportance = importanceField;
        } else if (importanceField && importanceField.Value) {
            enhancementImportance = importanceField.Value;
        }
        if (enhancementImportance) {
            log(`  Importance: ${enhancementImportance}`);
        }

        // Extract status of the enhancement ticket itself
        const enhancementStatus = (enhancementTasks[0]["CoreField.Status"] || "").trim();
        if (enhancementStatus) {
            log(`  Status: ${enhancementStatus}`);
        }

        // 2. Get Direct Children
        let directChildren = await searchOLTask(`Parentfolderidentifier:("${fullTicketId}")`, token);
        directChildren = directChildren || [];
        log(`    Direct Children: ${directChildren.length}`);

        let allTasks = [...directChildren];

        // 3. Find 'Development' folder and recursively get all descendants
        const devTask = directChildren.find(t => t["CoreField.Title"] === "Development");
        if (devTask) {
            const devId = devTask["CoreField.Identifier"];
            log(`    Found Development container: ${devId}`);
            const existingIds = new Set(allTasks.map(t => t["CoreField.Identifier"]));
            const devDescendants = await getAllDescendants(devId, token, log);
            const newDevItems = devDescendants.filter(t => !existingIds.has(t["CoreField.Identifier"]));
            allTasks.push(...newDevItems);
        }

        // 3.5. Supplement with known containers from CSV history that may have been cut off
        // The main Parentfolderidentifier query is hard-capped at 100 items by the API.
        // If a container (e.g. the Development folder) itself was cut off, its children are missing.
        // We recover them by querying each known container ID directly.
        {
            const seenInAllTasks = new Set(allTasks.map(t => t["CoreField.Identifier"]));
            const knownContainerIds = new Set();
            trackingData.forEach(row => {
                if (row['Enhancement title'] === enhancementTitle && row['Parent Folder']) {
                    knownContainerIds.add(row['Parent Folder']);
                }
            });
            for (const cId of knownContainerIds) {
                // Never re-query the enhancement root itself (already done in step 3)
                if (cId === fullTicketId) continue;
                // Skip only if ALL known children of this container are already in allTasks.
                // NOTE: do NOT skip just because the container itself is in allTasks — finding the
                // container does NOT mean all its children were returned (100-item cap applies to
                // the entire descendant set, so a found container can still have missing children).
                const knownChildren = trackingData.filter(row =>
                    row['Enhancement title'] === enhancementTitle &&
                    row['Parent Folder'] === cId &&
                    row['Task Identifier']
                );
                const allChildrenPresent = knownChildren.length > 0 &&
                    knownChildren.every(row => seenInAllTasks.has(row['Task Identifier']));
                if (allChildrenPresent) continue;
                log(`    Supplementing from CSV-known container: ${cId}`);
                const extra = await searchOLTask(`Parentfolderidentifier:("${cId}")`, token);
                if (extra && extra.length > 0) {
                    const newItems = extra.filter(t => !seenInAllTasks.has(t["CoreField.Identifier"]));
                    allTasks.push(...newItems);
                    newItems.forEach(t => seenInAllTasks.add(t["CoreField.Identifier"]));
                }
            }
        }

        // 3.6: Direct lookup for tasks ever seen in CSV history but missing from allTasks
        // Handles tasks that fall outside the 100-item cap at every nesting level
        {
            const fetchedIds = new Set(allTasks.map(t => t["CoreField.Identifier"]));
            const missingIds = [...new Set(
                trackingData
                    .filter(row =>
                        row['Enhancement title'] === enhancementTitle &&
                        row['Capture date'] < captureDate &&
                        row['Task Identifier'] &&
                        !fetchedIds.has(row['Task Identifier'])
                    )
                    .map(row => row['Task Identifier'])
            )];
            // Build set of all identifiers ever seen in this enhancement's CSV history
            const knownEnhancementIds = new Set();
            trackingData.forEach(row => {
                if (row['Enhancement title'] === enhancementTitle) {
                    if (row['Task Identifier']) knownEnhancementIds.add(row['Task Identifier']);
                    if (row['Parent Folder']) knownEnhancementIds.add(row['Parent Folder']);
                }
            });
            knownEnhancementIds.add(fullTicketId);

            for (const tid of missingIds) {
                const found = await searchOLTask(`SystemIdentifier:("${tid}")`, token);
                if (found && found.length > 0) {
                    // Verify the task still belongs to this enhancement.
                    // Accept if: parent is the enhancement root, OR parent was fetched,
                    // OR parent is known from CSV history (covers parents also cut off by API cap).
                    // Only skip if the parent is completely unknown to this enhancement.
                    const parentId = found[0]["ParentFolderIdentifier"] || "";
                    if (parentId && parentId !== fullTicketId && !fetchedIds.has(parentId) && !knownEnhancementIds.has(parentId)) {
                        log(`    Skipped ${tid} (parent ${parentId} not known in this enhancement)`);
                        continue;
                    }
                    allTasks.push(found[0]);
                    fetchedIds.add(tid);
                    log(`    Direct lookup found: ${tid}`);
                }
            }
        }

        // 4. Filter out tasks under excluded types (and their descendants)
        // Note: Parentfolderidentifier query returns ALL descendants, not just direct children,
        // so directChildren already contains nested tasks like children of "Technical Debt Code" containers.
        const excludedIds = new Set();
        for (const task of allTasks) {
            const type = (task["CoreField.DocSubType"] || '').trim();
            if (NO_RECURSE_TYPES.includes(type)) {
                excludedIds.add(task["CoreField.Identifier"]);
            }
        }
        if (excludedIds.size > 0) {
            // Multi-pass: also exclude descendants of excluded tasks
            let prevSize = 0;
            while (excludedIds.size > prevSize) {
                prevSize = excludedIds.size;
                for (const task of allTasks) {
                    const parentFolder = task["ParentFolderIdentifier"] || "";
                    if (excludedIds.has(parentFolder)) {
                        excludedIds.add(task["CoreField.Identifier"]);
                    }
                }
            }
            const beforeCount = allTasks.length;
            allTasks = allTasks.filter(t => !excludedIds.has(t["CoreField.Identifier"]));
            if (allTasks.length < beforeCount) {
                log(`    Excluded ${beforeCount - allTasks.length} task(s) under ${NO_RECURSE_TYPES.join(', ')} containers`);
            }
        }

        // 5. Process Tasks — track which identifiers we see from the API
        let addedCount = 0;
        const seenIdentifiers = new Set();
        for (const task of allTasks) {
            const type = (task["CoreField.DocSubType"] || '').trim();
            if (NO_RECURSE_TYPES.includes(type)) continue;
            if (type && !ALLOWED_TYPES.includes(type)) continue;

            const taskTitle = task["CoreField.Title"];
            const taskIdentifier = task["CoreField.Identifier"] || "";
            const assignee = task.AssignedTo || '(unassigned)';
            const status = (task["CoreField.Status"] || '').trim();

            const timeSpent = task["Document.TimeSpentMn"] || "0";
            let timeLeft = task["Document.TimeLeftMn"] || "0";
            const eta = task["Document.CurrentEstimatedCompletionDate"] || "";
            const cortexLink = task["Document.CortexShareLinkRaw"] || "";
            const estimatedStartDate = task["Document.CurrentEstimatedStartDate"] || "";
            const estimatedEndDate = task["Document.CurrentEstimatedEndDate"] || "";
            const parentFolder = task["ParentFolderIdentifier"] || "";

            // Extract dependencies - can be array of objects or string
            let dependencies = "";
            const depField = task["Document.Dependencies"];
            if (Array.isArray(depField) && depField.length > 0) {
                // Format: [{Identifier: "L-XXXX", Title: "...", RecordId: "..."}, ...]
                dependencies = depField.map(d => d.Identifier || d.RecordId || d).filter(d => d).join(";");
            } else if (typeof depField === 'string') {
                dependencies = depField;
            }
            // Use team from enhancement (parent level) - child tasks don't have this field

            if (IGNORED_STATUSES.includes(status)) {
                timeLeft = "0";
            }

            seenIdentifiers.add(taskIdentifier);
            const rowKey = taskIdentifier
                ? `${captureDate}|${enhancementTitle}|${taskIdentifier}`
                : `${captureDate}|${enhancementTitle}|${taskTitle}`;

            const newRow = {
                'Capture date': captureDate,
                'Enhancement title': enhancementTitle,
                'Task title': taskTitle,
                'Task Identifier': taskIdentifier,
                'Type': type,
                'Assignee': assignee,
                'Time spent': timeSpent,
                'Time left': timeLeft,
                'Ticket ID': rawId.replace(/^L-/, ''), // Store short ID
                'Main Dev Team': enhancementTeam,
                'ETA': eta,
                'Cortex Link': cortexLink,
                'Status': status,
                'Importance': enhancementImportance,
                'Dependencies': dependencies,
                'Estimated Start Date': estimatedStartDate,
                'Estimated End Date': estimatedEndDate,
                'Parent Folder': parentFolder,
                'Enhancement Status': enhancementStatus
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
                // Enhancement title rename backfill (if ticket was renamed on Link)
                if (existingRow['Ticket ID'] === newRow['Ticket ID'] && existingRow['Enhancement title'] !== enhancementTitle) {
                    log(`    Renaming old title "${existingRow['Enhancement title']}" → "${enhancementTitle}"`);
                    existingRow['Enhancement title'] = enhancementTitle;
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

        // 6. Remove CSV rows for today's date + this enhancement that are no longer in the API response
        let removedCount = 0;
        trackingData = trackingData.filter(row => {
            if (row['Capture date'] === captureDate &&
                row['Enhancement title'] === enhancementTitle &&
                row['Task Identifier'] &&
                !seenIdentifiers.has(row['Task Identifier'])) {
                log(`    Removed (no longer on Link): ${row['Task title']} (${row['Task Identifier']})`);
                removedCount++;
                return false;
            }
            return true;
        });
        if (removedCount > 0) log(`  Removed ${removedCount} task(s) no longer found on Link.`);
    }

    // Save CSV
    if (trackingData.length > 0) {
        fs.writeFileSync(csvPath, stringifyCSV(trackingData), 'utf8');
        log(`CSV updated at ${csvPath}`);
    }

    return updatesLog;
}

// --- Utils ---

async function getAllDescendants(parentId, token, log, depth = 1) {
    if (depth > 10) return []; // Safety limit
    const children = await searchOLTask(`Parentfolderidentifier:("${parentId}")`, token);
    if (!children || children.length === 0) return [];

    const indent = '    ' + '  '.repeat(depth);
    let all = [];
    for (const child of children) {
        const childId = child["CoreField.Identifier"];
        const childTitle = child["CoreField.Title"];
        const childType = (child["CoreField.DocSubType"] || '').trim();

        if (NO_RECURSE_TYPES.includes(childType)) continue; // Skip excluded types entirely

        all.push(child);
        // Only recurse into container types (Development, QA, etc.)
        if (childId && CONTAINER_TYPES.includes(childType)) {
            log(`${indent}Checking children of: ${childTitle} (${childId})`);
            const descendants = await getAllDescendants(childId, token, log, depth + 1);
            all.push(...descendants);
        }
    }
    return all;
}

function searchOLTaskPage(query, token, start) {
    return new Promise((resolve, reject) => {
        const fields = [
            "CoreField.Title", "CoreField.Identifier", "SystemIdentifier",
            "CoreField.DocSubType", "CoreField.Status", "AssignedTo",
            "Document.TimeSpentMn", "Document.TimeLeftMn", "dev.Main-dev-team",
            "Document.CurrentEstimatedCompletionDate", "Document.CortexShareLinkRaw",
            "product.Importance-for-next-release", "Document.Dependencies",
            "Document.CurrentEstimatedStartDate", "Document.CurrentEstimatedEndDate",
            "ParentFolderIdentifier"
        ].join(",");

        const params = new URLSearchParams({
            query: query,
            token: token,
            fields: fields,
            format: "JSON",
            limit: 100,
            start: start
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

async function searchOLTask(query, token) {
    const PAGE_SIZE = 100;
    const MAX_PAGES = 20;
    let all = [];
    let start = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
        const items = await searchOLTaskPage(query, token, start);
        if (!items || items.length === 0) break;
        // Detect if pagination is not working (same IDs as last page)
        if (all.length > 0 && items[0]["CoreField.Identifier"] === all[all.length - items.length]["CoreField.Identifier"]) {
            break; // API doesn't support start offset, stop to avoid duplicates
        }
        all.push(...items);
        if (items.length < PAGE_SIZE) break; // last page
        start += PAGE_SIZE;
    }
    return all;
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
