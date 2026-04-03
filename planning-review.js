/**
 * Planning Review Feature
 * Shows estimation drift analysis: stacked area chart + per-task progressive table
 */

let currentPlanningReviewIndex = null;
let planningReviewChartInstance = null;

function openPlanningReviewModal(index) {
    currentPlanningReviewIndex = index;
    const info = window.enhancementInfo[index];
    if (!info) return;

    const modal = document.getElementById('planning-review-modal');
    document.getElementById('planning-review-modal-title').textContent = 'Planning Review: ' + info.title;

    const select = document.getElementById('planning-review-date-select');
    select.innerHTML = '';
    const dates = info.dates || [];
    if (dates.length < 2) {
        document.getElementById('planning-review-body').innerHTML =
            '<p style="text-align:center;color:#7f8c8d;padding:40px;">Need at least 2 capture dates for planning review.</p>';
        modal.classList.add('show');
        return;
    }

    // Baseline options: all dates except the last
    dates.slice(0, -1).forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        if (i === 0) opt.selected = true;
        select.appendChild(opt);
    });

    document.getElementById('planning-review-current-date').textContent = dates[dates.length - 1];
    modal.classList.add('show');
    updatePlanningReview();
}

function closePlanningReviewModal() {
    document.getElementById('planning-review-modal').classList.remove('show');
    if (planningReviewChartInstance) {
        planningReviewChartInstance.destroy();
        planningReviewChartInstance = null;
    }
}

/**
 * Build task map for a single date. Keys by Task Identifier (falls back to title).
 * Also builds a title→key lookup for cross-matching old rows without identifiers.
 */
function buildPlanningTaskMap(rows) {
    const map = {};
    rows.forEach(row => {
        const id = (row['Task Identifier'] || row['Task title'] || '').trim();
        if (!id || map[id]) return;
        const spent = parseFloat(row['Time spent']) || 0;
        const left = parseFloat(row['Time left']) || 0;
        map[id] = {
            id: id,
            title: row['Task title'] || '(untitled)',
            spent: spent,
            left: left,
            total: spent + left,
            type: row['Type'] || '',
            status: row['Status'] || '',
            assignee: row['Assignee'] || '(unassigned)'
        };
    });
    return map;
}

/**
 * Build a unified task key that works across dates where some rows have identifiers and others don't.
 * Returns a canonical key for each task, preferring identifier but falling back to title.
 */
function buildUnifiedTaskIndex(dateMaps, allDates) {
    // First pass: collect all keys across all dates and build title↔key mappings
    const titleToCanonical = {};
    const allKeys = new Set();

    allDates.forEach(date => {
        const map = dateMaps[date];
        if (!map) return;
        Object.values(map).forEach(task => {
            allKeys.add(task.id);
            // If key looks like an identifier (L-xxx), map title→identifier
            if (task.id.startsWith('L-') && task.title) {
                titleToCanonical[task.title] = task.id;
            }
        });
    });

    // Second pass: for title-keyed entries, resolve to canonical identifier if known
    const keyRemap = {};
    allDates.forEach(date => {
        const map = dateMaps[date];
        if (!map) return;
        Object.keys(map).forEach(key => {
            if (!key.startsWith('L-') && titleToCanonical[key]) {
                keyRemap[key] = titleToCanonical[key];
            }
        });
    });

    return { titleToCanonical, keyRemap };
}

function getCanonicalKey(taskId, title, keyRemap) {
    if (keyRemap[taskId]) return keyRemap[taskId];
    return taskId;
}

