/**
 * Data Processing Utilities for Time Tracking Report
 * Handles CSV parsing, data aggregation, and ETA extraction
 */

// Distinct colors for series (shared across chart files)
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
        const isQA = taskType === 'qa';
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
