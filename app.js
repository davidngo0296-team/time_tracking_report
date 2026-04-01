/**
 * Application Logic for Time Tracking Report
 * Handles ticket management, API calls, and initialization
 */

// Use sessionStorage so it survives reloads but clears on close
let userToken = sessionStorage.getItem('ol_api_token') || '';
let newlyAddedTickets = [];
let hasRemovedTickets = false;

// --- Reload Timestamps ---
function formatReloadTime(ts) {
    const d = new Date(ts);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${months[d.getMonth()]}, ${d.getFullYear()} at ${h}:${m}`;
}

function saveReloadTime(ticketId) {
    localStorage.setItem(`lastReload_${ticketId}`, Date.now());
}

// --- Token Management ---
function clearToken() {
    userToken = '';
    sessionStorage.removeItem('ol_api_token');
    alert('Token cleared! Click "Update Data" to enter a new token.');
}

// --- Modal Management ---
function openTicketModal() {
    newlyAddedTickets = [];
    hasRemovedTickets = false;
    document.getElementById('ticket-modal').classList.add('show');
}

function closeTicketModal() {
    document.getElementById('ticket-modal').classList.remove('show');
    if (newlyAddedTickets.length > 0) {
        updateData(newlyAddedTickets);
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
    // newlyAddedTickets is updated directly in addTicketFromInput()
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
            newlyAddedTickets.push(id);
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
function updateData(ticketIds) {
    // If called with specific IDs (e.g. from reload or new ticket), skip the selection modal
    if (ticketIds) {
        runUpdateData(ticketIds);
        return;
    }
    openUpdateModal();
}

function openUpdateModal() {
    const list = document.getElementById('update-checkbox-list');
    list.innerHTML = '';

    const parsedData = window.rawParsedData || [];

    // Build title and importance maps using the latest date seen per ticket
    const latestDateMap = {};
    const titleMap = {};
    const importanceMap = {};
    parsedData.forEach(row => {
        const tid = row['Ticket ID'];
        if (!tid) return;
        if (!latestDateMap[tid] || row['Capture date'] > latestDateMap[tid]) {
            latestDateMap[tid] = row['Capture date'];
            titleMap[tid] = row['Enhancement title'] || '';
        }
        if (row['Importance'] && !importanceMap[tid]) {
            importanceMap[tid] = row['Importance'];
        }
    });

    // Sort by importance, matching page order
    const sortedIds = [...currentTicketIds].sort((a, b) => {
        const impA = importanceMap[a];
        const impB = importanceMap[b];
        if (!impA && !impB) return 0;
        if (!impA) return 1;
        if (!impB) return -1;
        return (parseInt(impA) || 999) - (parseInt(impB) || 999);
    });

    sortedIds.forEach(id => {
        const title = titleMap[id] || '(not yet fetched)';
        const item = document.createElement('label');
        item.className = 'update-checkbox-item';
        item.innerHTML = `
            <input type="checkbox" class="update-checkbox" value="${id}" checked>
            <span class="update-checkbox-id">${id}</span>
            <span class="update-checkbox-title">${title}</span>
        `;
        list.appendChild(item);
    });

    document.getElementById('update-modal').classList.add('show');
}

function closeUpdateModal() {
    document.getElementById('update-modal').classList.remove('show');
}

function toggleAllUpdateCheckboxes(checked) {
    document.querySelectorAll('.update-checkbox').forEach(cb => cb.checked = checked);
}

function confirmUpdate() {
    const selected = [...document.querySelectorAll('.update-checkbox:checked')].map(cb => cb.value);
    if (selected.length === 0) {
        alert('Please select at least one enhancement.');
        return;
    }
    closeUpdateModal();

    // Set each selected enhancement's reload button to reloading state
    selected.forEach(id => {
        const btn = document.getElementById(`reload-btn-${id}`);
        if (btn) {
            btn.innerHTML = '⏳ Reloading...';
            btn.disabled = true;
        }
    });

    runUpdateData(selected);
}

function runUpdateData(ticketIds) {
    if (!userToken) {
        userToken = prompt("Please enter your OrangeLogic API Token:");
        if (!userToken) return;
        sessionStorage.setItem('ol_api_token', userToken);
    }

    const idsToUpdate = ticketIds;

    const btn = document.getElementById('update-btn');
    const originalText = btn.innerHTML;

    btn.innerHTML = 'Updating...';
    btn.disabled = true;

    fetch('/run-update-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: userToken,
            ticketIds: idsToUpdate.join(',')
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
            const ids = Array.isArray(idsToUpdate) ? idsToUpdate : String(idsToUpdate).split(',');
            ids.forEach(id => { if (id.trim()) saveReloadTime(id.trim()); });
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
            // Re-fetch CSV and refresh only this enhancement section
            saveReloadTime(ticketId);
            return refreshEnhancementSection(ticketId, btn);
        })
        .catch(error => {
            showErrorModal(error.message);
        })
        .finally(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

function refreshEnhancementSection(ticketId, btn) {
    const section = btn.closest('.enhancement-section');
    if (!section) return;

    // Find the index from the filter select inside this section
    const filterSelect = section.querySelector('select[id^="filter-"]');
    const index = filterSelect ? parseInt(filterSelect.id.replace('filter-', '')) : null;
    if (index === null) return;

    return fetch('Time_tracking_data.csv')
        .then(response => response.text())
        .then(csvText => {
            const parsedData = parseCSV(csvText);
            const groupedData = processDataForTimeSeries(parsedData);

            // Update global latest date
            const globalMaxDate = parsedData.reduce((max, row) =>
                (row['Capture date'] > max ? row['Capture date'] : max), '');

            // Update globals
            window.rawParsedData = parsedData;
            window.globalMaxDate = globalMaxDate;

            const info = window.enhancementInfo[index];
            if (!info) return;
            const title = info.title;

            // Destroy existing chart instances for this section
            ['chart-spent-', 'chart-left-', 'chart-left-blocked-', 'chart-estimate-'].forEach(prefix => {
                const canvasId = `${prefix}${index}`;
                if (chartInstances[canvasId]) {
                    chartInstances[canvasId].destroy();
                    delete chartInstances[canvasId];
                }
                delete chartStore[canvasId];
            });

            // Remove old section first to avoid duplicate canvas IDs
            const parent = section.parentNode;
            const nextSibling = section.nextSibling;
            section.remove();

            // Insert temp container at the old section's position
            const tempContainer = document.createElement('div');
            if (nextSibling) {
                parent.insertBefore(tempContainer, nextSibling);
            } else {
                parent.appendChild(tempContainer);
            }

            // Create new section (canvases have unique IDs in DOM now)
            createChartSection(tempContainer, title, index, groupedData, parsedData, globalMaxDate);

            // Unwrap from temp container
            const newSection = tempContainer.firstChild;
            parent.insertBefore(newSection, tempContainer);
            tempContainer.remove();

            // Also refresh global stats and no-ETA sections
            createGlobalTimeLeftChart(groupedData, globalMaxDate, parsedData);
            createNoETASection(parsedData, globalMaxDate);
        });
}

// --- Blockers ---
let currentBlockersTicketId = '';
let currentBlockersIndex = null;

function openBlockersModal(ticketId, index) {
    currentBlockersTicketId = ticketId;
    currentBlockersIndex = index;
    const meta = window.enhancementMeta || {};
    const blockers = (meta[ticketId] && meta[ticketId].blockers) || '';
    const viewEl = document.getElementById('blockers-modal-view');
    viewEl.innerHTML = blockers.trim()
        ? renderMarkdown(blockers)
        : '<span class="blockers-placeholder">No blockers noted.</span>';
    document.getElementById('blockers-modal-textarea').style.display = 'none';
    document.getElementById('blockers-modal-view').style.display = 'block';
    document.getElementById('blockers-footer-view').style.display = 'flex';
    document.getElementById('blockers-footer-edit').style.display = 'none';
    document.getElementById('blockers-modal').classList.add('show');
}

function editBlockersModal() {
    const meta = window.enhancementMeta || {};
    const blockers = (meta[currentBlockersTicketId] && meta[currentBlockersTicketId].blockers) || '';
    document.getElementById('blockers-modal-textarea').value = blockers;
    document.getElementById('blockers-modal-view').style.display = 'none';
    document.getElementById('blockers-modal-textarea').style.display = 'block';
    document.getElementById('blockers-footer-view').style.display = 'none';
    document.getElementById('blockers-footer-edit').style.display = 'flex';
    document.getElementById('blockers-modal-textarea').focus();
}

function cancelBlockersEdit() {
    document.getElementById('blockers-modal-view').style.display = 'block';
    document.getElementById('blockers-modal-textarea').style.display = 'none';
    document.getElementById('blockers-footer-view').style.display = 'flex';
    document.getElementById('blockers-footer-edit').style.display = 'none';
}

function closeBlockersModal() {
    document.getElementById('blockers-modal').classList.remove('show');
}

function saveBlockers() {
    const ticketId = currentBlockersTicketId;
    const value = document.getElementById('blockers-modal-textarea').value;
    const btn = document.getElementById('blockers-save-btn');

    btn.textContent = 'Saving...';
    btn.disabled = true;

    fetch('/enhancement-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, field: 'blockers', value })
    })
        .then(r => r.json())
        .then(result => {
            if (!result.success) throw new Error(result.error);

            // Update global cache
            if (!window.enhancementMeta) window.enhancementMeta = {};
            if (!window.enhancementMeta[ticketId]) window.enhancementMeta[ticketId] = {};
            window.enhancementMeta[ticketId].blockers = value;

            // Update button indicator
            const blockersBtn = document.getElementById(`blockers-btn-${currentBlockersIndex}`);
            if (blockersBtn) {
                if (value.trim().length > 0) {
                    blockersBtn.classList.add('has-blockers');
                } else {
                    blockersBtn.classList.remove('has-blockers');
                }
            }

            // Switch back to view mode
            const viewEl = document.getElementById('blockers-modal-view');
            viewEl.innerHTML = value.trim()
                ? renderMarkdown(value)
                : '<span class="blockers-placeholder">No blockers noted.</span>';
            cancelBlockersEdit();
        })
        .catch(err => showErrorModal('Failed to save blockers: ' + err.message))
        .finally(() => {
            btn.textContent = 'Save';
            btn.disabled = false;
        });
}

// --- Initialization ---
function initializeApp() {
    // Render tickets UI
    renderTickets();

    // Fetch CSV and enhancement meta in parallel
    Promise.all([
        fetch('Time_tracking_data.csv').then(r => r.text()),
        fetch('/enhancement-meta').then(r => r.json()).catch(() => ({}))
    ])
        .then(([csvText, meta]) => {
            window.enhancementMeta = meta;
            return csvText;
        })
        .then(csvText => {
            const parsedData = parseCSV(csvText);
            const groupedData = processDataForTimeSeries(parsedData);
            const container = document.getElementById('report-container');

            // Find global latest date
            const globalMaxDate = parsedData.reduce((max, row) => (row['Capture date'] > max ? row['Capture date'] : max), '');

            // Store globally for Gantt chart access
            window.rawParsedData = parsedData;
            window.globalMaxDate = globalMaxDate;

            // Get importance for each enhancement using its own latest date
            const getEnhancementImportance = (title) => {
                const latestDate = groupedData[title].dates[groupedData[title].dates.length - 1];
                const row = parsedData.find(r =>
                    r['Enhancement title'] === title &&
                    r['Capture date'] === latestDate &&
                    r['Importance']
                );
                return row ? row['Importance'] : '';
            };

            // Sort enhancements by Importance (1 first, empty/unknown last)
            const sortedEnhancements = Object.keys(groupedData)
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
                const enhancementMaxDate = groupedData[title].dates[groupedData[title].dates.length - 1];
                createChartSection(container, title, index, groupedData, parsedData, enhancementMaxDate);
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
