/**
 * Application Logic for Time Tracking Report
 * Handles ticket management, API calls, and initialization
 */

// Use sessionStorage so it survives reloads but clears on close
let userToken = sessionStorage.getItem('ol_api_token') || '';
let hasAddedTickets = false;
let hasRemovedTickets = false;

// --- Token Management ---
function clearToken() {
    userToken = '';
    sessionStorage.removeItem('ol_api_token');
    alert('Token cleared! Click "Update Data" to enter a new token.');
}

// --- Modal Management ---
function openTicketModal() {
    hasAddedTickets = false;
    hasRemovedTickets = false;
    document.getElementById('ticket-modal').classList.add('show');
}

function closeTicketModal() {
    document.getElementById('ticket-modal').classList.remove('show');
    if (hasAddedTickets) {
        updateData();
    } else if (hasRemovedTickets) {
        location.reload();
    }
}

function showErrorModal(message) {
    document.getElementById('modal-message').textContent = message;
    document.getElementById('error-modal').classList.add('show');
}

function closeModal() {
    document.getElementById('error-modal').classList.remove('show');
}

// --- Ticket Management Logic ---
const DEFAULT_TICKET_IDS = [
    "2966C1", "299JUG", "29AFC7", "41UHTK", "290W0B", "295MDK",
    "2998U9", "41UDUO", "295PPP", "295PQ6", "2998UG", "41XBES",
    "295PU9", "28OKQ0", "2921J8", "41X6FO"
];

let currentTicketIds = JSON.parse(localStorage.getItem('tracked_tickets')) || DEFAULT_TICKET_IDS;

function saveTickets(action) {
    localStorage.setItem('tracked_tickets', JSON.stringify(currentTicketIds));
    renderTickets();
    if (action === 'add') hasAddedTickets = true;
    if (action === 'remove') hasRemovedTickets = true;
}

function renderTickets() {
    const listEl = document.getElementById('ticket-list');
    listEl.innerHTML = '';
    currentTicketIds.forEach(id => {
        const tag = document.createElement('div');
        tag.className = 'ticket-tag';
        tag.innerHTML = `
            <span>${id}</span>
            <span class="remove-ticket" onclick="removeTicket('${id}')" title="Remove">&times;</span>
        `;
        listEl.appendChild(tag);
    });
}

function addTicketFromInput() {
    const input = document.getElementById('new-ticket-input');
    const val = input.value.trim();
    if (!val) return;

    const id = parseTicketId(val);
    if (id) {
        if (!currentTicketIds.includes(id)) {
            currentTicketIds.push(id);
            saveTickets('add');
            input.value = '';
        } else {
            alert('Ticket ID already in list.');
        }
    } else {
        alert('Invalid Ticket ID or URL.');
    }
}

function removeTicket(id) {
    if (confirm(`Remove ticket ${id} from tracking list?`)) {
        currentTicketIds = currentTicketIds.filter(t => t !== id);
        saveTickets('remove');
    }
}

function parseTicketId(input) {
    // Case 1: URL like .../Tasks/29AFC7...
    let match = input.match(/\/Tasks\/([a-zA-Z0-9]+)/);
    if (match && match[1]) {
        return match[1].toUpperCase();
    }

    // Case 2: Just the ID (e.g. 29AFC7 or L-29AFC7)
    let clean = input.replace(/^L-/i, '').trim();
    if (/^[a-zA-Z0-9]+$/.test(clean)) {
        return clean.toUpperCase();
    }

    return null;
}