function updatePlanningReview() {
    const info = window.enhancementInfo[currentPlanningReviewIndex];
    if (!info) return;

    const baselineDate = document.getElementById('planning-review-date-select').value;
    const allDates = info.dates || [];
    const currentDate = allDates[allDates.length - 1];
    const enhTitle = info.title;
    const rawData = window.rawParsedData || [];

    // Get dates from baseline to current (inclusive)
    const baseIdx = allDates.indexOf(baselineDate);
    const dateRange = allDates.slice(baseIdx);

    // Build task maps for each date in range
    const dateMaps = {};
    dateRange.forEach(date => {
        const rows = rawData.filter(r => r['Enhancement title'] === enhTitle && r['Capture date'] === date);
        dateMaps[date] = buildPlanningTaskMap(rows);
    });

    // Build unified key index for cross-matching title-keyed ↔ identifier-keyed entries
    const { keyRemap } = buildUnifiedTaskIndex(dateMaps, dateRange);

    // Build per-date aggregates for the stacked area chart
    const spentPerDate = [];
    const leftPerDate = [];
    dateRange.forEach(date => {
        const map = dateMaps[date];
        let totalSpent = 0, totalLeft = 0;
        if (map) {
            Object.values(map).forEach(t => { totalSpent += t.spent; totalLeft += t.left; });
        }
        spentPerDate.push(parseFloat((totalSpent / 60).toFixed(1)));
        leftPerDate.push(parseFloat((totalLeft / 60).toFixed(1)));
    });

    // Build per-task progressive data across all dates
    // Collect all unique canonical task keys and their best-known title
    const taskMeta = {}; // canonicalKey → { title, assignee, status, firstSeen, lastSeen }
    dateRange.forEach((date, di) => {
        const map = dateMaps[date];
        if (!map) return;
        Object.values(map).forEach(task => {
            const cKey = getCanonicalKey(task.id, task.title, keyRemap);
            if (!taskMeta[cKey]) {
                taskMeta[cKey] = { title: task.title, assignee: task.assignee, status: task.status, firstSeen: di, lastSeen: di };
            } else {
                taskMeta[cKey].lastSeen = di;
                // Prefer latest title/status/assignee
                taskMeta[cKey].title = task.title;
                taskMeta[cKey].assignee = task.assignee;
                taskMeta[cKey].status = task.status;
            }
        });
    });

    // Build per-task totals across all dates
    const taskTimeline = {}; // canonicalKey → [total_at_date0, total_at_date1, ...]
    Object.keys(taskMeta).forEach(cKey => {
        taskTimeline[cKey] = dateRange.map(() => null);
    });
    dateRange.forEach((date, di) => {
        const map = dateMaps[date];
        if (!map) return;
        Object.values(map).forEach(task => {
            const cKey = getCanonicalKey(task.id, task.title, keyRemap);
            taskTimeline[cKey][di] = task.total;
        });
    });

    // Categorize tasks
    const baselineKeys = new Set();
    const currentKeys = new Set();
    const bMap = dateMaps[dateRange[0]];
    const cMap = dateMaps[dateRange[dateRange.length - 1]];
    if (bMap) Object.values(bMap).forEach(t => baselineKeys.add(getCanonicalKey(t.id, t.title, keyRemap)));
    if (cMap) Object.values(cMap).forEach(t => currentKeys.add(getCanonicalKey(t.id, t.title, keyRemap)));

    const existingKeys = [...baselineKeys].filter(k => currentKeys.has(k));
    const newKeys = [...currentKeys].filter(k => !baselineKeys.has(k));
    const removedKeys = [...baselineKeys].filter(k => !currentKeys.has(k));

    // Compute summary aggregates
    const baselineTotal = existingKeys.concat(removedKeys).reduce((s, k) => s + (taskTimeline[k][0] || 0), 0);
    const currentTotal = existingKeys.concat(newKeys).reduce((s, k) => s + (taskTimeline[k][dateRange.length - 1] || 0), 0);
    const reEstDelta = existingKeys.reduce((s, k) => s + ((taskTimeline[k][dateRange.length - 1] || 0) - (taskTimeline[k][0] || 0)), 0);
    const scopeCreep = newKeys.reduce((s, k) => s + (taskTimeline[k][dateRange.length - 1] || 0), 0);
    const removedTotal = removedKeys.reduce((s, k) => s + (taskTimeline[k][0] || 0), 0);

    renderPlanningReviewChart(dateRange, spentPerDate, leftPerDate);
    renderPlanningReviewSummary(baselineTotal, reEstDelta, scopeCreep, removedTotal, currentTotal);
    renderPlanningReviewTable(dateRange, taskMeta, taskTimeline, existingKeys, newKeys, removedKeys);
}

