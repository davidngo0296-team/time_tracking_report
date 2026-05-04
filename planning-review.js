/**
 * Planning Review Feature
 * Shows estimation drift analysis: stacked area chart + per-task progressive table
 */

let currentPlanningReviewIndex = null;
let planningReviewChartInstance = null;
let prSelectedAssignees = null; // Set of selected assignee names
let prAllAssignees = [];        // Full sorted list for the current modal

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

    // Build person filter from all rows for this enhancement
    const rawData = window.rawParsedData || [];
    const seen = new Set();
    rawData.forEach(r => {
        if (r['Enhancement title'] === info.title && r['Assignee'] && r['Assignee'] !== '(unassigned)') {
            seen.add(r['Assignee']);
        }
    });
    prAllAssignees = [...seen].sort();
    prSelectedAssignees = new Set(prAllAssignees);
    renderPRPersonFilter();

    modal.classList.add('show');
    updatePlanningReview();
}

function closePlanningReviewModal() {
    document.getElementById('planning-review-modal').classList.remove('show');
    if (planningReviewChartInstance) {
        planningReviewChartInstance.destroy();
        planningReviewChartInstance = null;
    }
    prSelectedAssignees = null;
    prAllAssignees = [];
}

function renderPRPersonFilter() {
    const container = document.getElementById('planning-review-person-filter');
    if (!container) return;
    container.innerHTML = '';

    if (prAllAssignees.length === 0) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'pr-person-filter';

    const allSelected = prAllAssignees.every(n => prSelectedAssignees.has(n));

    const toggleAll = document.createElement('button');
    toggleAll.className = 'pr-person-pill pr-person-all';
    toggleAll.textContent = allSelected ? 'All' : 'All';
    toggleAll.style.opacity = allSelected ? '1' : '0.5';
    toggleAll.onclick = () => {
        if (allSelected) {
            prSelectedAssignees = new Set();
        } else {
            prSelectedAssignees = new Set(prAllAssignees);
        }
        renderPRPersonFilter();
        updatePlanningReview();
    };
    wrapper.appendChild(toggleAll);

    prAllAssignees.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'pr-person-pill' + (prSelectedAssignees.has(name) ? ' active' : '');
        btn.textContent = name;
        btn.onclick = () => {
            if (prSelectedAssignees.has(name)) {
                prSelectedAssignees.delete(name);
            } else {
                prSelectedAssignees.add(name);
            }
            renderPRPersonFilter();
            updatePlanningReview();
        };
        wrapper.appendChild(btn);
    });

    container.appendChild(wrapper);
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

    // Read the active filter from the enhancement's dropdown
    const filterSelect = document.getElementById(`filter-${currentPlanningReviewIndex}`);
    const filterValue = filterSelect ? filterSelect.value : 'all';

    function applyTypeFilter(rows) {
        let result = rows;
        if (filterValue === 'qa') {
            result = result.filter(r => (r['Type'] || '').toLowerCase() === 'qa');
        } else if (filterValue === 'non-qa') {
            result = result.filter(r => (r['Type'] || '').toLowerCase() !== 'qa');
        } else if (filterValue === 'non-qa-non-defect') {
            result = result.filter(r => {
                const t = (r['Type'] || '').toLowerCase();
                return t !== 'qa' && !t.startsWith('defect');
            });
        }
        if (prSelectedAssignees !== null) {
            result = result.filter(r => prSelectedAssignees.has(r['Assignee'] || ''));
        }
        return result;
    }

    // Get dates from baseline to current (inclusive)
    const baseIdx = allDates.indexOf(baselineDate);
    const dateRange = allDates.slice(baseIdx);

    // Build task maps for each date in range, applying the active filter
    const dateMaps = {};
    dateRange.forEach(date => {
        const rows = rawData.filter(r => r['Enhancement title'] === enhTitle && r['Capture date'] === date);
        dateMaps[date] = buildPlanningTaskMap(applyTypeFilter(rows));
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
    const taskMeta = {}; // canonicalKey → { title, baselineAssignee, currentAssignee, status, firstSeen, lastSeen }
    dateRange.forEach((date, di) => {
        const map = dateMaps[date];
        if (!map) return;
        Object.values(map).forEach(task => {
            const cKey = getCanonicalKey(task.id, task.title, keyRemap);
            if (!taskMeta[cKey]) {
                taskMeta[cKey] = {
                    title: task.title,
                    baselineAssignee: task.assignee,
                    currentAssignee: task.assignee,
                    assignee: task.assignee,
                    status: task.status,
                    firstSeen: di, lastSeen: di
                };
            } else {
                taskMeta[cKey].lastSeen = di;
                taskMeta[cKey].title = task.title;
                taskMeta[cKey].currentAssignee = task.assignee;
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
    renderPlanningReviewTable(dateRange, taskMeta, taskTimeline, existingKeys, newKeys, removedKeys, baselineTotal, currentTotal);
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

function renderPlanningReviewTable(dateRange, taskMeta, taskTimeline, existingKeys, newKeys, removedKeys, summaryBaseline, summaryCurrent) {
    const container = document.getElementById('planning-review-table-container');
    const toH = m => (m / 60).toFixed(1);
    const deltaClass = d => d > 0.05 ? 'delta-positive' : d < -0.05 ? 'delta-negative' : 'delta-zero';
    const deltaStr = d => (d >= 0 ? '+' : '') + d.toFixed(1);

    const firstIdx = 0;
    const lastIdx = dateRange.length - 1;

    // Group tasks by assignee with category breakdown
    // Each task gets a "reason" for its delta: own-reest, received, given-away, new, removed
    const assigneeData = {};
    const allKeys = [...existingKeys, ...newKeys, ...removedKeys];
    const newKeySet = new Set(newKeys);
    const removedKeySet = new Set(removedKeys);

    function ensureAssignee(name) {
        if (!assigneeData[name]) {
            assigneeData[name] = {
                baselineTotal: 0, currentTotal: 0,
                ownReEst: 0,   // delta from tasks they owned at baseline AND still own
                received: 0,   // current total of tasks received from others
                givenAway: 0,  // baseline total of tasks given to others
                scopeNew: 0,   // current total of entirely new tasks
                scopeRemoved: 0, // baseline total of removed tasks
                tasks: []
            };
        }
    }

    allKeys.forEach(key => {
        const meta = taskMeta[key];
        const isNew = newKeySet.has(key);
        const isRemoved = removedKeySet.has(key);
        const baseline = isNew ? 0 : (taskTimeline[key][firstIdx] || 0);
        const current = isRemoved ? 0 : (taskTimeline[key][lastIdx] || 0);
        const sameOwner = meta.baselineAssignee === meta.currentAssignee;

        if (isNew) {
            // New task: attribute to current assignee
            const assignee = meta.currentAssignee;
            ensureAssignee(assignee);
            assigneeData[assignee].currentTotal += current;
            assigneeData[assignee].scopeNew += current;
            assigneeData[assignee].tasks.push({
                title: meta.title, baseline, current, delta: current,
                tag: 'NEW', tagColor: '#e67e22', status: meta.status
            });
        } else if (isRemoved) {
            // Removed task: attribute to baseline assignee
            const assignee = meta.baselineAssignee;
            ensureAssignee(assignee);
            assigneeData[assignee].baselineTotal += baseline;
            assigneeData[assignee].scopeRemoved += baseline;
            assigneeData[assignee].tasks.push({
                title: meta.title, baseline, current: 0, delta: -baseline,
                tag: 'REMOVED', tagColor: '#95a5a6', status: meta.status
            });
        } else if (sameOwner) {
            // Same owner: own re-estimation
            const assignee = meta.baselineAssignee;
            ensureAssignee(assignee);
            assigneeData[assignee].baselineTotal += baseline;
            assigneeData[assignee].currentTotal += current;
            assigneeData[assignee].ownReEst += (current - baseline);
            assigneeData[assignee].tasks.push({
                title: meta.title, baseline, current, delta: current - baseline,
                tag: null, tagColor: null, status: meta.status
            });
        } else {
            // Reassigned: show under BOTH assignees
            // Baseline assignee: "given away"
            ensureAssignee(meta.baselineAssignee);
            assigneeData[meta.baselineAssignee].baselineTotal += baseline;
            assigneeData[meta.baselineAssignee].givenAway += baseline;
            assigneeData[meta.baselineAssignee].tasks.push({
                title: meta.title, baseline, current: 0, delta: -baseline,
                tag: `\u2192 ${meta.currentAssignee}`, tagColor: '#8e44ad', status: meta.status
            });

            // Current assignee: "received"
            ensureAssignee(meta.currentAssignee);
            assigneeData[meta.currentAssignee].currentTotal += current;
            assigneeData[meta.currentAssignee].received += current;
            assigneeData[meta.currentAssignee].tasks.push({
                title: meta.title, baseline: 0, current, delta: current,
                tag: `\u2190 ${meta.baselineAssignee}`, tagColor: '#2980b9', status: meta.status
            });
        }
    });

    // Sort assignees by own re-estimation delta descending (worst planners first)
    const sortedAssignees = Object.keys(assigneeData).sort((a, b) => {
        return assigneeData[b].ownReEst - assigneeData[a].ownReEst;
    });

    // Sort tasks within each assignee by |delta| descending
    sortedAssignees.forEach(assignee => {
        assigneeData[assignee].tasks.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    });

    // Pre-compute totals so % column can reference allCurrent
    const allBaseline = sortedAssignees.reduce((s, a) => s + assigneeData[a].baselineTotal - assigneeData[a].givenAway, 0);
    const allCurrent = sortedAssignees.reduce((s, a) => s + assigneeData[a].currentTotal - assigneeData[a].received, 0);
    const totalDelta = (allCurrent - allBaseline) / 60;

    // % uses actual current workload (includes received tasks, no double-counting)
    const totalCurrentWork = sortedAssignees.reduce((s, a) => s + assigneeData[a].currentTotal, 0);
    const pctStr = (val) => totalCurrentWork > 0 ? (val / totalCurrentWork * 100).toFixed(1) + '%' : '-';

    // Build table
    let html = `<table class="planning-review-table">
        <thead><tr>
            <th style="min-width:280px;"></th>
            <th>Baseline</th>
            <th>Current</th>
            <th>%</th>
            <th>Delta</th>
        </tr></thead><tbody>`;

    // Unique ID for toggle
    let rowId = 0;

    sortedAssignees.forEach(assignee => {
        const ad = assigneeData[assignee];
        // Delta excludes transfers: only own re-estimation + new scope - removed scope
        const ownBaseline = ad.baselineTotal - ad.givenAway;
        const delta = (ad.currentTotal - ownBaseline) / 60;
        const icon = ad.ownReEst > 3 ? '\u274C' : '\u2705';
        const aid = `pr-assignee-${rowId++}`;

        // Build breakdown chips for the assignee row
        const chips = [];
        if (ad.ownReEst !== 0) {
            const c = ad.ownReEst > 0 ? '#e74c3c' : '#27ae60';
            chips.push(`<span style="color:${c};font-size:0.75em;" title="Own tasks re-estimation">${ad.ownReEst > 0 ? '+' : ''}${toH(ad.ownReEst)} re-est</span>`);
        }
        if (ad.scopeNew > 0) chips.push(`<span style="color:#e67e22;font-size:0.75em;" title="New tasks added">+${toH(ad.scopeNew)} new</span>`);
        if (ad.scopeRemoved > 0) chips.push(`<span style="color:#95a5a6;font-size:0.75em;" title="Tasks removed">-${toH(ad.scopeRemoved)} removed</span>`);
        if (ad.received > 0) chips.push(`<span style="color:#2980b9;font-size:0.75em;" title="Tasks received from others">${toH(ad.received)} received</span>`);
        if (ad.givenAway > 0) chips.push(`<span style="color:#8e44ad;font-size:0.75em;" title="Tasks given to others">${toH(ad.givenAway)} given away</span>`);
        const chipHtml = chips.length > 0 ? `<div style="margin-top:2px;">${chips.join(' &middot; ')}</div>` : '';

        html += `<tr class="pr-assignee-row" data-target="${aid}" onclick="togglePlanningReviewAssignee(this)">
            <td><span class="pr-toggle">\u25B6</span> ${assignee} ${icon}${chipHtml}</td>
            <td>${toH(ownBaseline)}</td>
            <td>${toH(ad.currentTotal)}</td>
            <td style="color:#7f8c8d;">${pctStr(ad.currentTotal)}</td>
            <td class="${deltaClass(delta)}">${deltaStr(delta)}</td>
        </tr>`;

        ad.tasks.forEach(t => {
            const tDelta = t.delta / 60;
            const tagHtml = t.tag ? ` <span style="color:${t.tagColor};font-size:0.8em;">(${t.tag})</span>` : '';
            const blankBaseline = t.tag === 'NEW' || (t.tag && t.tag.startsWith('\u2190'));
            const blankCurrent = t.tag === 'REMOVED' || (t.tag && t.tag.startsWith('\u2192'));
            html += `<tr class="pr-task-row ${aid}" style="display:none;">
                <td title="${t.status}" style="padding-left:30px;">${t.title}${tagHtml}</td>
                <td>${blankBaseline ? '<span style="color:#ccc;">\u2014</span>' : toH(t.baseline)}</td>
                <td>${blankCurrent ? '<span style="color:#ccc;">\u2014</span>' : toH(t.current)}</td>
                <td></td>
                <td class="${deltaClass(tDelta)}">${deltaStr(tDelta)}</td>
            </tr>`;
        });
    });

    const totalDeltaH = (summaryCurrent - summaryBaseline) / 60;
    html += `<tr class="total-row">
        <td><strong>TOTAL</strong></td>
        <td>${toH(summaryBaseline)}</td>
        <td>${toH(summaryCurrent)}</td>
        <td style="color:#7f8c8d;">100%</td>
        <td class="${deltaClass(totalDeltaH)}">${deltaStr(totalDeltaH)}</td>
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
window.renderPRPersonFilter = renderPRPersonFilter;
