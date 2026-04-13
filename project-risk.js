// ============================================================
// PROJECT RISK -- Risk data, modal rendering, status persistence
// ============================================================

const RISK_CATEGORIES = [
    {
        id: 'people',
        label: 'People & Team',
        color: '#8b5cf6',
        bg: 'rgba(139,92,246,0.10)',
        border: 'rgba(139,92,246,0.25)',
        risks: [
            { label: 'Key-person dependency', detail: 'Critical knowledge locked in one person. If they leave, delivery stalls.', ask: 'If X got sick for 3 weeks, what stops?', solution: 'Pair programming, documented runbooks, rotate ownership of critical components. No one should be the sole expert on anything.' },
            { label: 'Skills gap', detail: 'Team lacks experience in the required tech or domain.', ask: 'Has the team built something like this before?', solution: 'Run a spike or POC early. Budget for training time. Consider embedding a contractor with the needed expertise short-term.' },
            { label: 'Team overload', detail: 'People stretched across too many projects. Context-switching kills velocity.', ask: 'What else is competing for their time?', solution: 'Negotiate dedicated allocation with resource managers. Make the cost of context-switching visible with data. Protect the team\'s focus.' },
        ],
    },
    {
        id: 'tech',
        label: 'Technical',
        color: '#00b4d8',
        bg: 'rgba(0,180,216,0.10)',
        border: 'rgba(0,180,216,0.25)',
        risks: [
            { label: 'Architecture uncertainty', detail: 'Unproven design decisions not validated with a spike or POC.', ask: 'Have we proven this design works under real conditions?', solution: 'Time-box a technical spike in Sprint 1. Validate assumptions with a throwaway prototype before committing to the architecture.' },
            { label: 'Integration complexity', detail: 'Connecting to legacy systems or third-party APIs with unknown behavior.', ask: 'What if their API doesn\'t behave as documented?', solution: 'Build integration tests against the real API early. Create contract tests. Have a fallback plan if the integration fails.' },
            { label: 'Tech debt drag', detail: 'Existing codebase is fragile, poorly documented, or hard to change.', ask: 'How long does a \'simple change\' actually take here?', solution: 'Allocate 15-20% of sprint capacity to tech debt reduction. Track \'actual vs estimated\' to make the drag visible to stakeholders.' },
            { label: 'Security & compliance', detail: 'Auth, encryption, or regulatory requirements not fully addressed.', ask: 'Has security reviewed this? What regulations apply?', solution: 'Engage security and compliance teams at design stage, not at release. Build security requirements into the Definition of Done.' },
            { label: 'Data migration', detail: 'Moving data between systems is complex, lossy, or untested.', ask: 'How clean is the source data? What\'s the rollback plan?', solution: 'Run a trial migration early with production-like data. Profile source data quality. Build automated validation checks and a documented rollback procedure.' },
        ],
    },
    {
        id: 'scope',
        label: 'Scope & Requirements',
        color: '#f39c12',
        bg: 'rgba(243,156,18,0.10)',
        border: 'rgba(243,156,18,0.25)',
        risks: [
            { label: 'Requirements ambiguity', detail: 'Vague specs interpreted differently by different people.', ask: 'Could two devs read this and build different things?', solution: 'Write acceptance criteria in Given/When/Then format. Run a \'three amigos\' session (dev, QA, BA) on every story before sprint planning.' },
            { label: 'Misaligned expectations', detail: 'Stakeholders expect something different from what\'s being built.', ask: 'When did the user last see a working demo?', solution: 'Demo working software every sprint. Share clickable prototypes before building. Misalignment caught in week 2 costs hours; in month 6 costs months.' },
            { label: 'Gold plating', detail: 'Team over-engineers beyond what\'s needed, burning time.', ask: 'Are we building what\'s needed, or what\'s \'cool\'?', solution: 'Tie every task to a user story and acceptance criteria. If it\'s not in the criteria, it\'s not in the sprint. Coach the team on YAGNI.' },
        ],
    },
    {
        id: 'external',
        label: 'External Dependencies',
        color: '#2ecc71',
        bg: 'rgba(46,204,113,0.10)',
        border: 'rgba(46,204,113,0.25)',
        risks: [
            { label: 'Vendor delivery failure', detail: 'Third-party misses deadline or delivers poor quality.', ask: 'Do we have a contractual commitment, or just a verbal promise?', solution: 'Get written commitments with milestone dates and penalty clauses. Identify an alternative vendor or in-house fallback. Never have a single-vendor critical path.' },
            { label: 'Cross-team dependency', detail: 'Another team must deliver first. Their priorities differ from yours.', ask: 'Have they committed this to their sprint?', solution: 'Get the dependency into their backlog with a committed sprint. Attend their standup. Escalate early if their priorities shift.' },
            { label: 'Infrastructure delays', detail: 'Environments, licenses, or access not provisioned in time.', ask: 'Do we have everything needed to start coding day 1?', solution: 'Create a \'Day 1 readiness\' checklist during planning. Submit infra requests 2-4 weeks before needed. Track provisioning as a workstream.' },
        ],
    },
    {
        id: 'delivery',
        label: 'Delivery & Process',
        color: '#e74c3c',
        bg: 'rgba(231,76,60,0.10)',
        border: 'rgba(231,76,60,0.25)',
        risks: [
            { label: 'Poor estimation', detail: 'Estimates based on hope, not historical data.', ask: 'What did similar work actually take last time?', solution: 'Use reference-class forecasting: compare to actual data from similar past work. Track estimate accuracy and apply a correction factor.' },
            { label: 'Absent governance', detail: 'No clear decision-making or change control. Decisions stall.', ask: 'Who approves scope changes? How fast?', solution: 'Define a governance framework at kickoff: who decides what, escalation paths, and SLAs for decisions (e.g., scope changes approved within 48hrs).' },
            { label: 'Release complexity', detail: 'Deployment is manual, risky, or requires long downtime.', ask: 'Can we deploy and roll back in under an hour?', solution: 'Invest in CI/CD automation. Practice deployments in staging. Write a rollback runbook and test it. Aim for zero-downtime deployments.' },
            { label: 'Last-mile blindness', detail: 'Nobody plans go-live: training, comms, support handover.', ask: 'What needs to be true on day 1 after launch?', solution: 'Create a go-live checklist covering training, support handover, monitoring, comms, and runbooks. Start planning at project midpoint, not the final sprint.' },
        ],
    },
    {
        id: 'quality',
        label: 'Quality & Testing',
        color: '#e84393',
        bg: 'rgba(232,67,147,0.10)',
        border: 'rgba(232,67,147,0.25)',
        risks: [
            { label: 'Insufficient test coverage', detail: 'No automated tests, or only happy paths covered.', ask: 'What % of critical paths have automated tests?', solution: 'Define a testing strategy upfront. Mandate unit tests for new code. Focus automation on critical user journeys first, not 100% coverage.' },
            { label: 'No test environment', detail: 'Shared or unstable environments cause flaky tests.', ask: 'Does the team have a dedicated, prod-like test env?', solution: 'Provision a dedicated, production-like test environment. Use infrastructure-as-code so environments are reproducible. Treat env instability as a P1 blocker.' },
            { label: 'Defect debt', detail: 'Known bugs deferred sprint after sprint, piling up.', ask: 'How many open bugs? What\'s the trend?', solution: 'Set a bug budget: fix critical/high bugs within the sprint they\'re found. Track open bug count as a KPI. A rising trend is a red flag.' },
        ],
    },
];

