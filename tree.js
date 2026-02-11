/**
 * Task Tree Visualization
 * Displays enhancement tasks as a collapsible tree with status-colored nodes
 */

// --- Data Building ---

function buildTreeData(rawData, enhancementTitle, globalMaxDate) {
    // Filter to this enhancement's latest date
    const tasks = rawData.filter(row =>
        row['Enhancement title'] === enhancementTitle &&
        row['Capture date'] === globalMaxDate
    );

    // Build parentIds set for container detection
    const parentIds = new Set();
    tasks.forEach(row => {
        const pf = (row['Parent Folder'] || '').trim();
        if (pf) parentIds.add(pf);
    });

    // Build task map and tree nodes, applying Gantt-like status filter
    const skipStatuses = ['obsolete', 'duplicate'];
    const keepStatuses = ['needs peer review', 'closed', 'implemented on dev'];
    const taskMap = {};
    const nodes = [];

    tasks.forEach(row => {
        const id = (row['Task Identifier'] || '').trim();
        if (!id) return;

        const status = (row['Status'] || '').trim();
        const statusLower = status.toLowerCase();
        const timeLeftMin = parseFloat(row['Time left'] || 0);
        const timeLeftHours = timeLeftMin / 60;
        const isContainer = parentIds.has(id);

        // Skip criteria matching Gantt chart
        if (skipStatuses.includes(statusLower)) return;
        if (timeLeftHours <= 0 && !keepStatuses.includes(statusLower) && !isContainer) return;

        const timeSpentMin = parseFloat(row['Time spent'] || 0);

        const node = {
            id: id,
            title: row['Task title'] || '(untitled)',
            assignee: row['Assignee'] || '(unassigned)',
            timeSpent: timeSpentMin / 60,
            timeLeft: timeLeftHours,
            status: status,
            type: row['Type'] || '',
            link: row['Cortex Link'] || '',
            dependencies: (row['Dependencies'] || '').split(';').filter(d => d.trim()),
            estimatedStart: row['Estimated Start Date'] || '',
            estimatedEnd: row['ETA'] || row['Estimated End Date'] || '',
            parentFolder: (row['Parent Folder'] || '').trim(),
            isContainer: isContainer,
            children: []
        };

        taskMap[id] = node;
        nodes.push(node);
    });

    // Link children to parents
    const roots = [];
    nodes.forEach(node => {
        const parent = taskMap[node.parentFolder];
        if (parent) {
            parent.children.push(node);
        } else {
            roots.push(node);
        }
    });

    // Sort children: containers first, then alphabetical
    const sortChildren = (list) => {
        list.sort((a, b) => {
            if (a.isContainer && !b.isContainer) return -1;
            if (!a.isContainer && b.isContainer) return 1;
            return a.title.localeCompare(b.title);
        });
        list.forEach(n => { if (n.children.length) sortChildren(n.children); });
    };
    sortChildren(roots);

    return { title: enhancementTitle, roots };
}

// --- Status Colors (same as Gantt) ---

function getTreeStatusColor(status) {
    const s = (status || '').toLowerCase();
    if (s === 'closed' || s === 'implemented on dev') return '#c8e6c9';
    if (s.includes('blocked by customer')) return '#ffe0b2';
    if (s.includes('blocked'))             return '#ffcdd2';
    if (s.includes('pending approval'))    return '#bbdefb';
    if (s.includes('peer review'))         return '#fff9c4';
    if (s.includes('in progress'))         return '#bbdefb';
    return '#e0e0e0';
}

function getTreeStatusClass(status) {
    const s = (status || '').toLowerCase();
    if (s === 'closed' || s === 'implemented on dev') return 'completed';
    if (s.includes('blocked by customer')) return 'blocked-customer';
    if (s.includes('blocked'))             return 'blocked';
    if (s.includes('pending approval'))    return 'pending-approval';
    if (s.includes('peer review'))         return 'peer-review';
    if (s.includes('in progress'))         return 'in-progress';
    return '';
}

// --- Modal ---

function openTreeModal(index) {
    const info = window.enhancementInfo[index];
    if (!info) return;

    const modal = document.getElementById('tree-modal');
    const titleEl = document.getElementById('tree-modal-title');
    const container = document.getElementById('tree-chart-container');

    titleEl.textContent = 'Task Tree: ' + info.title;
    modal.classList.add('show');

    const rawData = window.rawParsedData || [];
    const globalMaxDate = window.globalMaxDate || '';

    const treeData = buildTreeData(rawData, info.title, globalMaxDate);
    renderTree(container, treeData);
}

