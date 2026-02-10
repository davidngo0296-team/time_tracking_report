/**
 * Chart Utilities for Time Tracking Report
 * Handles chart rendering, data processing, and visualization
 */

// Global stores
const chartStore = {};
const chartInstances = {};
let currentRiskyAssignees = new Set();

// Distinct colors for series
const colors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4'
];

/**
 * Parse CSV text into array of objects
 */
function parseCSV(csv) {
    // Remove BOM if present
    if (csv.charCodeAt(0) === 0xFEFF) {
        csv = csv.slice(1);
    }

    const lines = csv.trim().split('\n');
    // Regex to match CSV columns (handles quotes)
    const splitRegex = /,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/;

    const headers = lines[0].split(',').map(h => {
        return h.trim().replace(/^"|"$/g, '');
    });

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(splitRegex);

        const entry = {};
        headers.forEach((h, index) => {
            let val = values[index] ? values[index].trim() : '';
            if (val.startsWith('"') && val.endsWith('"')) {
                val = val.slice(1, -1);
            }
            entry[h] = val;
        });
        data.push(entry);
    }
    return data;
}

/**
 * Process raw data into time series grouped by enhancement and assignee
 */
function processDataForTimeSeries(data) {
    const enhancements = {};

    // Filter Logic:
    // If the dataset contains ANY IDs, we enforce filtering by currentTicketIds.
    const datasetHasIds = data.some(r => r['Ticket ID'] && r['Ticket ID'].trim() !== '');
    const allowedTitles = new Set();

    if (datasetHasIds) {
        data.forEach(row => {
            const tid = row['Ticket ID'];
            if (tid && currentTicketIds.includes(tid)) {
                allowedTitles.add(row['Enhancement title']);
            }
        });
    }

    data.forEach(row => {
        const title = row['Enhancement title'];

        // Enforce Filter if we have IDs in the system
        if (datasetHasIds && !allowedTitles.has(title)) {
            return;
        }

        const date = row['Capture date'];
        const assignee = row['Assignee'] || '(unassigned)';
        const spent = parseFloat(row['Time spent']) || 0;
        const left = parseFloat(row['Time left']) || 0;
        const taskTitle = row['Task title'];
        const taskType = (row['Type'] || '').toLowerCase();
        const taskStatus = (row['Status'] || '').toLowerCase();
        const isQA = taskType.includes('qa');
        const isBlocked = taskStatus.includes('blocked');

        if (!enhancements[title]) {
            enhancements[title] = { dates: new Set(), assignees: {} };
        }

        enhancements[title].dates.add(date);

        if (!enhancements[title].assignees[assignee]) {
            enhancements[title].assignees[assignee] = {};
        }

        if (!enhancements[title].assignees[assignee][date]) {
            enhancements[title].assignees[assignee][date] = { spent: 0, left: 0, tasks: [] };
        }

        enhancements[title].assignees[assignee][date].spent += spent;
        enhancements[title].assignees[assignee][date].left += left;
        enhancements[title].assignees[assignee][date].tasks.push({
            title: taskTitle,
            spent: spent,
            left: left,
            isQA: isQA,
            isBlocked: isBlocked
        });
    });

    // Flatten data
    Object.keys(enhancements).forEach(title => {
        const dates = Array.from(enhancements[title].dates).sort();
        enhancements[title].dates = dates;

        Object.keys(enhancements[title].assignees).forEach(assignee => {
            const assigneeData = enhancements[title].assignees[assignee];
            const spentArray = [];
            const leftArray = [];
            const tasksArray = [];

            dates.forEach(d => {
                const val = assigneeData[d] || { spent: 0, left: 0, tasks: [] };
                spentArray.push(parseFloat((val.spent / 60).toFixed(2)));
                leftArray.push(parseFloat((val.left / 60).toFixed(2)));
                tasksArray.push(val.tasks);
            });

            enhancements[title].assignees[assignee] = {
                spent: spentArray,
                left: leftArray,
                tasks: tasksArray
            };
        });
    });

    return enhancements;
}

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
            header.textContent = `${assignee} (Total: ${riskData.total.toFixed(2)} hrs)`;
            itemDiv.appendChild(header);

            const ul = document.createElement('ul');
            riskData.details.forEach(detail => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${detail.enhancement}</strong>: <span class="risk-time">${detail.time.toFixed(2)} hrs</span>`;
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
                    title: { display: true, text: data.title + ' (Trend)' },
                    tooltip: {
                        padding: 10,
                        callbacks: {
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
                                return `${label}: ${value} hrs (${percentage})`;
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
 * Get ETA for an enhancement based on Development/QA task status
 */
function getEnhancementETA(rawData, enhancementTitle, globalMaxDate) {
    const enhancementTasks = rawData.filter(row =>
        row['Enhancement title'] === enhancementTitle &&
        row['Capture date'] === globalMaxDate
    );

    if (enhancementTasks.length === 0) return null;

    const completedStatuses = ['implemented on dev', 'closed'];

    const devTask = enhancementTasks.find(t =>
        t['Task title'] && t['Task title'].toLowerCase() === 'development'
    );

    if (devTask) {
        const devStatus = (devTask['Status'] || '').toLowerCase();
        if (!completedStatuses.includes(devStatus) && devTask['ETA'] && devTask['ETA'].trim()) {
            return formatETA(devTask['ETA']);
        }
    }

    return null;
}

/**
 * Format ETA date to a cleaner format
 */
function formatETA(etaString) {
    const cleaned = etaString.replace(/^0/, '').trim();
    return cleaned;
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

    let importanceBadge = '';
    if (importance) {
        importanceBadge = `<span style="background: #e74c3c; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.7em; margin-right: 8px; font-weight: bold;">#${importance}</span>`;
    }

    let titleHtml = enhancementUrl
        ? `<a href="${enhancementUrl}" target="_blank" style="color: inherit; text-decoration: none;">${title}</a>`
        : title;

    if (enhancementETA) {
        header.innerHTML = `${importanceBadge}${titleHtml} <span style="color: #3498db; font-size: 0.8em; font-weight: normal;">(ETA ${enhancementETA})</span>`;
    } else {
        header.innerHTML = `${importanceBadge}${titleHtml}`;
    }
    section.appendChild(header);

    // Task type filter and Gantt button
    const filterDiv = document.createElement('div');
    filterDiv.className = 'enhancement-filter';
    filterDiv.innerHTML = `
        <label>Filter: </label>
        <select id="filter-${index}" onchange="applyEnhancementFilter(${index}, this.value)">
            <option value="all">All Tasks</option>
            <option value="qa">QA Tasks</option>
            <option value="non-qa" selected>Non-QA Tasks</option>
        </select>
        <button class="gantt-btn" onclick="openGanttModal(${index})" title="View Gantt Chart">
            📊 Gantt Chart
        </button>
        ${ticketId ? `<button class="reload-btn" onclick="reloadEnhancement('${ticketId}', this)" title="Reload data for this enhancement">
            🔄 Reload
        </button>` : ''}
    `;
    section.appendChild(filterDiv);

    const chartsDiv = document.createElement('div');
    chartsDiv.className = 'charts-container';
    chartsDiv.id = `charts-container-${index}`;

    const dates = groupedData[title].dates;
    const latestDate = dates[dates.length - 1];
    const assignees = Object.keys(groupedData[title].assignees);

    // Helper to build store data with filter support
    const buildStoreData = (metricKey, label, filterFn = null, blockedOnly = false) => {
        const barDatasets = assignees.map((assignee, i) => {
            const rawTasksArray = groupedData[title].assignees[assignee].tasks;

            const filteredValues = rawTasksArray.map(dayTasks => {
                let filtered = dayTasks;
                if (filterFn) {
                    filtered = filtered.filter(filterFn);
                }
                if (blockedOnly) {
                    filtered = filtered.filter(t => t.isBlocked);
                }
                return filtered.reduce((sum, t) => sum + (t[metricKey] || 0), 0) / 60;
            });

            const formattedTasksArray = rawTasksArray.map(dayTasks => {
                let filtered = dayTasks;
                if (filterFn) {
                    filtered = filtered.filter(filterFn);
                }
                if (blockedOnly) {
                    filtered = filtered.filter(t => t.isBlocked);
                }
                return filtered
                    .filter(t => t[metricKey] > 0)
                    .sort((a, b) => b[metricKey] - a[metricKey])
                    .map(t => `[${(t[metricKey] / 60).toFixed(2)} hrs] ${t.title}`);
            });

            return {
                label: assignee,
                data: filteredValues,
                tasks: formattedTasksArray,
                backgroundColor: colors[i % colors.length]
            };
        });

        const latestValues = [];
        const latestLabels = [];
        const latestColors = [];
        const latestTasks = [];

        assignees.forEach((assignee, i) => {
            const val = barDatasets[i].data[dates.length - 1];
            if (val > 0) {
                latestLabels.push(assignee);
                latestValues.push(parseFloat(val.toFixed(2)));
                latestColors.push(colors[i % colors.length]);
                latestTasks.push(barDatasets[i].tasks[dates.length - 1]);
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

    // Create 3 charts: Spent, Left, Blocked
    const chartConfigs = [
        { metric: 'Spent', key: 'spent', blockedOnly: false },
        { metric: 'Left', key: 'left', blockedOnly: false },
        { metric: 'Blocked', key: 'left', blockedOnly: true }
    ];

    chartConfigs.forEach(config => {
        const canvasId = `chart-${config.key}${config.blockedOnly ? '-blocked' : ''}-${index}`;

        const wrapper = document.createElement('div');
        wrapper.className = 'chart-wrapper';

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

        const chartLabel = config.blockedOnly ? 'Time Left (Blocked)' : `Time ${config.metric}`;
        chartStore[canvasId] = buildStoreData(config.key, chartLabel, t => !t.isQA, config.blockedOnly);
    });

    section.appendChild(chartsDiv);
    container.appendChild(section);

    // Initial Render
    renderChart(`chart-spent-${index}`, 'bar');
    renderChart(`chart-left-${index}`, 'bar');
    renderChart(`chart-left-blocked-${index}`, 'bar');
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
    }

    const chartConfigs = [
        { metric: 'Spent', key: 'spent', blockedOnly: false },
        { metric: 'Left', key: 'left', blockedOnly: false },
        { metric: 'Blocked', key: 'left', blockedOnly: true }
    ];

    chartConfigs.forEach(config => {
        const canvasId = `chart-${config.key}${config.blockedOnly ? '-blocked' : ''}-${index}`;
        const chartLabel = config.blockedOnly ? 'Time Left (Blocked)' : `Time ${config.metric}`;
        chartStore[canvasId] = info.buildStoreData(config.key, chartLabel, filterFn, config.blockedOnly);

        const chart = chartInstances[canvasId];
        const viewType = chart ? chart.config.type : 'bar';
        renderChart(canvasId, viewType);
    });
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
                        text: `${teamName} (${totalHours.toFixed(1)} hrs / ${(totalHours / 8).toFixed(1)} days)`
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                                const days = (value / 8).toFixed(2);
                                return `${label}: ${value.toFixed(2)} hrs / ${days} days (${percentage})`;
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

    const allowedTypes = ['development', 'defect - qa vietnam'];
    const excludedStatuses = ['obsolete', 'implemented on dev', 'closed', 'duplicate'];

    const noETATasks = rawData.filter(row => {
        const type = (row['Type'] || '').trim().toLowerCase();
        const status = (row['Status'] || '').trim().toLowerCase();

        return row['Capture date'] === globalMaxDate &&
            (!row['ETA'] || row['ETA'].trim() === '') &&
            allowedTypes.includes(type) &&
            !excludedStatuses.includes(status);
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

// ===========================================
// GANTT CHART FUNCTIONALITY
// ===========================================

// Store for Gantt data per enhancement
const ganttDataStore = {};
let ganttChartInstance = null;

/**
 * Build Gantt data for a specific enhancement
 */
function buildGanttData(rawData, enhancementTitle, globalMaxDate) {
    // Filter tasks for this enhancement on the latest date
    const tasks = rawData.filter(row =>
        row['Enhancement title'] === enhancementTitle &&
        row['Capture date'] === globalMaxDate
    );

    // Build set of identifiers that are parents (have at least 1 child)
    const parentIds = new Set();
    tasks.forEach(row => {
        const pf = (row['Parent Folder'] || '').trim();
        if (pf) parentIds.add(pf);
    });

    // Build task map by identifier for dependency resolution
    const taskMap = {};
    const ganttTasks = [];

    // First pass: collect all tasks
    tasks.forEach(row => {
        const taskId = row['Task Identifier'] || row['Task title'];

        const timeSpentMinutes = parseFloat(row['Time spent']) || 0;
        const timeSpentHours = timeSpentMinutes / 60;
        const timeLeftMinutes = parseFloat(row['Time left']) || 0;
        const timeLeftHours = timeLeftMinutes / 60;
        const etaRaw = row['ETA'] || '';
        const dependencies = (row['Dependencies'] || '').split(';').filter(d => d.trim());
        const status = (row['Status'] || '').toLowerCase();
        const type = row['Type'] || '';
        const estimatedStartRaw = row['Estimated Start Date'] || '';
        const estimatedEndRaw = row['Estimated End Date'] || '';

        // Skip closed/obsolete tasks, or tasks with no time left unless awaiting peer review
        const skipStatuses = ['obsolete', 'duplicate', 'closed', 'implemented on dev'];
        const keepStatuses = ['needs peer review'];
        if (skipStatuses.includes(status) || (timeLeftHours <= 0 && !keepStatuses.includes(status))) {
            return;
        }



        const task = {
            id: taskId,
            title: row['Task title'],
            assignee: row['Assignee'] || '(unassigned)',
            timeSpent: timeSpentHours,
            timeLeft: timeLeftHours,
            eta: etaRaw ? parseETADate(etaRaw) : null,
            estimatedStart: estimatedStartRaw ? parseETADate(estimatedStartRaw) : null,
            estimatedEnd: estimatedEndRaw ? parseETADate(estimatedEndRaw) : null,
            dependencies: dependencies,
            status: status,
            type: type,
            link: row['Cortex Link'] || '',
            isBlocked: status.includes('blocked'),
            isContainer: timeLeftMinutes === 10 && parentIds.has(taskId)
        };

        taskMap[taskId] = task;
        ganttTasks.push(task);
    });

    // Calculate scheduling based on dependencies and time left
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Separate tasks with ETA from tasks without
    // A task needs a real end date to appear on the calendar (estimatedEnd or eta as fallback)
    const etaTasks = [];
    const noEtaTasks = [];
    ganttTasks.forEach(task => {
        const hasEndDate = task.estimatedEnd || task.eta;
        if (hasEndDate) {
            etaTasks.push(task);
        } else {
            noEtaTasks.push(task);
        }
    });

    // Group ETA tasks by assignee
    const assigneeGroups = {};
    etaTasks.forEach(task => {
        if (!assigneeGroups[task.assignee]) {
            assigneeGroups[task.assignee] = [];
        }
        assigneeGroups[task.assignee].push(task);
    });

    // Schedule tasks for each assignee
    Object.keys(assigneeGroups).forEach(assignee => {
        const assigneeTasks = assigneeGroups[assignee];

        // Calculate dates first
        assigneeTasks.forEach(task => {
            if (task.estimatedStart && task.estimatedEnd) {
                task.startDate = new Date(task.estimatedStart);
                task.endDate = new Date(task.estimatedEnd);
            } else if (task.estimatedStart) {
                task.startDate = new Date(task.estimatedStart);
                if (task.eta) {
                    task.endDate = new Date(task.eta);
                } else {
                    const daysNeeded = Math.max(1, Math.ceil(task.timeLeft / 8));
                    task.endDate = new Date(task.startDate);
                    task.endDate.setDate(task.endDate.getDate() + daysNeeded);
                }
            } else if (task.estimatedEnd) {
                task.endDate = new Date(task.estimatedEnd);
                const daysNeeded = Math.max(1, Math.ceil(task.timeLeft / 8));
                task.startDate = new Date(task.endDate);
                task.startDate.setDate(task.startDate.getDate() - daysNeeded);
            }
        });

        // Sort by soonest end date on top
        assigneeTasks.sort((a, b) => {
            if (a.endDate && b.endDate) return a.endDate - b.endDate;
            if (a.endDate) return -1;
            if (b.endDate) return 1;
            return 0;
        });
    });

    return {
        title: enhancementTitle,
        tasks: etaTasks,
        noEtaTasks: noEtaTasks,
        assignees: Object.keys(assigneeGroups).sort(),
        minDate: today,
        maxDate: calculateMaxDate(etaTasks)
    };
}

/**
 * Parse ETA string to Date object
 */
function parseETADate(etaString) {
    if (!etaString) return null;
    // Handle various date formats
    const cleaned = etaString.trim();
    const date = new Date(cleaned);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Calculate the maximum end date from all tasks
 */
function calculateMaxDate(tasks) {
    let max = new Date();
    tasks.forEach(task => {
        if (task.endDate && task.endDate > max) {
            max = new Date(task.endDate);
        }
    });
    // Add some padding
    max.setDate(max.getDate() + 3);
    return max;
}

/**
 * Open Gantt chart modal for an enhancement
 */
function openGanttModal(index) {
    const info = window.enhancementInfo[index];
    if (!info) return;

    const modal = document.getElementById('gantt-modal');
    const titleEl = document.getElementById('gantt-modal-title');
    const container = document.getElementById('gantt-chart-container');

    titleEl.textContent = `Gantt Chart: ${info.title}`;
    modal.classList.add('show');

    // Get raw data from global storage
    const rawData = window.rawParsedData || [];
    const globalMaxDate = window.globalMaxDate || '';

    // Build Gantt data
    const ganttData = buildGanttData(rawData, info.title, globalMaxDate);
    ganttDataStore[index] = ganttData;

    // Render Gantt chart
    renderGanttChart(container, ganttData);
}

/**
 * Close Gantt chart modal
 */
function closeGanttModal() {
    document.getElementById('gantt-modal').classList.remove('show');
    if (ganttChartInstance) {
        ganttChartInstance = null;
    }
}

/**
 * Render the Gantt chart using HTML/CSS (no external library needed)
 */
function renderGanttChart(container, ganttData) {
    container.innerHTML = '';

    const { tasks, noEtaTasks = [], assignees, minDate, maxDate } = ganttData;

    if (tasks.length === 0 && noEtaTasks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 40px;">No active tasks with time remaining.</p>';
        return;
    }

    if (tasks.length === 0) {
        // Skip calendar rendering if no ETA tasks, jump to No ETA section below
    } else {

    // Calculate date range
    const dayCount = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;
    const dayWidth = Math.max(80, Math.min(120, 1200 / dayCount)); // Wider columns for better readability

    // Create header with dates
    const headerRow = document.createElement('div');
    headerRow.className = 'gantt-header';
    headerRow.innerHTML = '<div class="gantt-assignee-label">Assignee</div>';

    const datesContainer = document.createElement('div');
    datesContainer.className = 'gantt-dates';
    datesContainer.style.width = `${dayCount * dayWidth}px`;

    for (let i = 0; i < dayCount; i++) {
        const date = new Date(minDate);
        date.setDate(date.getDate() + i);
        const dateLabel = document.createElement('div');
        dateLabel.className = 'gantt-date-label';
        dateLabel.style.width = `${dayWidth}px`;
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        if (isWeekend) dateLabel.classList.add('weekend');
        dateLabel.textContent = `${date.getMonth() + 1}/${date.getDate()}`;
        datesContainer.appendChild(dateLabel);
    }
    headerRow.appendChild(datesContainer);
    container.appendChild(headerRow);

    // Create rows for each assignee
    assignees.forEach((assignee, rowIndex) => {
        const row = document.createElement('div');
        row.className = 'gantt-row';
        if (rowIndex % 2 === 1) row.classList.add('alt');

        const label = document.createElement('div');
        label.className = 'gantt-assignee-label';
        label.textContent = assignee;
        row.appendChild(label);

        const barsContainer = document.createElement('div');
        barsContainer.className = 'gantt-bars';
        barsContainer.style.width = `${dayCount * dayWidth}px`;

        // Add grid lines
        for (let i = 0; i < dayCount; i++) {
            const date = new Date(minDate);
            date.setDate(date.getDate() + i);
            const gridLine = document.createElement('div');
            gridLine.className = 'gantt-grid-line';
            gridLine.style.left = `${i * dayWidth}px`;
            gridLine.style.width = `${dayWidth}px`;
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            if (isWeekend) gridLine.classList.add('weekend');
            barsContainer.appendChild(gridLine);
        }

        // Add task bars for this assignee, sorted by soonest end date first
        const assigneeTasks = tasks.filter(t => t.assignee === assignee).sort((a, b) => {
            if (a.endDate && b.endDate) return a.endDate - b.endDate;
            if (a.endDate) return -1;
            if (b.endDate) return 1;
            return 0;
        });
        let renderedTaskCount = 0; // Track actual rendered tasks

        // Create a bars layer for the absolute positioned task bars
        const barsLayer = document.createElement('div');
        barsLayer.className = 'gantt-bars-layer';
        barsLayer.style.width = `${dayCount * dayWidth}px`;

        assigneeTasks.forEach((task) => {
            if (!task.startDate || !task.endDate) return;

            const startOffset = Math.floor((task.startDate - minDate) / (1000 * 60 * 60 * 24));
            const duration = Math.ceil((task.endDate - task.startDate) / (1000 * 60 * 60 * 24)) + 1;

            // Create a bar slot (one row of the stacked bars)
            const barSlot = document.createElement('div');
            barSlot.className = 'gantt-bar-slot';

            const bar = document.createElement('div');
            bar.className = 'gantt-bar';
            bar.style.left = `${startOffset * dayWidth}px`;
            bar.style.width = `${Math.max(duration, 1) * dayWidth - 4}px`;

            // Status-based coloring
            const status = task.status.toLowerCase();
            if (status.includes('blocked')) {
                bar.style.backgroundColor = '#ffcdd2'; // Light red for blocked
                bar.classList.add('blocked');
            } else if (status.includes('peer review') || status === 'needs peer review') {
                bar.style.backgroundColor = '#fff9c4'; // Light yellow for peer review
                bar.classList.add('peer-review');
            } else if (status.includes('in progress') || status === 'in progress') {
                bar.style.backgroundColor = '#bbdefb'; // Light blue for in progress
                bar.classList.add('in-progress');
            } else {
                // Light grey for other statuses
                bar.style.backgroundColor = '#e0e0e0';
            }

            // Tooltip content
            bar.title = `${task.title}\n` +
                `Time Spent: ${task.timeSpent.toFixed(1)} hrs\n` +
                `Time Left: ${task.timeLeft.toFixed(1)} hrs\n` +
                `Estimated start date: ${formatDateShort(task.startDate)}\n` +
                `Estimated completion date: ${formatDateShort(task.endDate)}` +
                (task.dependencies.length ? `\nPrerequisites: ${task.dependencies.join(', ')}` : '');

            // Task label
            const taskLabel = document.createElement('span');
            taskLabel.className = 'gantt-bar-label';
            taskLabel.textContent = (task.isContainer ? '\uD83D\uDCC1 ' : '') + truncateText(task.title, 35);
            bar.appendChild(taskLabel);

            // Click to open task link
            if (task.link) {
                bar.style.cursor = 'pointer';
                bar.onclick = () => window.open(task.link, '_blank');
            }

            barSlot.appendChild(bar);
            barsLayer.appendChild(barSlot);
            renderedTaskCount++; // Increment only when bar is actually rendered
        });

        // Add grid lines to barsContainer
        barsContainer.appendChild(barsLayer);

        // Adjust row height based on number of actually rendered tasks
        const rowHeight = Math.max(40, renderedTaskCount * 28 + 8);
        barsContainer.style.minHeight = `${rowHeight}px`;

        row.appendChild(barsContainer);
        container.appendChild(row);
    });

    // Add legend
    const legend = document.createElement('div');
    legend.className = 'gantt-legend';
    legend.innerHTML = `
        <div class="legend-item">
            <span class="legend-color" style="background: #bbdefb;"></span>
            <span>In Progress</span>
        </div>
        <div class="legend-item">
            <span class="legend-color" style="background: #ffcdd2;"></span>
            <span>Blocked</span>
        </div>
        <div class="legend-item">
            <span class="legend-color" style="background: #fff9c4;"></span>
            <span>Needs Peer Review</span>
        </div>
        <div class="legend-item">
            <span class="legend-color" style="background: #e0e0e0;"></span>
            <span>Other Status</span>
        </div>
        <div class="legend-item">
            <span class="legend-color weekend" style="background: #f0f0f0;"></span>
            <span>Weekend</span>
        </div>
    `;
    container.appendChild(legend);

    } // end if (tasks.length > 0)

    // Render "No ETA tasks" section
    if (noEtaTasks.length > 0) {
        const section = document.createElement('div');
        section.className = 'no-eta-section';

        const heading = document.createElement('div');
        heading.className = 'no-eta-heading';
        heading.textContent = `No ETA Tasks (${noEtaTasks.length})`;
        section.appendChild(heading);

        const table = document.createElement('table');
        table.className = 'no-eta-table';
        table.innerHTML = `<thead><tr>
            <th>Task</th><th>Assignee</th><th>Time Left</th><th>Status</th>
        </tr></thead>`;

        const tbody = document.createElement('tbody');
        noEtaTasks.forEach(task => {
            const tr = document.createElement('tr');
            const statusClass = task.isBlocked ? 'blocked' :
                task.status.includes('peer review') ? 'peer-review' :
                task.status.includes('in progress') ? 'in-progress' : '';

            const titleCell = document.createElement('td');
            const displayTitle = (task.isContainer ? '\uD83D\uDCC1 ' : '') + task.title;
            if (task.link) {
                const a = document.createElement('a');
                a.href = task.link;
                a.target = '_blank';
                a.textContent = displayTitle;
                titleCell.appendChild(a);
            } else {
                titleCell.textContent = displayTitle;
            }

            const assigneeCell = document.createElement('td');
            assigneeCell.textContent = task.assignee;

            const timeCell = document.createElement('td');
            timeCell.textContent = `${task.timeLeft.toFixed(1)} hrs`;

            const statusCell = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = `no-eta-status ${statusClass}`;
            statusBadge.textContent = task.status;
            statusCell.appendChild(statusBadge);

            tr.appendChild(titleCell);
            tr.appendChild(assigneeCell);
            tr.appendChild(timeCell);
            tr.appendChild(statusCell);
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        section.appendChild(table);
        container.appendChild(section);
    }
}

/**
 * Format date for display
 */
function formatDateShort(date) {
    if (!date) return '';
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

// Expose Gantt functions to global scope for onclick handlers
window.openGanttModal = openGanttModal;
window.closeGanttModal = closeGanttModal;
