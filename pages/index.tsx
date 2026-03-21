import { useEffect, useMemo, useState } from 'react';
import { parseConferenceCsv } from '@/lib/csv';
import {
  compareIsoDate,
  computeNextAvailableDate,
  isConferenceAvailable,
  isRankIncluded,
  pickEarliestConference
} from '@/lib/deadline';
import { Conference, RankFilter, SelectionState, SelectionType } from '@/types/conference';

const INITIAL_SELECTION: SelectionState = {
  selectedConference: null,
  selectedDate: null,
  selectedType: null
};

function formatShort(isoDate?: string | null): string {
  if (!isoDate) return '-';
  // expect ISO YYYY-MM-DD
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate; // fallback to raw string for non-ISO ranges
  const [, , month, day] = m;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mi = parseInt(month, 10) - 1;
  const mname = months[mi] ?? month;
  return `${mname} ${day}`;
}

function formatFull(isoDate?: string | null): string {
  if (!isoDate) return '-';
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const [, year, month, day] = m;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mi = parseInt(month, 10) - 1;
  const mname = months[mi] ?? month;
  return `${mname} ${day}, ${year}`;
}

function selectionTypeLabel(type: SelectionType | null): string {
  if (!type) return '-';
  switch (type) {
    case 'submit':
      return 'submit';
    case 'R1':
      return 'Early Reject Notification';
    case 'R2':
      return 'Notification';
    case 'Revision':
      return 'Revision';
    default:
      return type;
  }
}

