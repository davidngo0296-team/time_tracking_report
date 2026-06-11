/**
 * Rome release schedule - edit the arrays below to correct dates.
 * All dates are ISO yyyy-mm-dd (local, not UTC).
 * Week ranges are inclusive Mon-Fri; weekends inside a range are left uncolored.
 * Priority on overlap: enhancement (green) > stabilisation (gray) > holiday (pink/orange).
 *
 * VERIFY / GAP comments flag uncertain or missing values - David to confirm/fill.
 */
window.ROME_SCHEDULE = {
    colors: {
        enhancement:   '#a9d18e', // green  - Enhancement dev
        stabilisation: '#bfbfbf', // gray   - Stabilisation
        vnHoliday:     '#f8cbcb', // pink   - Public/OL holiday (VIETNAM)
        idHoliday:     '#f4b183', // orange - Public/OL holiday (INDONESIA)
        bounty:        '#ffc000', // yellow - Bounty day (star marker)
        branch:        '#e74c3c'  // red    - Branch cut date
    },

    // Branch cut date (highest priority - overrides all other colors). VERIFY date.
    branchDate: '2026-07-27',

    // Week ranges: [start-Mon, end-Fri] inclusive. Weekdays only.
    enhancementWeeks: [
        ['2026-05-04', '2026-05-15'], // VERIFY (pre-Gantt window, won't render)
        ['2026-05-25', '2026-05-29'], // VERIFY (pre-Gantt window, won't render)
        ['2026-06-08', '2026-06-12'],
        ['2026-06-22', '2026-06-26'],
        ['2026-07-06', '2026-07-10'],
        ['2026-07-20', '2026-07-24']
        // GAP: 2026-07-27 onwards not visible in screenshot - David to fill through 2026-08-07
    ],

    stabilisationWeeks: [
        ['2026-05-18', '2026-05-22'], // VERIFY (pre-Gantt window, won't render)
        ['2026-06-15', '2026-06-19'],
        ['2026-06-29', '2026-07-03'],
        ['2026-07-13', '2026-07-17']
        // GAP: 2026-07-27 onwards - David to fill through 2026-08-17 (official release)
    ],

    // Explicit holiday dates (individual days, any day of week).
    vnHolidays: [
        // GAP: Vietnam public/OL holidays not legible in screenshot - David to fill
    ],
    idHolidays: [
        // GAP/VERIFY: Indonesia holiday cells visible but dates unreadable - David to fill
    ],

    // Bounty days: yellow star shown on the date label.
    bountyDays: [
        '2026-07-16' // VERIFY: star seen in the Jul 13-17 stabilisation week
    ]
};

// --- helper (internal) ---
function _romeISOLocal(d) {
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Returns { bg: <cssColor|null>, bounty: <bool> } for a given Date object.
 * bg is null when no schedule category applies (weekends, out-of-range days).
 */
window.getRomeDateStyle = function (dateObj) {
    const s   = window.ROME_SCHEDULE;
    const iso = _romeISOLocal(dateObj);
    const dow = dateObj.getDay();          // 0=Sun, 6=Sat
    const isWeekday = dow >= 1 && dow <= 5;
    const inRanges  = (ranges) => ranges.some(([a, b]) => iso >= a && iso <= b);

    // Branch overrides everything
    if (s.branchDate && iso === s.branchDate) {
        return { bg: s.colors.branch, color: '#fff', bounty: false, branch: true };
    }

    let bg = null;
    if (isWeekday && inRanges(s.enhancementWeeks)) {
        bg = s.colors.enhancement;
    } else if (isWeekday && inRanges(s.stabilisationWeeks)) {
        bg = s.colors.stabilisation;
    } else if (s.vnHolidays.includes(iso)) {
        bg = s.colors.vnHoliday;
    } else if (s.idHolidays.includes(iso)) {
        bg = s.colors.idHoliday;
    }

    return { bg, color: null, bounty: s.bountyDays.includes(iso), branch: false };
};