const TOTAL_RISKS = RISK_CATEGORIES.reduce((sum, c) => sum + c.risks.length, 0);

let currentRiskTicketId = null;

// ---- PUBLIC: OPEN / CLOSE ----

function openProjectRiskModal(ticketId) {
    currentRiskTicketId = ticketId;
    document.getElementById('project-risk-modal-title').textContent = 'Project Risk Assessment';
    renderRiskModalContent(ticketId);
    document.getElementById('project-risk-modal').classList.add('show');
}

function closeProjectRiskModal() {
    document.getElementById('project-risk-modal').classList.remove('show');
}

// ---- RENDERING ----

function renderRiskModalContent(ticketId) {
    const statuses = getRiskStatuses(ticketId);
    const summary = computeRiskSummary(statuses);
    const container = document.getElementById('project-risk-body');

    let html = buildSummaryBar(summary);

    RISK_CATEGORIES.forEach(cat => {
        html += buildCategorySection(cat, statuses, ticketId);
    });

    container.innerHTML = html;
}

function buildSummaryBar(summary) {
    return `
    <div class="risk-summary-bar" id="risk-summary-bar">
        <div class="risk-summary-card safe">
            <div class="risk-summary-count">${summary.safe}</div>
            <div class="risk-summary-label">Safe</div>
        </div>
        <div class="risk-summary-card risky">
            <div class="risk-summary-count">${summary.risky}</div>
            <div class="risk-summary-label">Risky</div>
        </div>
        <div class="risk-summary-card needs-investigation">
            <div class="risk-summary-count">${summary.needsInvestigation}</div>
            <div class="risk-summary-label">Needs Investigation</div>
        </div>
    </div>`;
}

