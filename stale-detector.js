/**
 * Stale Enhancement Detection
 * Splits in-scope enhancements into "stale" (no Dev/QA progress) and "active"
 * (made progress) since their previous capture date.
 */

const STALE_COUNTED_TYPES = new Set([
    'development', 'qa', 'defect - application', 'defect - qa vietnam',
    'configuration request', 'merge request execution'
]);
const STALE_STATUS_SCOPE = new Set(['in development', 'in review', 'ready for development']);
const STALE_THRESHOLD_MIN = 6; // delta < 6 min counts as no progress

function detectStaleEnhancements(rawData, allowedTitles) {
    const allowed = allowedTitles instanceof Set ? allowedTitles : null;
    const byTitle = {};
    rawData.forEach(row => {
        const title = row['Enhancement title'];
        if (!title) return;
        if (allowed && !allowed.has(title)) return;
        if (!byTitle[title]) byTitle[title] = [];
        byTitle[title].push(row);
    });

    const stale = [];
    const active = [];

    Object.entries(byTitle).forEach(([title, rows]) => {
        const dateSet = new Set();
        rows.forEach(r => { if (r['Capture date']) dateSet.add(r['Capture date']); });
        const dates = Array.from(dateSet).sort();
        if (dates.length < 2) return;

        const latestDate = dates[dates.length - 1];
        const prevDate = dates[dates.length - 2];

        const latestRow = rows.find(r => r['Capture date'] === latestDate);
        const status = ((latestRow && latestRow['Enhancement Status']) || '').trim().toLowerCase();
        if (!STALE_STATUS_SCOPE.has(status)) return;

        const sumFor = (date) => {
            const seen = new Set();
            let total = 0;
            rows.forEach(r => {
                if (r['Capture date'] !== date) return;
                const type = (r['Type'] || '').toLowerCase();
                if (!STALE_COUNTED_TYPES.has(type)) return;
                const tid = (r['Task Identifier'] || '').trim();
                if (tid) {
                    if (seen.has(tid)) return;
                    seen.add(tid);
                }
                total += parseFloat(r['Time spent'] || 0) || 0;
            });
            return total;
        };

        const sumByMember = (date) => {
            const seen = new Set();
            const byMember = {};
            rows.forEach(r => {
                if (r['Capture date'] !== date) return;
                const type = (r['Type'] || '').toLowerCase();
                if (!STALE_COUNTED_TYPES.has(type)) return;
                const tid = (r['Task Identifier'] || '').trim();
                if (tid) {
                    if (seen.has(tid)) return;
                    seen.add(tid);
                }
                const assignee = (r['Assignee'] || '(unassigned)').trim();
                byMember[assignee] = (byMember[assignee] || 0) + (parseFloat(r['Time spent'] || 0) || 0);
            });
            return byMember;
        };

        const latestSum = sumFor(latestDate);
        const prevSum = sumFor(prevDate);
        const delta = latestSum - prevSum;

        const latestByMember = sumByMember(latestDate);
        const prevByMember = sumByMember(prevDate);
        const memberDeltas = {};
        new Set([...Object.keys(latestByMember), ...Object.keys(prevByMember)]).forEach(m => {
            const d = (latestByMember[m] || 0) - (prevByMember[m] || 0);
            if (Math.abs(d) > 0.001) memberDeltas[m] = d;
        });

        const ticketId = ((latestRow && latestRow['Ticket ID']) || '').trim();
        const importance = ((latestRow && latestRow['Importance']) || '').trim();
        const entry = { title, ticketId, importance, latestDate, prevDate, latestSum, prevSum, delta, memberDeltas };

        if (delta < STALE_THRESHOLD_MIN) {
            stale.push(entry);
        } else {
            active.push(entry);
        }
    });

    const byImportance = (a, b) => {
        const na = parseInt(a.importance) || 9999;
        const nb = parseInt(b.importance) || 9999;
        return na - nb;
    };
    stale.sort(byImportance);
    active.sort(byImportance);

    return { stale, active };
}

function renderStaleEnhancements(result) {
    const container = document.getElementById('stale-enhancements');
    if (!container) return;

    const { stale = [], active = [] } = result || {};
    if (!stale.length && !active.length) {
        container.innerHTML = '';
        return;
    }

    const priorityColor = (imp) => {
        const v = (imp || '').toLowerCase().trim();
        if (v.includes('should +')) return '#ef6c00';
        if (v.includes('should -')) return '#2e7d32';
        if (v.includes('should'))   return '#f9a825';
        return '#e74c3c';
    };

    const buildList = (items) => items.map(r => {
        const deltaHr = (r.delta / 60).toFixed(1);
        const safeTitle = r.title.replace(/"/g, '&quot;');
        const priorityBadge = r.importance
            ? `<span class="stale-priority" style="background:${priorityColor(r.importance)}">#${r.importance}</span> `
            : '';
        const href = r.ticketId ? `https://link.orangelogic.com/Tasks/${r.ticketId}` : '#';
        const tooltipLines = Object.entries(r.memberDeltas || {})
            .sort((a, b) => b[1] - a[1])
            .map(([m, d]) => `${m}: +${(d / 60).toFixed(1)}h`)
            .join('\n');
        const deltaSpan = tooltipLines
            ? `<span class="stale-delta" data-tooltip="${tooltipLines.replace(/"/g, '&quot;')}">delta: ${deltaHr}h</span>`
            : `<span>delta: ${deltaHr}h</span>`;
        return `<li>${priorityBadge}<a href="${href}" data-title="${safeTitle}">${r.title}</a>` +
            ` <span class="stale-meta">(${r.prevDate} &rarr; ${r.latestDate}, ${deltaSpan})</span></li>`;
    }).join('');

    const buildSection = (cssClass, headerLabel, items) => {
        if (!items.length) return '';
        return `<div class="progress-banner ${cssClass}">` +
            `<h3 class="progress-banner-header" data-collapsed="true">` +
            `<span class="progress-toggle">&#9654;</span> ${headerLabel} (${items.length})` +
            `</h3>` +
            `<ul class="progress-banner-body" style="display:none;">${buildList(items)}</ul>` +
            `</div>`;
    };

    container.innerHTML =
        buildSection('stale-banner', '&#9200; Stale enhancements &mdash; no Dev/QA progress vs prior capture', stale) +
        buildSection('active-banner', '&#9989; Not stale enhancements &mdash; progress detected', active);

    container.querySelectorAll('.progress-banner-header').forEach(h => {
        h.addEventListener('click', () => {
            const body = h.nextElementSibling;
            const collapsed = h.getAttribute('data-collapsed') === 'true';
            body.style.display = collapsed ? 'block' : 'none';
            h.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
            const toggle = h.querySelector('.progress-toggle');
            if (toggle) toggle.innerHTML = collapsed ? '&#9660;' : '&#9654;';
        });
    });

    container.querySelectorAll('a[data-title]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const title = a.getAttribute('data-title');
            const info = window.enhancementInfo || {};
            const index = Object.keys(info).find(i => info[i].title === title);
            if (index == null) return;
            const filterSelect = document.getElementById(`filter-${index}`);
            if (filterSelect) filterSelect.value = 'all';
            if (window.openTreeModal) window.openTreeModal(Number(index));
        });
    });
}

window.detectStaleEnhancements = detectStaleEnhancements;
window.renderStaleEnhancements = renderStaleEnhancements;
