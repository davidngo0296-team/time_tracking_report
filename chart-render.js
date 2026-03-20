/**
 * Chart Rendering for Time Tracking Report
 * Handles Chart.js rendering, risk analysis, and enhancement sections
 */

// Global stores for chart data and instances
const chartStore = {};
const chartInstances = {};
let currentRiskyAssignees = new Set();

/**
 * Check risk levels and highlight risky assignees
 */
function checkRisk() {
    const daysInput = document.getElementById('dev-days');
    const devDaysStr = daysInput.value.trim();
    const maxHours = devDaysStr === '' ? Infinity : (parseFloat(devDaysStr) * 8);
    const reportContainer = document.getElementById('risk-report');

    currentRiskyAssignees = new Set();
    reportContainer.innerHTML = '';

    const developerRisks = {};

    // 1. Aggregate Time Left per Developer across ALL enhancements
    Object.keys(chartStore).forEach(canvasId => {
        // Match chart-left-X but exclude chart-left-blocked-X
        if (/^chart-left-\d+$/.test(canvasId)) {
            const data = chartStore[canvasId];
            const enhancementTitle = data.enhancementTitle;

            data.barDatasets.forEach(dataset => {
                const assignee = dataset.label;
                const timeLeft = dataset.data[dataset.data.length - 1];

                if (timeLeft > 0) {
                    if (!developerRisks[assignee]) {
                        developerRisks[assignee] = { total: 0, details: [] };
                    }
                    developerRisks[assignee].total += timeLeft;
                    developerRisks[assignee].details.push({
                        enhancement: enhancementTitle,
                        time: timeLeft
                    });
                }
            });
        }
    });

    // 2. Identify Risk and Build Report
    let hasRisk = false;
    Object.keys(developerRisks).sort().forEach(assignee => {
        const riskData = developerRisks[assignee];

        if (riskData.total > maxHours || assignee === '(unassigned)') {
            hasRisk = true;
            currentRiskyAssignees.add(assignee);

            riskData.details.sort((a, b) => b.time - a.time);

            const itemDiv = document.createElement('div');
            itemDiv.className = 'risk-item';

            const header = document.createElement('h3');
            header.textContent = `${assignee} (Total: ${riskData.total.toFixed(1)} hrs)`;
            itemDiv.appendChild(header);

            const ul = document.createElement('ul');
            riskData.details.forEach(detail => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${detail.enhancement}</strong>: <span class="risk-time">${detail.time.toFixed(1)} hrs</span>`;
                ul.appendChild(li);
            });
            itemDiv.appendChild(ul);
            reportContainer.appendChild(itemDiv);
        }
    });

    if (!hasRisk && Object.keys(developerRisks).length > 0 && devDaysStr !== '') {
        reportContainer.innerHTML = '<div style="padding:15px; background:#d4edda; color:#155724; border-radius:4px;">No risks identified based on current criteria.</div>';
    }

    // 3. Re-render all charts to apply legend highlighting globally
    Object.keys(chartInstances).forEach(id => {
        const wrapper = document.querySelector(`#${id}`).closest('.chart-wrapper');
        const type = wrapper.querySelector('.chart-btn.active').classList.contains('btn-bar') ? 'bar' : 'pie';
        renderChart(id, type);
    });
}

/**
 * Render a chart (bar or pie) for a given canvas ID
 */
function renderChart(canvasId, type) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const data = chartStore[canvasId];
    const isTimeLeftChart = canvasId.includes('chart-left');

    // Destroy existing
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    // Update Buttons
    const wrapper = document.getElementById(canvasId).closest('.chart-wrapper');
    wrapper.querySelectorAll('.chart-btn').forEach(btn => btn.classList.remove('active'));
    wrapper.querySelector(`.btn-${type}`).classList.add('active');

    const legendColorCallback = (ctx) => {
        return (isTimeLeftChart && ctx.legendItem && currentRiskyAssignees.has(ctx.legendItem.text)) ? '#e74c3c' : '#666';
    };

    const legendFontCallback = (ctx) => {
        return {
            weight: (isTimeLeftChart && ctx.legendItem && currentRiskyAssignees.has(ctx.legendItem.text)) ? 'bold' : 'normal'
        };
    };

    // Helper to wrap text
    const wrapText = (str, maxLength) => {
        const words = str.split(' ');
        const lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            if (currentLine.length + 1 + words[i].length <= maxLength) {
                currentLine += ' ' + words[i];
            } else {
                lines.push(currentLine);
                currentLine = '  ' + words[i];
            }
        }
        lines.push(currentLine);
        return lines;
    };

    // Calculate shared Y-axis max for linked Time Left charts
    let sharedYMax = null;
    if (type === 'bar' && isTimeLeftChart) {
        const indexMatch = canvasId.match(/\d+$/);
        if (indexMatch) {
            const enhIndex = indexMatch[0];
            const leftChartId = `chart-left-${enhIndex}`;
            const blockedChartId = `chart-left-blocked-${enhIndex}`;

            const getStackedMax = (chartId) => {
                if (!chartStore[chartId] || !chartStore[chartId].barDatasets.length) return 0;
                const datasets = chartStore[chartId].barDatasets;
                const numDates = datasets[0].data.length;
                let maxStackedTotal = 0;

                for (let dateIdx = 0; dateIdx < numDates; dateIdx++) {
                    let stackedTotal = 0;
                    datasets.forEach(ds => {
                        stackedTotal += (ds.data[dateIdx] || 0);
                    });
                    if (stackedTotal > maxStackedTotal) {
                        maxStackedTotal = stackedTotal;
                    }
                }
                return maxStackedTotal;
            };

            const maxFromLeft = getStackedMax(leftChartId);
            const maxFromBlocked = getStackedMax(blockedChartId);

            sharedYMax = Math.max(maxFromLeft, maxFromBlocked) * 1.1;
            if (sharedYMax === 0) sharedYMax = null;
        }
    }

    let chartConfig;

    if (type === 'bar') {
        chartConfig = {
            type: 'bar',
            data: {
                labels: data.dates,
                datasets: data.barDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: true, title: { display: true, text: 'Date' } },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: { display: true, text: 'Time (Hours)' },
                        max: sharedYMax
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: legendColorCallback,
                            font: legendFontCallback
                        }
                    },
                    title: { display: true, text: (() => {
                        if (data.title === 'Time Left' || data.title === 'Total Estimate') {
                            const total = parseFloat(data.latest.values.reduce((a, b) => a + b, 0).toFixed(1));
                            const days = (total / 6.5).toFixed(1);
                            return `${data.title} (Trend) — ${total} hrs (${days} days)`;
                        }
                        return data.title + ' (Trend)';
                    })() },
                    tooltip: {
                        padding: 10,
                        callbacks: {
                            label: function (context) {
                                const assignee = context.dataset.label || '';
                                const value = context.parsed.y;
                                const days = (value / 6.5).toFixed(1);
                                return `${assignee}: ${value} hrs (${days} days)`;
                            },
                            footer: function (tooltipItems) {
                                const item = tooltipItems[0];
                                const tasks = item.dataset.tasks ? item.dataset.tasks[item.dataIndex] : [];
                                if (tasks && tasks.length > 0) {
                                    const formatted = ['Tasks:'];
                                    tasks.forEach(t => {
                                        const wrapped = wrapText(t, 60);
                                        formatted.push('\u2022 ' + wrapped[0]);
                                        for (let i = 1; i < wrapped.length; i++) {
                                            formatted.push(wrapped[i]);
                                        }
                                    });
                                    return formatted;
                                }
                                return '';
                            }
                        }
                    }
                }
            }
        };
    } else {
        chartConfig = {
            type: 'pie',
            data: {
                labels: data.latest.labels,
                datasets: [{
                    data: data.latest.values,
                    backgroundColor: data.latest.colors,
                    tasks: data.latest.tasks
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: legendColorCallback,
                            font: legendFontCallback
                        }
                    },
                    title: { display: true, text: `${data.title} (${data.latestDate})` },
                    tooltip: {
                        padding: 10,
                        callbacks: {
                            label: function (context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                                const days = (value / 6.5).toFixed(1);
                                return `${label}: ${value} hrs (${days} days) (${percentage})`;
                            },
                            footer: function (tooltipItems) {
                                const item = tooltipItems[0];
                                const tasks = item.dataset.tasks ? item.dataset.tasks[item.dataIndex] : [];
                                if (tasks && tasks.length > 0) {
                                    const formatted = ['Tasks:'];
                                    tasks.forEach(t => {
                                        const wrapped = wrapText(t, 60);
                                        formatted.push('\u2022 ' + wrapped[0]);
                                        for (let i = 1; i < wrapped.length; i++) {
                                            formatted.push(wrapped[i]);
                                        }
                                    });
                                    return formatted;
                                }
                                return '';
                            }
                        }
                    }
                }
            }
        };
    }

    chartInstances[canvasId] = new Chart(ctx, chartConfig);
}

