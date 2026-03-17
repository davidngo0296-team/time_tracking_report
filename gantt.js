/**
 * Gantt Chart for Time Tracking Report
 * Handles Gantt data building, scheduling, and rendering
 */

// Store for Gantt data per enhancement
const ganttDataStore = {};
let ganttChartInstance = null;

/**
 * Build Gantt data for a specific enhancement
 */
function buildGanttData(rawData, enhancementTitle, globalMaxDate, filterValue) {
    // Filter tasks for this enhancement on the latest date
    let tasks = rawData.filter(row =>
        row['Enhancement title'] === enhancementTitle &&
        row['Capture date'] === globalMaxDate
    );

    // Apply QA/Non-QA filter
    if (filterValue === 'qa') {
        tasks = tasks.filter(row => (row['Type'] || '').toLowerCase() === 'qa');
    } else if (filterValue === 'non-qa') {
        tasks = tasks.filter(row => (row['Type'] || '').toLowerCase() !== 'qa');
    }

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

        // Skip closed/obsolete tasks, or tasks with no time left unless awaiting peer review or a container
        const skipStatuses = ['obsolete', 'duplicate', 'closed', 'implemented on dev'];
        const keepStatuses = ['needs peer review', 'pending approval', 'in progress', 'not started', 'approved, pending action'];
        const isContainer = parentIds.has(taskId);
        if (skipStatuses.includes(status) || (timeLeftHours <= 0 && !keepStatuses.includes(status) && !isContainer)) {
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
            isContainer: isContainer
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

    // Read current filter value from dropdown
    const filterSelect = document.getElementById(`filter-${index}`);
    const filterValue = filterSelect ? filterSelect.value : 'all';

    // Build Gantt data
    const ganttData = buildGanttData(rawData, info.title, globalMaxDate, filterValue);
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
            if (status.includes('blocked by customer')) {
                bar.style.backgroundColor = '#ffe0b2'; // Orange for blocked by customer
                bar.classList.add('blocked-customer');
            } else if (status.includes('blocked') || status.includes('on hold')) {
                bar.style.backgroundColor = '#ffcdd2'; // Light red for blocked / on hold
                bar.classList.add('blocked');
            } else if (status.includes('pending approval')) {
                bar.style.backgroundColor = '#bbdefb'; // Blue for pending approval
                bar.classList.add('pending-approval');
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
            <span>In Progress / Pending Approval</span>
        </div>
        <div class="legend-item">
            <span class="legend-color" style="background: #ffcdd2;"></span>
            <span>Blocked by OL / On Hold</span>
        </div>
        <div class="legend-item">
            <span class="legend-color" style="background: #ffe0b2;"></span>
            <span>Blocked by Customer</span>
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
