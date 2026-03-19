import { Conference, RankFilter, SelectionState } from '@/types/conference';

const DAY_MS = 24 * 60 * 60 * 1000;

const RANK_ORDER: Record<Conference['rank'], number> = {
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

export function addDays(dateText: string, days: number): string {
  const date = toDate(dateText);
  const next = new Date(date.getTime() + days * DAY_MS);
  return next.toISOString().slice(0, 10);
}

export function compareIsoDate(left: string, right: string): number {
  return toDate(left).getTime() - toDate(right).getTime();
}

export function computeNextAvailableDate(conference: Conference, selection: SelectionState): string | null {
  if (!selection.selectedType) {
    return null;
  }

  if (selection.selectedType === 'submit') {
    return conference.r1_date;
  }

  if (selection.selectedType === 'R1') {
    return addDays(conference.r1_date, 14);
  }

  if (selection.selectedType === 'R2') {
    return addDays(conference.r2_date, 28);
  }

  return addDays(conference.revision_date, 42);
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
  if (!selection.selectedType || !selectedConference) {
    return true;
  }

  const threshold = computeNextAvailableDate(selectedConference, selection);
  if (!threshold) {
    return true;
  }

  return compareIsoDate(target.paper_deadline, threshold) >= 0;
}

export function pickEarliestConference(conferences: Conference[]): Conference | null {
  if (conferences.length === 0) {
    return null;
  }

  return [...conferences].sort((a, b) => compareIsoDate(a.paper_deadline, b.paper_deadline))[0];
}