/**
 * Create a chart section for an enhancement
 */
function createChartSection(container, title, index, groupedData, rawData, globalMaxDate) {
    const section = document.createElement('div');
    section.className = 'enhancement-section';

    const enhancementETA = getEnhancementETA(rawData, title, globalMaxDate);

    const enhancementTask = rawData.find(row =>
        row['Enhancement title'] === title &&
        row['Capture date'] === globalMaxDate &&
        row['Ticket ID']
    );
    const ticketId = enhancementTask ? enhancementTask['Ticket ID'] : null;
    const enhancementUrl = ticketId ? `https://link.orangelogic.com/Tasks/${ticketId}` : null;
    const importance = enhancementTask ? enhancementTask['Importance'] : '';

    const header = document.createElement('h2');

    const enhancementStatus = enhancementTask ? (enhancementTask['Enhancement Status'] || '').trim() : '';

    let importanceBadge = '';
    if (importance) {
        importanceBadge = `<span style="background: #e74c3c; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.7em; margin-right: 8px; font-weight: bold;">#${importance}</span>`;
    }

    let ticketBadge = '';
    if (ticketId) {
        ticketBadge = `<span style="background: #7f8c8d; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.7em; margin-right: 8px; font-weight: bold;">${ticketId}</span>`;
    }

    let statusBadge = '';
    if (enhancementStatus) {
        const statusLower = enhancementStatus.toLowerCase();
        let statusColor = '#7f8c8d';
        if (statusLower.includes('blocked') || statusLower.includes('on hold')) statusColor = '#e74c3c';
        else if (statusLower.includes('in development')) statusColor = '#2980b9';
        else if (statusLower.includes('in review')) statusColor = '#f39c12';
        else if (statusLower.includes('testing') || statusLower.includes('peer review')) statusColor = '#16a085';
        else if (statusLower === 'closed' || statusLower.includes('implemented')) statusColor = '#27ae60';
        else if (statusLower.includes('in vetting')) statusColor = '#8e44ad';
        else if (statusLower.includes('pending') || statusLower === 'to be vetted') statusColor = '#95a5a6';
        statusBadge = `<span style="background: ${statusColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.7em; margin-right: 8px; font-weight: bold;">${enhancementStatus}</span>`;
    }

    const meta = window.enhancementMeta || {};
    const hasBlockers = ticketId && meta[ticketId] && (meta[ticketId].blockers || '').trim().length > 0;

    let blockerWarning = hasBlockers
        ? `<span title="Has blockers" style="color: #e67e22; font-size: 0.85em; margin-right: 6px;">⚠️</span>`
        : '';

    let titleHtml = enhancementUrl
        ? `<a href="${enhancementUrl}" target="_blank" style="color: inherit; text-decoration: none;">${title}</a>`
        : title;

    if (enhancementETA) {
        header.innerHTML = `${importanceBadge}${ticketBadge}${statusBadge}${blockerWarning}${titleHtml} <span id="eta-span-${index}" style="color: #3498db; font-size: 0.8em; font-weight: normal;">(ETA ${enhancementETA})</span>`;
    } else {
        header.innerHTML = `${importanceBadge}${ticketBadge}${statusBadge}${blockerWarning}${titleHtml}`;
    }
    section.appendChild(header);
    const filterDiv = document.createElement('div');
    filterDiv.className = 'enhancement-filter';
    filterDiv.innerHTML = `
        <label>Filter: </label>
        <select id="filter-${index}" onchange="applyEnhancementFilter(${index}, this.value)">
            <option value="all">All Tasks</option>
            <option value="qa">QA Tasks</option>
            <option value="non-qa">Non-QA Tasks</option>
            <option value="non-qa-non-defect" selected>Non-QA Non-Defect Tasks</option>
        </select>
        <button class="gantt-btn" onclick="openGanttModal(${index})" title="View Gantt Chart">
            📊 Gantt Chart
        </button>
        <button class="tree-btn" onclick="openTreeModal(${index})" title="View Task Tree">
            🌳 Task Tree
        </button>
        ${ticketId ? `<button class="reload-btn" id="reload-btn-${ticketId}" onclick="reloadEnhancement('${ticketId}', this)" title="Reload data for this enhancement">
            🔄 Reload
        </button>
        <button class="blockers-btn${hasBlockers ? ' has-blockers' : ''}" id="blockers-btn-${index}" onclick="openBlockersModal('${ticketId}', ${index})" title="Edit blockers">
            🚧 Blockers
        </button>` : ''}
    `;
    section.appendChild(filterDiv);

    const chartsDiv = document.createElement('div');
    chartsDiv.className = 'charts-container';
    chartsDiv.id = `charts-container-${index}`;

    const dates = groupedData[title].dates;
    const latestDate = dates[dates.length - 1];
    const assignees = Object.keys(groupedData[title].assignees);

    // Helper: convert hex color to rgba
    const toRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Helper to build store data with filter support
    const buildStoreData = (metricKey, label, filterFn = null, blockedOnly = false, extraMetricKey = null) => {
        const barDatasets = [];

        assignees.forEach((assignee, i) => {
            const rawTasksArray = groupedData[title].assignees[assignee].tasks;
            const baseColor = colors[i % colors.length];

            // Check if assignee has any defect tasks (after outer filters)
            const hasDefects = rawTasksArray.some(dayTasks =>
                dayTasks.some(t => t.isDefect && (!filterFn || filterFn(t)) && (!blockedOnly || t.isBlocked))
            );

            const seriesConfigs = hasDefects
                ? [
                    { seriesLabel: `${assignee} - Dev`, defectOnly: false, color: baseColor },
                    { seriesLabel: `${assignee} - Defect`, defectOnly: true, color: toRgba(baseColor, 0.5) }
                  ]
                : [
                    { seriesLabel: assignee, defectOnly: false, color: baseColor }
                  ];

            seriesConfigs.forEach(({ seriesLabel, defectOnly, color }) => {
                const filteredValues = rawTasksArray.map(dayTasks => {
                    let filtered = dayTasks;
                    if (filterFn) filtered = filtered.filter(filterFn);
                    if (blockedOnly) filtered = filtered.filter(t => t.isBlocked);
                    filtered = filtered.filter(t => defectOnly ? t.isDefect : !t.isDefect);
                    const primary = filtered.reduce((sum, t) => sum + (t[metricKey] || 0), 0);
                    const extra = extraMetricKey ? filtered.reduce((sum, t) => sum + (t[extraMetricKey] || 0), 0) : 0;
                    return parseFloat(((primary + extra) / 60).toFixed(1));
                });

                const formattedTasksArray = rawTasksArray.map(dayTasks => {
                    let filtered = dayTasks;
                    if (filterFn) filtered = filtered.filter(filterFn);
                    if (blockedOnly) filtered = filtered.filter(t => t.isBlocked);
                    filtered = filtered.filter(t => defectOnly ? t.isDefect : !t.isDefect);
                    return filtered
                        .filter(t => (t[metricKey] || 0) + (extraMetricKey ? (t[extraMetricKey] || 0) : 0) > 0)
                        .sort((a, b) => ((b[metricKey] || 0) + (extraMetricKey ? (b[extraMetricKey] || 0) : 0)) - ((a[metricKey] || 0) + (extraMetricKey ? (a[extraMetricKey] || 0) : 0)))
                        .map(t => `[${(((t[metricKey] || 0) + (extraMetricKey ? (t[extraMetricKey] || 0) : 0)) / 60).toFixed(1)} hrs] ${t.title}`);
                });

                barDatasets.push({
                    label: seriesLabel,
                    data: filteredValues,
                    tasks: formattedTasksArray,
                    backgroundColor: color
                });
            });
        });

        const latestValues = [];
        const latestLabels = [];
        const latestColors = [];
        const latestTasks = [];

        barDatasets.forEach(dataset => {
            const val = dataset.data[dates.length - 1];
            if (val > 0) {
                latestLabels.push(dataset.label);
                latestValues.push(parseFloat(val.toFixed(1)));
                latestColors.push(dataset.backgroundColor);
                latestTasks.push(dataset.tasks[dates.length - 1]);
            }
        });

        return {
            title: label,
            enhancementTitle: title,
            dates: dates,
            latestDate: latestDate,
            barDatasets: barDatasets,
            latest: {
                labels: latestLabels,
                values: latestValues,
                colors: latestColors,
                tasks: latestTasks
            }
        };
    };

    // Store enhancement info for filter updates
    if (!window.enhancementInfo) window.enhancementInfo = {};
    window.enhancementInfo[index] = {
        title: title,
        groupedData: groupedData,
        dates: dates,
        latestDate: latestDate,
        assignees: assignees,
        buildStoreData: buildStoreData
    };

    // Create 4 charts: Spent, Left, Blocked (hidden), Estimate
    const chartConfigs = [
        { metric: 'Spent', key: 'spent', metricKey: 'spent', blockedOnly: false, hidden: false },
        { metric: 'Left', key: 'left', metricKey: 'left', blockedOnly: false, hidden: false },
        { metric: 'Blocked', key: 'left', metricKey: 'left', blockedOnly: true, hidden: true },
        { metric: 'Estimate', key: 'estimate', metricKey: 'spent', extraMetricKey: 'left', blockedOnly: false, hidden: false, chartLabel: 'Total Estimate' }
    ];

    chartConfigs.forEach(config => {
        const canvasId = `chart-${config.key}${config.blockedOnly ? '-blocked' : ''}-${index}`;

        const wrapper = document.createElement('div');
        wrapper.className = 'chart-wrapper';
        if (config.hidden) wrapper.style.display = 'none';

        const controls = document.createElement('div');
        controls.className = 'chart-controls';
        controls.innerHTML = `
            <button class="chart-btn btn-bar" onclick="renderChart('${canvasId}', 'bar')">Trend</button>
            <button class="chart-btn btn-pie" onclick="renderChart('${canvasId}', 'pie')">Latest (${latestDate})</button>
        `;
        wrapper.appendChild(controls);

        const holder = document.createElement('div');
        holder.className = 'canvas-holder';
        const canvas = document.createElement('canvas');
        canvas.id = canvasId;
        holder.appendChild(canvas);
        wrapper.appendChild(holder);

        chartsDiv.appendChild(wrapper);

        const chartLabel = config.chartLabel || (config.blockedOnly ? 'Time Left (Blocked)' : `Time ${config.metric}`);
        const defaultFilterFn = t => !t.isQA && !t.isDefect;
        chartStore[canvasId] = buildStoreData(config.metricKey, chartLabel, defaultFilterFn, config.blockedOnly, config.extraMetricKey || null);
    });

    section.appendChild(chartsDiv);

    container.appendChild(section);

    // Initial Render
    renderChart(`chart-spent-${index}`, 'bar');
    renderChart(`chart-left-${index}`, 'bar');
    renderChart(`chart-left-blocked-${index}`, 'bar');
    renderChart(`chart-estimate-${index}`, 'bar');
}

