import { useEffect, useMemo, useState } from 'react';
// CSV fallback removed — use JSON only
import {
  compareIsoDate,
  computeNextAvailableDate,
  isConferenceAvailable,
  isRankIncluded,
  pickEarliestConference
} from '@/lib/deadline';
import { convertJsonToConferences } from '@/lib/json';
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

function formatEventDisplay(start?: string | null, end?: string | null, location?: string | null): string {
  if (!start && !end && !location) return '';
  if (!start && !end) return location ?? '';
  if (!start) return `${location ?? ''}`.trim();
  if (!end || start === end) {
    const d = formatFull(start);
    return `${d}${location ? ` • ${location}` : ''}`;
  }
  const s = formatShort(start);
  const e = formatShort(end);
  return `${s}–${e}${location ? ` • ${location}` : ''}`;
}

function getEventDisplay(conf: Pick<Conference, 'event_start' | 'event_end' | 'location'>): string {
  return formatEventDisplay(conf.event_start, conf.event_end, conf.location);
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
        // Load JSON only (no CSV fallback)
        const resp = await fetch('/conference.json');
        if (!resp.ok) throw new Error('Failed to load conference.json.');
        const json = await resp.json();
        const parsed = convertJsonToConferences(json);
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

  // Active selection: prefer explicit `selection`, otherwise use last chained selection
  const activeSelection = useMemo(() => {
    if (selection.selectedConference) return selection;
    if (selectionChain.length > 0) return selectionChain[selectionChain.length - 1];
    return INITIAL_SELECTION;
  }, [selection, selectionChain]);

  // Compute selectedConference from the active selection so that availability
  // coloring persists even when the explicit selection was cleared.
  const activeSelectedConference = useMemo(() => {
    if (!activeSelection || !activeSelection.selectedConference) return null;
    return conferences.find((c) => c.id === activeSelection.selectedConference) ?? null;
  }, [conferences, activeSelection]);

  const availableConferences = useMemo(() => {
    return conferences
      .filter((conference) => isRankIncluded(conference.rank, rankFilter))
      .filter((conference) => isConferenceAvailable(conference, activeSelectedConference, activeSelection));
  }, [conferences, rankFilter, activeSelectedConference, activeSelection]);

  const displayedConferences = useMemo(() => {
    // Keep conferences selected in order (the selection chain) at the front.
    // Ensure each conference appears only once even if selected multiple times.
    const chainConfs: Conference[] = [];
    const seen = new Set<string>();
    for (const s of selectionChain) {
      if (!s.selectedConference) continue;
      const conf = conferences.find((c) => c.id === s.selectedConference);
      if (conf && !seen.has(conf.id)) {
        seen.add(conf.id);
        chainConfs.push(conf);
      }
    }

    const chainIds = seen;

    const rest = availableConferences.filter((c) => !chainIds.has(c.id));
    return [...chainConfs, ...rest];
  }, [availableConferences, selectionChain, conferences]);

  const earliestConference = useMemo(() => pickEarliestConference(availableConferences), [availableConferences]);

  const nextAvailableDate = useMemo(() => {
    if (!activeSelectedConference) {
      return null;
    }
    return computeNextAvailableDate(activeSelectedConference, activeSelection);
  }, [activeSelectedConference, activeSelection]);

  function selectEvent(conference: Conference, type: SelectionType, date: string) {
    setSelection({
      selectedConference: conference.id,
      selectedDate: date,
      selectedType: type
    });
    setSelectionChain((prev) => {
      // Replace any existing entry for the same conference so only one date-per-row is kept
      // Additionally, when the user selects a new `submit`, convert the previous
      // `submit` entry (if any) into a chained rejection entry (R2) so its
      // notification date is shown in red on the next screen.
      let filtered = prev.filter((s) => s.selectedConference !== conference.id);
      // find the previous submit (if any) and convert it to an R2/chained entry
      const prevSubmit = prev.find((s) => s.selectedType === 'submit' && s.selectedConference !== conference.id);
      if (prevSubmit) {
        const prevConf = conferences.find((c) => c.id === prevSubmit.selectedConference);
        if (prevConf) {
          // Decide whether the previous submit should be recorded as an R1 (early reject)
          // or R2 (notification) based on why the new conference is selectable.
          // If the clicked target is selectable because its submission is on/after
          // prevConf.r2_date, consider it a R2 (green) case; otherwise if it's on/after
          // prevConf.r1_date treat as R1 (yellow).
          let chosenType: SelectionType = 'R2';
          let chosenDate = prevConf.r2_date ?? prevConf.revision_date ?? prevConf.r1_date ?? prevConf.paper_deadline ?? '';
          try {
            const hasTargetPaper = Boolean(conference.paper_deadline);
            const prevR2 = prevConf.r2_date;
            const prevR1 = prevConf.r1_date;
            let availableIfR2 = false;
            let availableIfR1 = false;
            if (hasTargetPaper && prevR2) {
              availableIfR2 = compareIsoDate(conference.paper_deadline, prevR2) >= 0;
            }
            if (hasTargetPaper && prevR1) {
              availableIfR1 = compareIsoDate(conference.paper_deadline, prevR1) >= 0;
            }
            if (availableIfR2) {
              chosenType = 'R2';
              chosenDate = prevR2;
            } else if (availableIfR1) {
              chosenType = 'R1';
              chosenDate = prevR1;
            }
          } catch (e) {
            // fall back to defaults above
          }

          // remove any existing entries for that conference, then add chosen entry
          filtered = filtered.filter((s) => s.selectedConference !== prevConf.id);
          if (chosenDate) {
            filtered.push({ selectedConference: prevConf.id, selectedDate: chosenDate, selectedType: chosenType });
          }
        }
      }
      // ensure no lingering submit entries remain (keep only the new submit when adding)
      filtered = filtered.filter((s) => s.selectedType !== 'submit');
      // If the user selected an older date, remove any chained entries whose
      // dates are strictly later than this selection to avoid ordering inversions.
      if (date) {
        try {
          filtered = filtered.filter((s) => {
            if (!s.selectedDate) return true;
            try {
              return compareIsoDate(s.selectedDate, date) <= 0;
            } catch (e) {
              return true;
            }
          });
        } catch (e) {
          // ignore
        }
      }
      const last = filtered[filtered.length - 1];
      if (last && last.selectedConference === conference.id && last.selectedDate === date && last.selectedType === type) {
        return filtered;
      }
      return [...filtered, { selectedConference: conference.id, selectedDate: date, selectedType: type }];
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
          Visualize next conferences you can submit to after rejection
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
                <th aria-hidden="true"></th>
              </tr>
            </thead>
            <tbody>
              {displayedConferences.map((conference) => {
                const hasRejectable = Boolean(conference.r1_date || conference.r2_date || conference.revision_date);
                const isEarliest = earliestConference?.id === conference.id;
                const isSelectedDate = (date: string) =>
                  selection.selectedConference === conference.id && selection.selectedDate === date;
                const isSelectedSubmit = selection.selectedConference === conference.id && selection.selectedDate === conference.paper_deadline && selection.selectedType === 'submit';
                const isSelectedR1 = selection.selectedConference === conference.id && selection.selectedDate === conference.r1_date && selection.selectedType === 'R1';
                const isSelectedR2 = selection.selectedConference === conference.id && selection.selectedDate === conference.r2_date && selection.selectedType === 'R2';
                const isSelectedRevision = selection.selectedConference === conference.id && selection.selectedDate === conference.revision_date && selection.selectedType === 'Revision';
                // Check if the same conference/date/type exists in the chain (so past selections keep red framing)
                const isChainedR1 = selectionChain.some((s) => s.selectedConference === conference.id && s.selectedDate === conference.r1_date && s.selectedType === 'R1');
                const isChainedR2 = selectionChain.some((s) => s.selectedConference === conference.id && s.selectedDate === conference.r2_date && s.selectedType === 'R2');
                const isChainedRevision = selectionChain.some((s) => s.selectedConference === conference.id && s.selectedDate === conference.revision_date && s.selectedType === 'Revision');
                const isChainedSubmit = selectionChain.some((s) => s.selectedConference === conference.id && s.selectedDate === conference.paper_deadline && s.selectedType === 'submit');

                // Determine row state classes
                const available = isConferenceAvailable(conference, selectedConference, selection);
                const classes = [isEarliest ? 'earliest' : ''];
                // Always add the tiled-row class
                classes.push('tiled-row');
                // Keep chain conferences visible as selected
                const isChainOrSelected = selection.selectedConference === conference.id || Boolean(selectionChain.find((s) => s.selectedConference === conference.id));
                if (isChainOrSelected) classes.push('selected-conf');

                // Apply a light cyan background to idle rows when there is no active
                // selection and the row is NOT part of the selection chain. This
                // prevents chain rows from appearing idle when the active selection
                // was cleared (e.g., after deleting the last chained item).
                const isIdle = !selection.selectedConference && !isChainOrSelected;
                if (isIdle) classes.push('idle-row');

                // Predictively compute availability for R1 / R2 based on the SELECTED conference
                // Green (available-r2): conferences whose submission deadline is after the
                // selected conference's Notification (R2) date (or the selected R2 date if user clicked one).
                // Yellow (available-r1): only when the selected conference has an Early Reject (R1)
                // date (or the user selected an R1 date), and the target's submission deadline
                // is on/after that R1 date.
                let availableIfR1 = false;
                let availableIfR2 = false;
                const selR1 = activeSelectedConference ? (activeSelection.selectedType === 'R1' && activeSelection.selectedDate ? activeSelection.selectedDate : activeSelectedConference.r1_date) : null;
                const selR2 = activeSelectedConference ? (activeSelection.selectedType === 'R2' && activeSelection.selectedDate ? activeSelection.selectedDate : activeSelectedConference.r2_date) : null;
                try {
                  if (selR1) {
                    availableIfR1 = compareIsoDate(conference.paper_deadline, selR1) >= 0;
                  }
                } catch (e) {
                  availableIfR1 = false;
                }
                try {
                  if (selR2) {
                    availableIfR2 = compareIsoDate(conference.paper_deadline, selR2) >= 0;
                  }
                } catch (e) {
                  availableIfR2 = false;
                }
                const selHasR1 = Boolean(activeSelectedConference && (activeSelectedConference.r1_date || activeSelection.selectedType === 'R1'));
                const selHasR2 = Boolean(activeSelectedConference && (activeSelectedConference.r2_date || activeSelection.selectedType === 'R2'));
                // Do not mark the currently-selected or chained rows as "available" —
                // that would be visually contradictory (a selected row shouldn't also
                // appear as a candidate to submit to itself).
                if (!isChainOrSelected) {
                  if (selHasR1 && availableIfR1) classes.push('available-r1');
                  if (selHasR2 && availableIfR2) classes.push('available-r2');
                }

                const rowClass = classes.filter(Boolean).join(' ');

                return (
                  <tr key={conference.id} className={rowClass}>
                    <td>
                      <div className="name-container">
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
                        {getEventDisplay(conference) ? (
                          <div className="event-info">{getEventDisplay(conference)}</div>
                        ) : null}
                      </div>
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
                      className={`clickable-cell ${(isSelectedSubmit || isChainedSubmit) ? 'selected-submit-td' : ''}`}
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
                    <td className="chain-action-cell">
                      {isChainOrSelected ? (
                        <button
                          type="button"
                          title="Remove from chain"
                          className="chain-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            // remove this conference from the selection chain and then
                            // make the last chained item the active explicit selection
                            setSelectionChain((prev) => {
                              const newChain = prev.filter((s) => s.selectedConference !== conference.id);
                              if (selection.selectedConference === conference.id) {
                                if (newChain.length > 0) {
                                  const last = newChain[newChain.length - 1];
                                  setSelection({
                                    selectedConference: last.selectedConference,
                                    selectedDate: last.selectedDate,
                                    selectedType: last.selectedType
                                  });
                                } else {
                                  setSelection(INITIAL_SELECTION);
                                }
                              }
                              return newChain;
                            });
                          }}
                        >
                          ×
                        </button>
                      ) : null}
                    </td>
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