function buildCategorySection(cat, statuses, ticketId) {
    let risksHtml = '';
    cat.risks.forEach((risk, i) => {
        const key = `${cat.id}-${i}`;
        const status = statuses[key] || 'needs-investigation';
        risksHtml += buildRiskRow(cat, risk, i, key, status, ticketId);
    });

    return `
    <div class="risk-category">
        <div class="risk-category-header" style="background: ${cat.color};">
            <span>${cat.label}</span>
            <span class="risk-category-count">${cat.risks.length} risks</span>
        </div>
        ${risksHtml}
    </div>`;
}

function buildRiskRow(cat, risk, riskIndex, key, status, ticketId) {
    const safeActive = status === 'safe' ? ' active-safe' : '';
    const riskyActive = status === 'risky' ? ' active-risky' : '';
    const needsActive = status === 'needs-investigation' ? ' active-needs-investigation' : '';

    return `
    <div class="risk-item-row" id="risk-row-${key}">
        <span class="risk-expand-toggle" id="risk-toggle-${key}" onclick="toggleRiskDetail('${cat.id}', ${riskIndex})">&#9654;</span>
        <span class="risk-item-label" onclick="toggleRiskDetail('${cat.id}', ${riskIndex})">${risk.label}</span>
        <div class="risk-status-group">
            <button class="risk-status-btn${safeActive}" onclick="setRiskStatus('${ticketId}', '${cat.id}', ${riskIndex}, 'safe')">Safe</button>
            <button class="risk-status-btn${riskyActive}" onclick="setRiskStatus('${ticketId}', '${cat.id}', ${riskIndex}, 'risky')">Risky</button>
            <button class="risk-status-btn${needsActive}" onclick="setRiskStatus('${ticketId}', '${cat.id}', ${riskIndex}, 'needs-investigation')">Investigate</button>
        </div>
    </div>
    <div class="risk-detail-panel" id="risk-detail-${key}">
        <div class="risk-detail-section">
            <div class="risk-detail-label">What's the risk</div>
            <div class="risk-detail-text">${risk.detail}</div>
        </div>
        <div class="risk-detail-section">
            <div class="risk-detail-label">Ask this question</div>
            <div class="risk-detail-ask" style="border-left-color: ${cat.color};">"${risk.ask}"</div>
        </div>
        <div class="risk-detail-section">
            <div class="risk-detail-label">Mitigation</div>
            <div class="risk-detail-solution">${risk.solution}</div>
        </div>
    </div>`;
}

// ---- INTERACTIONS ----

function toggleRiskDetail(categoryId, riskIndex) {
    const key = `${categoryId}-${riskIndex}`;
    const panel = document.getElementById(`risk-detail-${key}`);
    const toggle = document.getElementById(`risk-toggle-${key}`);
    if (!panel) return;
    const isOpen = panel.classList.contains('show');
    panel.classList.toggle('show', !isOpen);
    toggle.classList.toggle('expanded', !isOpen);
}