/**
 * Apply enhancement filter and re-render charts
 */
function applyEnhancementFilter(index, filterValue) {
    const info = window.enhancementInfo[index];
    if (!info) return;

    let filterFn = null;
    if (filterValue === 'qa') {
        filterFn = t => t.isQA;
    } else if (filterValue === 'non-qa') {
        filterFn = t => !t.isQA;
    } else if (filterValue === 'non-qa-non-defect') {
        filterFn = t => !t.isQA && !t.isDefect;
    }

    const chartConfigs = [
        { metric: 'Spent', key: 'spent', metricKey: 'spent', blockedOnly: false },
        { metric: 'Left', key: 'left', metricKey: 'left', blockedOnly: false },
        { metric: 'Blocked', key: 'left', metricKey: 'left', blockedOnly: true },
        { metric: 'Estimate', key: 'estimate', metricKey: 'spent', extraMetricKey: 'left', blockedOnly: false, chartLabel: 'Total Estimate' }
    ];

    chartConfigs.forEach(config => {
        const canvasId = `chart-${config.key}${config.blockedOnly ? '-blocked' : ''}-${index}`;
        const chartLabel = config.chartLabel || (config.blockedOnly ? 'Time Left (Blocked)' : `Time ${config.metric}`);
        chartStore[canvasId] = info.buildStoreData(config.metricKey, chartLabel, filterFn, config.blockedOnly, config.extraMetricKey || null);

        const chart = chartInstances[canvasId];
        const viewType = chart ? chart.config.type : 'bar';
        renderChart(canvasId, viewType);
    });

    // Hide ETA when filter is Non-QA (ETA comes from Development/QA tasks)
    const etaSpan = document.getElementById(`eta-span-${index}`);
    if (etaSpan) {
        etaSpan.style.display = (filterValue === 'non-qa' || filterValue === 'non-qa-non-defect') ? 'none' : '';
    }
}