function renderPlanningReviewChart(dateRange, spentPerDate, leftPerDate) {
    if (planningReviewChartInstance) {
        planningReviewChartInstance.destroy();
        planningReviewChartInstance = null;
    }

    const ctx = document.getElementById('planning-review-chart').getContext('2d');

    // Short date labels (M/D)
    const labels = dateRange.map(d => {
        const parts = d.split('-');
        return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
    });

    planningReviewChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Time Spent',
                    data: spentPerDate,
                    backgroundColor: 'rgba(52, 152, 219, 0.4)',
                    borderColor: '#3498db',
                    borderWidth: 2,
                    fill: true,
                    order: 2,
                    pointRadius: 2,
                    tension: 0.2
                },
                {
                    label: 'Time Left',
                    data: leftPerDate,
                    backgroundColor: 'rgba(231, 76, 60, 0.25)',
                    borderColor: '#e74c3c',
                    borderWidth: 2,
                    fill: true,
                    order: 1,
                    pointRadius: 2,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: 'Estimate Evolution Over Time (hours)', font: { size: 14 } },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        footer: function(items) {
                            const total = items.reduce((s, i) => s + i.parsed.y, 0);
                            return `Total Estimate: ${total.toFixed(1)} hrs (${(total / 6.5).toFixed(1)} days)`;
                        }
                    }
                }
            },
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { title: { display: true, text: 'Date' } },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: { display: true, text: 'Hours' }
                }
            }
        }
    });
}

function renderPlanningReviewSummary(baselineTotal, reEstDelta, scopeCreep, removedTotal, currentTotal) {
    const toH = m => (m / 60).toFixed(1);
    const toD = m => (m / 60 / 6.5).toFixed(1);
    const netChange = currentTotal - baselineTotal;
    const sign = n => n >= 0 ? '+' : '';

    document.getElementById('planning-review-summary').innerHTML = `
        <div class="planning-review-summary">
            <div class="planning-review-summary-card" style="background:#ebf5fb;">
                <div style="font-size:0.8em;color:#7f8c8d;">Baseline</div>
                <div style="color:#3498db;">${toH(baselineTotal)} hrs (${toD(baselineTotal)} days)</div>
            </div>
            <div class="planning-review-summary-card" style="background:${reEstDelta >= 0 ? '#fdedec' : '#eafaf1'};">
                <div style="font-size:0.8em;color:#7f8c8d;">Re-estimation</div>
                <div style="color:${reEstDelta >= 0 ? '#e74c3c' : '#27ae60'};">${sign(reEstDelta)}${toH(reEstDelta)} hrs</div>
            </div>
            <div class="planning-review-summary-card" style="background:#fdf2e9;">
                <div style="font-size:0.8em;color:#7f8c8d;">New Tasks</div>
                <div style="color:#e67e22;">+${toH(scopeCreep)} hrs</div>
            </div>
            <div class="planning-review-summary-card" style="background:#eafaf1;">
                <div style="font-size:0.8em;color:#7f8c8d;">Removed</div>
                <div style="color:#27ae60;">-${toH(removedTotal)} hrs</div>
            </div>
            <div class="planning-review-summary-card" style="background:#f4f6f7;">
                <div style="font-size:0.8em;color:#7f8c8d;">Current</div>
                <div style="color:#2c3e50;">${toH(currentTotal)} hrs (${toD(currentTotal)} days)</div>
            </div>
            <div class="planning-review-summary-card" style="background:${netChange >= 0 ? '#fdedec' : '#eafaf1'}; border: 2px solid ${netChange >= 0 ? '#e74c3c' : '#27ae60'};">
                <div style="font-size:0.8em;color:#7f8c8d;">Net Change</div>
                <div style="color:${netChange >= 0 ? '#e74c3c' : '#27ae60'}; font-size:1.1em;">${sign(netChange)}${toH(netChange)} hrs (${sign(netChange)}${toD(netChange)} days)</div>
            </div>
        </div>`;
}