function setRiskStatus(ticketId, categoryId, riskIndex, status) {
    const key = `${categoryId}-${riskIndex}`;
    const statuses = getRiskStatuses(ticketId);

    if (status === 'needs-investigation') {
        delete statuses[key];
    } else {
        statuses[key] = status;
    }

    // Persist to server
    fetch('/enhancement-meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, field: 'riskStatuses', value: statuses })
    })
    .then(r => r.json())
    .then(result => {
        if (!result.success) throw new Error(result.error || 'Save failed');

        // Update global cache
        if (!window.enhancementMeta) window.enhancementMeta = {};
        if (!window.enhancementMeta[ticketId]) window.enhancementMeta[ticketId] = {};
        window.enhancementMeta[ticketId].riskStatuses = statuses;

        // Update button visual in the enhancement header
        const summary = computeRiskSummary(statuses);
        const btn = document.getElementById(`project-risk-btn-${ticketId}`);
        if (btn) {
            btn.classList.toggle('has-risks', summary.hasRisky);
        }

        // Update red indicator in enhancement header
        updateRiskWarningIndicator(ticketId, summary.hasRisky);

        // Re-render modal summary bar + the changed row without full re-render
        const summaryBar = document.getElementById('risk-summary-bar');
        if (summaryBar) {
            summaryBar.outerHTML = buildSummaryBar(summary);
        }

        // Update the status buttons for this row
        const row = document.getElementById(`risk-row-${key}`);
        if (row) {
            row.querySelectorAll('.risk-status-btn').forEach((btn, idx) => {
                const states = ['safe', 'risky', 'needs-investigation'];
                btn.className = 'risk-status-btn' + (states[idx] === status ? ` active-${states[idx]}` : '');
            });
        }
    })
    .catch(err => {
        console.error('Failed to save risk status:', err);
    });
}

function updateRiskWarningIndicator(ticketId, hasRisky) {
    // last-reload-span-{ticketId} is a reliable anchor inside the h2 header
    const reloadSpan = document.getElementById(`last-reload-span-${ticketId}`);
    if (!reloadSpan) return;
    const header = reloadSpan.closest('h2');
    if (!header) return;

    const existingIndicator = header.querySelector('.risk-warning-indicator');
    if (hasRisky && !existingIndicator) {
        const indicator = document.createElement('span');
        indicator.className = 'risk-warning-indicator';
        indicator.title = 'Has risky items';
        indicator.style.cssText = 'color: #e74c3c; font-size: 0.85em; margin-right: 6px;';
        indicator.innerHTML = '&#x1F534;';
        // Insert after any existing blocker warning (before the title link)
        const firstTextNode = Array.from(header.childNodes).find(
            n => n.nodeType === Node.TEXT_NODE || (n.tagName === 'A') || (n.tagName === 'SPAN' && !n.style.background)
        );
        header.insertBefore(indicator, firstTextNode || reloadSpan);
    } else if (!hasRisky && existingIndicator) {
        existingIndicator.remove();
    }
}

// ---- DATA HELPERS ----

function getRiskStatuses(ticketId) {
    const meta = window.enhancementMeta || {};
    const ticketMeta = meta[ticketId] || {};
    // Return a shallow copy so mutations don't accidentally mutate the cache
    return Object.assign({}, ticketMeta.riskStatuses || {});
}

function computeRiskSummary(statuses) {
    const values = Object.values(statuses);
    const safe = values.filter(s => s === 'safe').length;
    const risky = values.filter(s => s === 'risky').length;
    const assessed = safe + risky;
    return {
        safe,
        risky,
        needsInvestigation: TOTAL_RISKS - assessed,
        hasRisky: risky > 0
    };
}

// Exposed for use in chart-render.js to compute initial button/indicator state
function getRiskSummaryForTicket(ticketId) {
    return computeRiskSummary(getRiskStatuses(ticketId));
}

// ---- WINDOW EXPORTS ----
window.openProjectRiskModal = openProjectRiskModal;
window.closeProjectRiskModal = closeProjectRiskModal;
window.toggleRiskDetail = toggleRiskDetail;
window.setRiskStatus = setRiskStatus;
window.getRiskSummaryForTicket = getRiskSummaryForTicket;