export default function HomePage() {
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [selection, setSelection] = useState<SelectionState>(INITIAL_SELECTION);
  const [selectionChain, setSelectionChain] = useState<SelectionState[]>([]);
  const [rankFilter, setRankFilter] = useState<RankFilter>('no_filter');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadCsv() {
      try {
        // Prefer loading JSON first
        const tryJson = await fetch('/conference.json').catch(() => null);
        if (tryJson && tryJson.ok) {
          const json = await tryJson.json();
          // try to also fetch CSV to fill missing metadata (rank/url)
          let csvLookup: Record<string, { rank?: string; url?: string; estimated?: boolean }> | undefined = undefined;
          try {
            const csvResp = await fetch('/conferences.csv');
            if (csvResp && csvResp.ok) {
              const csvText = await csvResp.text();
              const parsedCsv = parseConferenceCsv(csvText);
              csvLookup = Object.fromEntries(parsedCsv.map((c) => [c.id, { rank: c.rank, url: c.url, estimated: c.estimated }]));
            }
          } catch (e) {
            // ignore CSV fetch/parse errors — JSON will still be used
            csvLookup = undefined;
          }

          // Dynamically import convertJsonToConferences to minimize dependencies
          const { convertJsonToConferences } = await import('@/lib/json');
          const parsed = convertJsonToConferences(json, csvLookup);
          setConferences(parsed);
          setErrorMessage(null);
          return;
        }

        // If JSON is not available, fall back to loading the CSV
        const response = await fetch('/conferences.csv');
        if (!response.ok) {
          throw new Error('Failed to load conferences.csv.');
        }

        const text = await response.text();
        const parsed = parseConferenceCsv(text).sort((a, b) => compareIsoDate(a.paper_deadline, b.paper_deadline));
        setConferences(parsed);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'An error occurred while loading data.');
      }
    }

    loadCsv();
  }, []);

  const selectedConference = useMemo(() => {
    if (!selection.selectedConference) {
      return null;
    }
    return conferences.find((conference) => conference.id === selection.selectedConference) ?? null;
  }, [conferences, selection.selectedConference]);

  const availableConferences = useMemo(() => {
    return conferences
      .filter((conference) => isRankIncluded(conference.rank, rankFilter))
      .filter((conference) => isConferenceAvailable(conference, selectedConference, selection));
  }, [conferences, rankFilter, selectedConference, selection]);

  const displayedConferences = useMemo(() => {
    // Keep conferences selected in order (the selection chain) at the front
    const chainConfs: Conference[] = selectionChain
      .map((s) => conferences.find((c) => c.id === s.selectedConference))
      .filter((c): c is Conference => Boolean(c));

    const chainIds = new Set(chainConfs.map((c) => c.id));

    const rest = availableConferences.filter((c) => !chainIds.has(c.id));
    return [...chainConfs, ...rest];
  }, [availableConferences, selectionChain, conferences]);

  const earliestConference = useMemo(() => pickEarliestConference(availableConferences), [availableConferences]);

  const nextAvailableDate = useMemo(() => {
    if (!selectedConference) {
      return null;
    }
    return computeNextAvailableDate(selectedConference, selection);
  }, [selectedConference, selection]);

  function selectEvent(conference: Conference, type: SelectionType, date: string) {
    setSelection({
      selectedConference: conference.id,
      selectedDate: date,
      selectedType: type
    });
    setSelectionChain((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.selectedConference === conference.id && last.selectedDate === date && last.selectedType === type) {
        return prev;
      }
      return [...prev, { selectedConference: conference.id, selectedDate: date, selectedType: type }];
    });
  }

  function resetSelection() {
    setSelection(INITIAL_SELECTION);
    setSelectionChain([]);
  }

  /**
   * Countdown display component
   * - `target` is expected to be an ISO date string (YYYY-MM-DD or YYYY-MM-DDThh:mm:ss etc.)
   * - If the date is only YYYY-MM-DD, treat it as the end of that day (23:59:59 local time)
   */
  function Countdown({ target, mode = 'days' }: { target?: string | null; mode?: 'days' | 'seconds' }) {
    const [now, setNow] = useState<Date>(() => new Date());

    // Convert target string to Date (interpreted in local time)
    function parseTarget(t?: string | null): Date | null {
      if (!t) return null;
      const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10) - 1;
        const d = parseInt(m[3], 10);
        return new Date(y, mo, d, 23, 59, 59);
      }
      const dt = new Date(t);
      if (isNaN(dt.getTime())) return null;
      return dt;
    }

    // Update interval depends on mode (1s for seconds, 60s for days)
    useEffect(() => {
      const interval = mode === 'seconds' ? 1000 : 60 * 1000;
      const id = setInterval(() => setNow(new Date()), interval);
      return () => clearInterval(id);
    }, [mode]);

    const tgt = parseTarget(target ?? null);
    if (!tgt) return <span className="countdown">-</span>;

    const diffMs = tgt.getTime() - now.getTime();
    if (diffMs <= 0) return <span className="countdown">Past deadline</span>;

    if (mode === 'days') {
      const diffDays = Math.ceil(diffMs / (24 * 3600 * 1000));
      return <span className="countdown">{diffDays} days</span>;
    }

    // seconds mode: HH:MM:SS (include days prefix if needed)
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / (24 * 3600));
    const hh = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const mm = Math.floor((totalSeconds % 3600) / 60);
    const ss = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      <span className="countdown">
        {days > 0 ? `${days} days ` : ''}{pad(hh)}:{pad(mm)}:{pad(ss)}
      </span>
    );
  }

  return (
    <main className="page">
      <section className="panel">
        <h1
          role="button"
          tabIndex={0}
          onClick={resetSelection}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              resetSelection();
            }
          }}
          title="Click to clear selection"
        >
          DeadlineChain
        </h1>
        <p
          className="caption"
          role="button"
          tabIndex={0}
          onClick={resetSelection}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              resetSelection();
            }
          }}
          title="Click to clear selection"
        >
          Visualize next-postable conferences after rejection
        </p>

        <div className="controls">
          <label htmlFor="rank-filter">Rank:</label>
          <select
            id="rank-filter"
            value={rankFilter}
            onChange={(event) => setRankFilter(event.target.value as RankFilter)}
          >
            <option value="no_filter">All ranks</option>
            <option value="a_star_only">A* only</option>
            <option value="a_or_higher">A or higher</option>
            <option value="b_or_higher">B or higher</option>
            <option value="c_or_higher">C or higher</option>
          </select>

          <button type="button" onClick={resetSelection}>
            Clear selection
          </button>
        </div>


        {errorMessage && <p className="error">{errorMessage}</p>}

        <div className="table-wrap">
          <table>
            <thead>
                <tr>
                <th>Conference Name</th>
                <th>Rank</th>
                <th>Abstract Deadline</th>
                <th>Submission Deadline</th>
                <th>Early Reject Notification</th>
                <th>Notification</th>
                <th>Revision Deadline</th>
              </tr>
            </thead>
            <tbody>
              {displayedConferences.map((conference) => {
                const hasRejectable = Boolean(conference.r1_date || conference.r2_date || conference.revision_date);
                const isEarliest = earliestConference?.id === conference.id;
                const isSelectedDate = (date: string) =>
                  selection.selectedConference === conference.id && selection.selectedDate === date;
                const isSelectedR1 = selection.selectedConference === conference.id && selection.selectedDate === conference.r1_date && selection.selectedType === 'R1';
                const isSelectedR2 = selection.selectedConference === conference.id && selection.selectedDate === conference.r2_date && selection.selectedType === 'R2';
                const isSelectedRevision = selection.selectedConference === conference.id && selection.selectedDate === conference.revision_date && selection.selectedType === 'Revision';
                // Check if the same conference/date/type exists in the chain (so past selections keep red framing)
                const isChainedR1 = selectionChain.some((s) => s.selectedConference === conference.id && s.selectedDate === conference.r1_date && s.selectedType === 'R1');
                const isChainedR2 = selectionChain.some((s) => s.selectedConference === conference.id && s.selectedDate === conference.r2_date && s.selectedType === 'R2');
                const isChainedRevision = selectionChain.some((s) => s.selectedConference === conference.id && s.selectedDate === conference.revision_date && s.selectedType === 'Revision');

                // Determine row state classes
                const available = isConferenceAvailable(conference, selectedConference, selection);
                const classes = [isEarliest ? 'earliest' : ''];
                // Always add the tiled-row class
                classes.push('tiled-row');
                // Keep chain conferences visible as selected
                if (selectionChain.find((s) => s.selectedConference === conference.id)) classes.push('selected-conf');

                // Apply a light cyan background to idle rows (do not make them white even if not rejectable)
                const isIdle = !selection.selectedConference;
                if (isIdle) classes.push('idle-row');

                // Predictively compute availability for R1 / R2 and add display classes
                const availableIfR1 = isConferenceAvailable(conference, selectedConference, {
                  ...selection,
                  selectedType: 'R1'
                });
                const availableIfR2 = isConferenceAvailable(conference, selectedConference, {
                  ...selection,
                  selectedType: 'R2'
                });
                  const hasR1 = Boolean(conference.r1_date);
                  const hasR2 = Boolean(conference.r2_date);
                  if (availableIfR1 && hasR1) classes.push('available-r1');
                  if (availableIfR2 && hasR2) classes.push('available-r2');

                const rowClass = classes.filter(Boolean).join(' ');

                return (
                  <tr key={conference.id} className={rowClass}>
                    <td>
                      {conference.url ? (
                        <a
                          href={conference.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="name-link"
                          onClick={() => {
                            // Navigating to external page, so clear selection
                            resetSelection();
                          }}
                        >
                          {conference.name}
                          {((conference.estimated === true) || (!hasRejectable && conference.paper_deadline)) ? (
                            <span className="estimated">(Estimated)</span>
                          ) : null}
                        </a>
                      ) : (
                        <button type="button" className="name-btn" onClick={() => { resetSelection(); }}>
                          {conference.name}
                          {((conference.estimated === true) || (!hasRejectable && conference.paper_deadline)) ? (
                            <span className="estimated">(Estimated)</span>
                          ) : null}
                        </button>
                      )}
                    </td>
                    <td>{conference.rank ?? '-'}</td>
                    <td>
                      {conference.abstract_deadline ? (
                        <span className="abstract-cell">{formatFull(conference.abstract_deadline)}</span>
                      ) : (
                        <span className="empty-cell" aria-hidden="true">&nbsp;</span>
                      )}
                    </td>
                    <td
                      className="clickable-cell"
                      role="button"
                      tabIndex={0}
                      onClick={() => selectEvent(conference, 'submit', conference.paper_deadline)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          selectEvent(conference, 'submit', conference.paper_deadline);
                        }
                      }}
                    >
                      <div className={`date-btn${isSelectedDate(conference.paper_deadline) ? ' selected' : ''}`}>
                        {formatFull(conference.paper_deadline)}
                      </div>
                      <div>
                        <Countdown target={conference.paper_deadline} mode="seconds" />
                      </div>
                    </td>
                    {conference.r1_date ? (
                      <td
                        className={`clickable-cell ${(isSelectedR1 || isChainedR1) ? 'selected-r1-td' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectEvent(conference, 'R1', conference.r1_date)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectEvent(conference, 'R1', conference.r1_date);
                          }
                        }}
                      >
                        <div className={`date-btn${(isSelectedDate(conference.r1_date) || isChainedR1) ? ' selected selected-r1' : ''}`}>
                          {formatShort(conference.r1_date)}
                        </div>
                        <div>
                          <Countdown target={conference.r1_date} mode="days" />
                        </div>
                      </td>
                    ) : (
                      <td>
                        <span className="empty-cell" aria-hidden="true">&nbsp;</span>
                      </td>
                    )}
                      {conference.r2_date ? (
                      <td
                        className={`clickable-cell ${(isSelectedR2 || isChainedR2) ? 'selected-r2-td' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectEvent(conference, 'R2', conference.r2_date)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectEvent(conference, 'R2', conference.r2_date);
                          }
                        }}
                      >
                        <div className={`date-btn${(isSelectedDate(conference.r2_date) || isChainedR2) ? ' selected selected-r2' : ''}`}>
                          {formatShort(conference.r2_date)}
                        </div>
                        <div>
                          <Countdown target={conference.r2_date} mode="days" />
                        </div>
                      </td>
                    ) : (
                      <td>
                        <span className="empty-cell" aria-hidden="true">&nbsp;</span>
                      </td>
                    )}
                    {conference.revision_date ? (
                      <td
                        className={`clickable-cell ${(isSelectedRevision || isChainedRevision) ? 'selected-revision-td' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectEvent(conference, 'Revision', conference.revision_date)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectEvent(conference, 'Revision', conference.revision_date);
                          }
                        }}
                      >
                        <div className={`date-btn${(isSelectedDate(conference.revision_date) || isChainedRevision) ? ' selected selected-revision' : ''}`}>
                          {formatShort(conference.revision_date)}
                        </div>
                      </td>
                    ) : (
                      <td>
                        <span className="empty-cell" aria-hidden="true">&nbsp;</span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