/**
 * Create global time left chart grouped by team
 */
function createGlobalTimeLeftChart(groupedData, globalMaxDate, rawData) {
    document.getElementById('global-date-display').textContent = globalMaxDate;

    // Build assignee -> team map
    const assigneeTeamMap = {};
    rawData.forEach(row => {
        if (row['Capture date'] === globalMaxDate) {
            const assignee = row['Assignee'] || '(unassigned)';
            const team = row['Main Dev Team'] || '(No Team)';
            assigneeTeamMap[assignee] = team;
        }
    });

    // Aggregate time left per assignee
    const globalAgg = {};
    Object.keys(groupedData).forEach(title => {
        const dates = groupedData[title].dates;
        const dateIndex = dates.indexOf(globalMaxDate);

        if (dateIndex !== -1) {
            const assignees = groupedData[title].assignees;
            Object.keys(assignees).forEach(assignee => {
                const timeLeft = assignees[assignee].left[dateIndex];
                if (timeLeft > 0) {
                    if (!globalAgg[assignee]) {
                        globalAgg[assignee] = 0;
                    }
                    globalAgg[assignee] += timeLeft;
                }
            });
        }
    });

    // Group by team
    const teamData = {};
    Object.keys(globalAgg).forEach(assignee => {
        const team = assigneeTeamMap[assignee] || '(No Team)';
        if (!teamData[team]) {
            teamData[team] = { labels: [], values: [] };
        }
        teamData[team].labels.push(assignee);
        teamData[team].values.push(globalAgg[assignee]);
    });

    // Create pie chart for each team
    const container = document.getElementById('team-charts-container');
    container.innerHTML = '';

    const teamNames = Object.keys(teamData).sort();
    teamNames.forEach((teamName, idx) => {
        const data = teamData[teamName];
        const totalHours = data.values.reduce((a, b) => a + b, 0);

        const wrapper = document.createElement('div');
        wrapper.className = 'chart-wrapper';

        const holder = document.createElement('div');
        holder.className = 'canvas-holder';
        const canvas = document.createElement('canvas');
        canvas.id = `team-chart-${idx}`;
        holder.appendChild(canvas);
        wrapper.appendChild(holder);
        container.appendChild(wrapper);

        const chartColors = data.labels.map((_, i) => colors[i % colors.length]);
        new Chart(canvas.getContext('2d'), {
            type: 'pie',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: chartColors
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' },
                    title: {
                        display: true,
                        text: `${teamName} (${totalHours.toFixed(1)} hrs / ${(totalHours / 6.5).toFixed(1)} days)`
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                                const days = (value / 6.5).toFixed(1);
                                return `${label}: ${value.toFixed(1)} hrs (${days} days) (${percentage})`;
                            }
                        }
                    }
                }
            }
        });
    });
}

