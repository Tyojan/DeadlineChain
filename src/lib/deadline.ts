import type { Conference, RankFilter, SelectionState, Rank } from '@/types/conference';

const DAY_MS = 24 * 60 * 60 * 1000;

const RANK_ORDER: Record<Rank, number> = {
  C: 0,
  B: 1,
  A: 2,
  'A*': 3
};

function toDate(dateText: string): Date {
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`不正な日付です: ${dateText}`);
  }
  return date;
}

function isValidIsoDate(dateText?: string | null): boolean {
  if (!dateText) return false;
  try {
    toDate(dateText);
    return true;
  } catch (e) {
    return false;
  }
}

// helper: extract first ISO date (YYYY-MM-DD) from a string (handles ranges like 2026-08-02_to_2026-09-02)
function extractIso(v?: string | null): string | null {
  if (!v) return null;
  const m = v.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function addDays(dateText: string, days: number): string {
  const date = toDate(dateText);
  const next = new Date(date.getTime() + days * DAY_MS);
  return next.toISOString().slice(0, 10);
}

export function compareIsoDate(left: string, right: string): number {
  const leftValid = isValidIsoDate(left);
  const rightValid = isValidIsoDate(right);

  if (!leftValid && !rightValid) return 0;
  if (!leftValid) return 1;
  if (!rightValid) return -1;

  return toDate(left).getTime() - toDate(right).getTime();
}

export function computeNextAvailableDate(conference: Conference, selection: SelectionState): string | null {
  if (!selection.selectedType) {
    return null;
  }
  // use module-level extractIso

  // Determine base date with fallbacks when some review dates are missing.
  if (selection.selectedType === 'submit') {
    const base = extractIso(conference.r1_date) ?? extractIso(conference.r2_date) ?? extractIso(conference.revision_date);
    return base;
  }

  if (selection.selectedType === 'R1') {
    // Use the selected R1 date (or the conference's R1/R2/Revision fallback) directly.
    // A selected early-reject date implies you can submit to conferences whose
    // submission deadlines are after that date.
    const base = extractIso(selection.selectedDate ?? undefined) ?? extractIso(conference.r1_date) ?? extractIso(conference.r2_date) ?? extractIso(conference.revision_date);
    return base;
  }

  if (selection.selectedType === 'R2') {
    // Use the selected R2 date (or the conference's R2/R1/Revision fallback) directly.
    // Do NOT add extra days — R2 should be treated as the notification date itself.
    const base = extractIso(selection.selectedDate ?? undefined) ?? extractIso(conference.r2_date) ?? extractIso(conference.revision_date) ?? extractIso(conference.r1_date);
    return base ?? null;
  }

  const base = extractIso(selection.selectedDate ?? undefined) ?? extractIso(conference.revision_date) ?? extractIso(conference.r2_date) ?? extractIso(conference.r1_date);
  // Use the selected revision/related date itself as the threshold — do NOT add extra days.
  return base ?? null;
}

export function isRankIncluded(rank: Conference['rank'], rankFilter: RankFilter): boolean {
  // If user selected no_filter, include all conferences regardless of rank
  if (rankFilter === 'no_filter') return true;

  // If the conference has no rank (e.g., JSON source missing rank), treat as not included
  if (!rank) return false;

  switch (rankFilter) {
    case 'a_star_only':
      return rank === 'A*';
    case 'a_or_higher':
      return RANK_ORDER[rank] >= RANK_ORDER.A;
    case 'b_or_higher':
      return RANK_ORDER[rank] >= RANK_ORDER.B;
    case 'c_or_higher':
    default:
      return true;
  }
}

export function isConferenceAvailable(
  target: Conference,
  selectedConference: Conference | null,
  selection: SelectionState
): boolean {
  if (!target.paper_deadline || !isValidIsoDate(target.paper_deadline)) {
    return false;
  }

  if (!selection.selectedType || !selectedConference) {
    return true;
  }

  const threshold = computeNextAvailableDate(selectedConference, selection);
  // If computeNextAvailableDate couldn't determine a threshold (e.g., selected conference
  // has no review dates), and the user has selected 'submit', use the selected
  // conference's paper_deadline as the threshold so we only keep conferences whose
  // submission deadlines are after the selected conference's submission.
  let effectiveThreshold = threshold;
  if (!effectiveThreshold && selection.selectedType === 'submit') {
    effectiveThreshold = selectedConference.paper_deadline || null;
  }
  if (!effectiveThreshold) {
    return true;
  }

  // Debug logging to help trace availability issues in the browser console.
  try {
    if (typeof window !== 'undefined' && (process.env.NODE_ENV !== 'production')) {
      // eslint-disable-next-line no-console
      console.debug('[isConferenceAvailable]', {
        selectedConference: selectedConference.id,
        selectionType: selection.selectedType,
        selectionDate: selection.selectedDate,
        effectiveThreshold,
        target: target.id,
        targetPaperDeadline: target.paper_deadline,
        // normalize target and threshold for comparison
        targetIso: extractIso(target.paper_deadline) ?? target.paper_deadline,
        thresholdIso: extractIso(effectiveThreshold) ?? effectiveThreshold,
        available: (() => {
          const t = extractIso(target.paper_deadline) ?? target.paper_deadline;
          const th = extractIso(effectiveThreshold) ?? effectiveThreshold;
          try {
            return compareIsoDate(t, th) >= 0;
          } catch (e) {
            return false;
          }
        })()
      });
    }
  } catch (e) {
    // ignore logging errors
  }

  return compareIsoDate(target.paper_deadline, effectiveThreshold) >= 0;
}

export function pickEarliestConference(conferences: Conference[]): Conference | null {
  const validConferences = conferences.filter((conference) => isValidIsoDate(conference.paper_deadline));

  if (validConferences.length === 0) {
    return null;
  }

  return [...validConferences].sort((a, b) => compareIsoDate(a.paper_deadline, b.paper_deadline))[0];
}