// --- Update Data & API Logic ---
function updateData() {
    if (!userToken) {
        userToken = prompt("Please enter your OrangeLogic API Token:");
        if (!userToken) return;
        sessionStorage.setItem('ol_api_token', userToken);
    }

    const btn = document.getElementById('update-btn');
    const originalText = btn.innerHTML;

    btn.innerHTML = 'Updating...';
    btn.disabled = true;

    fetch('/run-update-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: userToken,
            ticketIds: currentTicketIds.join(',')
        })
    })
        .then(async response => {
            const contentType = response.headers.get('content-type');
            if (!response.ok) {
                if (response.status === 404 || response.status === 405) {
                    throw new Error("The Update Service is not reachable.\n\nYou are likely viewing this file via VS Code Live Preview or directly from the file system.\n\nTo use the 'Update Data' feature, you must:\n1. Open a terminal in this file's folder.\n2. Run: node server.js\n3. Open: http://localhost:3001");
                }
                const text = await response.text();
                throw new Error(`Server returned ${response.status}: ${text}`);
            }
            if (contentType && contentType.includes('application/json')) {
                return response.json();
            }
            return {};
        })
        .then(result => {
            if (result.error) {
                if (result.error.toLowerCase().includes('token') || result.error.includes('401') || result.error.includes('403')) {
                    userToken = '';
                    sessionStorage.removeItem('ol_api_token');
                    throw new Error("Invalid Token or Verification Failed.\n\n" + result.error + "\n\nPlease try again with a valid token.");
                }
                throw new Error(result.error);
            }
            location.reload();
        })
        .catch(error => {
            let msg = error.message;
            if (msg.includes('Failed to fetch')) {
                msg = "Could not connect to the update server.\n\nSince this is a static HTML file, you must run a local server to execute the PowerShell script.\n\nCheck if 'server.js' is running.";
            }
            showErrorModal(msg);
        })
        .finally(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

function reloadEnhancement(ticketId, btn) {
    if (!userToken) {
        userToken = prompt("Please enter your OrangeLogic API Token:");
        if (!userToken) return;
        sessionStorage.setItem('ol_api_token', userToken);
    }

    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Reloading...';
    btn.disabled = true;

    fetch('/run-update-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: userToken,
            ticketIds: ticketId
        })
    })
        .then(async response => {
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server returned ${response.status}: ${text}`);
            }
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return response.json();
            }
            return {};
        })
        .then(result => {
            if (result.error) {
                if (result.error.toLowerCase().includes('token') || result.error.includes('401') || result.error.includes('403')) {
                    userToken = '';
                    sessionStorage.removeItem('ol_api_token');
                    throw new Error("Invalid Token.\n\n" + result.error);
                }
                throw new Error(result.error);
            }
            location.reload();
        })
        .catch(error => {
            showErrorModal(error.message);
        })
        .finally(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

// --- Initialization ---
function initializeApp() {
    // Render tickets UI
    renderTickets();

    // Load and process CSV data
    fetch('Time_tracking_data.csv')
        .then(response => response.text())
        .then(csvText => {
            const parsedData = parseCSV(csvText);
            const groupedData = processDataForTimeSeries(parsedData);
            const container = document.getElementById('report-container');

            // Find global latest date
            const globalMaxDate = parsedData.reduce((max, row) => (row['Capture date'] > max ? row['Capture date'] : max), '');

            // Store globally for Gantt chart access
            window.rawParsedData = parsedData;
            window.globalMaxDate = globalMaxDate;

            // Get importance for each enhancement
            const getEnhancementImportance = (title) => {
                const row = parsedData.find(r =>
                    r['Enhancement title'] === title &&
                    r['Capture date'] === globalMaxDate &&
                    r['Importance']
                );
                return row ? row['Importance'] : '';
            };

            // Sort enhancements by Importance (1 first, empty/unknown last)
            const sortedEnhancements = Object.keys(groupedData)
                .filter(title => groupedData[title].dates.includes(globalMaxDate))
                .sort((a, b) => {
                    const impA = getEnhancementImportance(a);
                    const impB = getEnhancementImportance(b);

                    if (!impA && !impB) return 0;
                    if (!impA) return 1;
                    if (!impB) return -1;

                    const numA = parseInt(impA) || 999;
                    const numB = parseInt(impB) || 999;
                    return numA - numB;
                });

            sortedEnhancements.forEach((title, index) => {
                createChartSection(container, title, index, groupedData, parsedData, globalMaxDate);
            });

            // Create Global Chart
            createGlobalTimeLeftChart(groupedData, globalMaxDate, parsedData);

            // Create No ETA Section
            createNoETASection(parsedData, globalMaxDate);

            // Auto-run risk check on load
            checkRisk();
        })
        .catch(error => console.error('Error loading CSV:', error));
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