function closeTreeModal() {
    document.getElementById('tree-modal').classList.remove('show');
}

// --- Rendering ---

function renderTree(container, treeData) {
    container.innerHTML = '';

    if (treeData.roots.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#7f8c8d;padding:40px;">No tasks found for this enhancement.</p>';
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'tree-wrapper';

    treeData.roots.forEach(root => {
        wrapper.appendChild(renderTreeNode(root));
    });

    container.appendChild(wrapper);

    // Status legend
    const legend = document.createElement('div');
    legend.className = 'gantt-legend';
    legend.style.marginTop = '16px';
    legend.innerHTML = `
        <div class="legend-item"><span class="legend-color" style="background:#bbdefb;"></span><span>In Progress / Pending Approval</span></div>
        <div class="legend-item"><span class="legend-color" style="background:#ffcdd2;"></span><span>Blocked by OL</span></div>
        <div class="legend-item"><span class="legend-color" style="background:#ffe0b2;"></span><span>Blocked by Customer</span></div>
        <div class="legend-item"><span class="legend-color" style="background:#fff9c4;"></span><span>Needs Peer Review</span></div>
        <div class="legend-item"><span class="legend-color" style="background:#c8e6c9;"></span><span>Closed / Implemented on Dev</span></div>
        <div class="legend-item"><span class="legend-color" style="background:#e0e0e0;"></span><span>Other Status</span></div>
    `;
    container.appendChild(legend);
}

function renderTreeNode(task) {
    const node = document.createElement('div');
    node.className = 'tree-node';

    const hasChildren = task.children && task.children.length > 0;

    // Header row
    const header = document.createElement('div');
    header.className = 'tree-node-header';
    header.style.backgroundColor = getTreeStatusColor(task.status);

    const statusClass = getTreeStatusClass(task.status);
    if (statusClass) header.classList.add(statusClass);

    // Toggle arrow
    const toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    if (hasChildren) {
        toggle.textContent = '\u25BC'; // ▼
        toggle.onclick = function (e) {
            e.stopPropagation();
            const childContainer = node.querySelector('.tree-children');
            if (childContainer.style.display === 'none') {
                childContainer.style.display = 'block';
                toggle.textContent = '\u25BC';
            } else {
                childContainer.style.display = 'none';
                toggle.textContent = '\u25B6';
            }
        };
    } else {
        toggle.textContent = '\u2022'; // bullet
        toggle.style.cursor = 'default';
    }
    header.appendChild(toggle);

    // Title
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tree-node-title';
    const icon = task.isContainer ? '\uD83D\uDCC1 ' : '';

    if (task.link) {
        const a = document.createElement('a');
        a.href = task.link;
        a.target = '_blank';
        a.textContent = icon + task.title;
        a.className = 'tree-node-link';
        titleSpan.appendChild(a);
    } else {
        titleSpan.textContent = icon + task.title;
    }
    header.appendChild(titleSpan);

    // Status badge
    const badge = document.createElement('span');
    badge.className = 'tree-status-badge';
    badge.textContent = task.status || 'unknown';
    header.appendChild(badge);

    // Tooltip (same as Gantt + Assignee)
    header.title = task.title + '\n' +
        'Assignee: ' + task.assignee + '\n' +
        'Time Spent: ' + task.timeSpent.toFixed(1) + ' hrs\n' +
        'Time Left: ' + task.timeLeft.toFixed(1) + ' hrs\n' +
        'Estimated start date: ' + (task.estimatedStart || 'N/A') + '\n' +
        'Estimated completion date: ' + (task.estimatedEnd || 'N/A') +
        (task.dependencies.length ? '\nPrerequisites: ' + task.dependencies.join(', ') : '');

    node.appendChild(header);

    // Children
    if (hasChildren) {
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-children';

        task.children.forEach(child => {
            childContainer.appendChild(renderTreeNode(child));
        });

        node.appendChild(childContainer);
    }

    return node;
}

// --- Exports ---
window.openTreeModal = openTreeModal;
window.closeTreeModal = closeTreeModal;