/**
 * Create No ETA section showing tasks without ETAs
 */
function createNoETASection(rawData, globalMaxDate) {
    document.getElementById('no-eta-date-display').textContent = globalMaxDate;

    const allowedTypes = ['development', 'defect - qa vietnam', 'qa'];
    const excludedStatuses = ['obsolete', 'implemented on dev', 'closed', 'duplicate', 'needs peer review', 'blocked by customer'];

    // Build identifier → status map for latest date
    const taskStatusMap = {};
    rawData.forEach(row => {
        if (row['Capture date'] === globalMaxDate && row['Task Identifier']) {
            taskStatusMap[row['Task Identifier']] = (row['Status'] || '').trim().toLowerCase();
        }
    });

    const noETATasks = rawData.filter(row => {
        const type = (row['Type'] || '').trim().toLowerCase();
        const status = (row['Status'] || '').trim().toLowerCase();
        const parentStatus = taskStatusMap[row['Parent Folder']] || '';

        return row['Capture date'] === globalMaxDate &&
            (!row['ETA'] || row['ETA'].trim() === '') &&
            allowedTypes.includes(type) &&
            !excludedStatuses.includes(status) &&
            parentStatus !== 'obsolete';
    });

    const groupedByEnhancement = {};
    noETATasks.forEach(row => {
        const enhancement = row['Enhancement title'] || 'Unknown';
        if (!groupedByEnhancement[enhancement]) {
            groupedByEnhancement[enhancement] = [];
        }
        groupedByEnhancement[enhancement].push({
            title: row['Task title'] || 'Untitled',
            assignee: row['Assignee'] || '(unassigned)',
            link: row['Cortex Link'] || ''
        });
    });

    const container = document.getElementById('no-eta-container');
    container.innerHTML = '';

    const enhancements = Object.keys(groupedByEnhancement).sort();

    if (enhancements.length === 0) {
        container.innerHTML = '<p style="color: #27ae60;">✅ All tasks have an ETA assigned!</p>';
        return;
    }

    enhancements.forEach(enhancement => {
        const tasks = groupedByEnhancement[enhancement];

        const group = document.createElement('div');
        group.className = 'no-eta-group';

        const header = document.createElement('div');
        header.className = 'no-eta-group-header';
        header.innerHTML = `
            <span>${enhancement}</span>
            <span class="count">${tasks.length}</span>
        `;
        group.appendChild(header);

        const taskList = document.createElement('div');
        taskList.className = 'no-eta-task-list';

        tasks.forEach(task => {
            const taskDiv = document.createElement('div');
            taskDiv.className = 'no-eta-task';

            const titleSpan = document.createElement('span');
            if (task.link) {
                titleSpan.innerHTML = `<a href="${task.link}" target="_blank">${task.title}</a>`;
            } else {
                titleSpan.textContent = task.title;
            }

            const assigneeSpan = document.createElement('span');
            assigneeSpan.className = 'assignee';
            assigneeSpan.textContent = task.assignee;

            taskDiv.appendChild(titleSpan);
            taskDiv.appendChild(assigneeSpan);
            taskList.appendChild(taskDiv);
        });

        group.appendChild(taskList);
        container.appendChild(group);
    });
}