function renderPlanningReviewTable(dateRange, taskMeta, taskTimeline, existingKeys, newKeys, removedKeys) {
    const container = document.getElementById('planning-review-table-container');
    const toH = m => (m / 60).toFixed(1);
    const deltaClass = d => d > 0.05 ? 'delta-positive' : d < -0.05 ? 'delta-negative' : 'delta-zero';
    const deltaStr = d => (d >= 0 ? '+' : '') + d.toFixed(1);

    const firstIdx = 0;
    const lastIdx = dateRange.length - 1;

    // Group ALL tasks by assignee
    const assigneeData = {};
    const allKeys = [...existingKeys, ...newKeys, ...removedKeys];
    const newKeySet = new Set(newKeys);
    const removedKeySet = new Set(removedKeys);

    allKeys.forEach(key => {
        const meta = taskMeta[key];
        const assignee = meta.assignee;
        if (!assigneeData[assignee]) {
            assigneeData[assignee] = { baselineTotal: 0, currentTotal: 0, tasks: [] };
        }

        const isNew = newKeySet.has(key);
        const isRemoved = removedKeySet.has(key);
        const baseline = isNew ? 0 : (taskTimeline[key][firstIdx] || 0);
        const current = isRemoved ? 0 : (taskTimeline[key][lastIdx] || 0);

        assigneeData[assignee].baselineTotal += baseline;
        assigneeData[assignee].currentTotal += current;
        assigneeData[assignee].tasks.push({
            title: meta.title,
            baseline: baseline,
            current: current,
            delta: current - baseline,
            isNew: isNew,
            isRemoved: isRemoved,
            status: meta.status
        });
    });

    // Compute deltas and sort assignees by delta descending (worst first)
    const sortedAssignees = Object.keys(assigneeData).sort((a, b) => {
        const dA = assigneeData[a].currentTotal - assigneeData[a].baselineTotal;
        const dB = assigneeData[b].currentTotal - assigneeData[b].baselineTotal;
        return dB - dA;
    });

    // Sort tasks within each assignee by |delta| descending
    sortedAssignees.forEach(assignee => {
        assigneeData[assignee].tasks.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    });

    // Build table
    let html = `<table class="planning-review-table">
        <thead><tr>
            <th style="min-width:250px;"></th>
            <th>Baseline</th>
            <th>Current</th>
            <th>Delta</th>
        </tr></thead><tbody>`;

    // Unique ID for toggle
    let rowId = 0;

    sortedAssignees.forEach(assignee => {
        const ad = assigneeData[assignee];
        const delta = (ad.currentTotal - ad.baselineTotal) / 60;
        const icon = delta > 0.05 ? '\u274C' : '\u2705';
        const aid = `pr-assignee-${rowId++}`;

        html += `<tr class="pr-assignee-row" data-target="${aid}" onclick="togglePlanningReviewAssignee(this)">
            <td><span class="pr-toggle">\u25B6</span> ${assignee} ${icon}</td>
            <td>${toH(ad.baselineTotal)}</td>
            <td>${toH(ad.currentTotal)}</td>
            <td class="${deltaClass(delta)}">${deltaStr(delta)}</td>
        </tr>`;

        ad.tasks.forEach(t => {
            const tDelta = t.delta / 60;
            const suffix = t.isNew ? ' <span style="color:#e67e22;font-size:0.8em;">(NEW)</span>' :
                           t.isRemoved ? ' <span style="color:#95a5a6;font-size:0.8em;">(REMOVED)</span>' : '';
            html += `<tr class="pr-task-row ${aid}" style="display:none;">
                <td title="${t.status}" style="padding-left:30px;">${t.title}${suffix}</td>
                <td>${t.isNew ? '<span style="color:#ccc;">—</span>' : toH(t.baseline)}</td>
                <td>${t.isRemoved ? '<span style="color:#ccc;">—</span>' : toH(t.current)}</td>
                <td class="${deltaClass(tDelta)}">${deltaStr(tDelta)}</td>
            </tr>`;
        });
    });

    // Total row
    const allBaseline = sortedAssignees.reduce((s, a) => s + assigneeData[a].baselineTotal, 0);
    const allCurrent = sortedAssignees.reduce((s, a) => s + assigneeData[a].currentTotal, 0);
    const totalDelta = (allCurrent - allBaseline) / 60;
    html += `<tr class="total-row">
        <td><strong>TOTAL</strong></td>
        <td>${toH(allBaseline)}</td>
        <td>${toH(allCurrent)}</td>
        <td class="${deltaClass(totalDelta)}">${deltaStr(totalDelta)}</td>
    </tr>`;

    html += '</tbody></table>';
    container.innerHTML = html;
}

function togglePlanningReviewAssignee(row) {
    const target = row.dataset.target;
    const toggle = row.querySelector('.pr-toggle');
    const taskRows = document.querySelectorAll(`.pr-task-row.${target}`);
    const isExpanded = toggle.textContent === '\u25BC';
    taskRows.forEach(tr => { tr.style.display = isExpanded ? 'none' : 'table-row'; });
    toggle.textContent = isExpanded ? '\u25B6' : '\u25BC';
}

// Expose
window.openPlanningReviewModal = openPlanningReviewModal;
window.closePlanningReviewModal = closePlanningReviewModal;
window.togglePlanningReviewAssignee = togglePlanningReviewAssignee;
