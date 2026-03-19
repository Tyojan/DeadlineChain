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
  return `${month}-${day}`;
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
  const [rankFilter, setRankFilter] = useState<RankFilter>('no_filter');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadCsv() {
      try {
        // まず JSON を優先して読み込む
        const tryJson = await fetch('/conference.json').catch(() => null);
        if (tryJson && tryJson.ok) {
          const json = await tryJson.json();
          // try to also fetch CSV to fill missing metadata (rank/url)
          let csvLookup: Record<string, { rank?: string; url?: string }> | undefined = undefined;
          try {
            const csvResp = await fetch('/conferences.csv');
            if (csvResp && csvResp.ok) {
              const csvText = await csvResp.text();
              const parsedCsv = parseConferenceCsv(csvText);
              csvLookup = Object.fromEntries(parsedCsv.map((c) => [c.id, { rank: c.rank, url: c.url }]));
            }
          } catch (e) {
            // ignore CSV fetch/parse errors — JSON will still be used
            csvLookup = undefined;
          }

          // convertJsonToConferences を動的取り込みして依存を最小化
          const { convertJsonToConferences } = await import('@/lib/json');
          const parsed = convertJsonToConferences(json, csvLookup);
          setConferences(parsed);
          setErrorMessage(null);
          return;
        }

        // JSON が無ければ既存の CSV をフォールバックで読み込む
        const response = await fetch('/conferences.csv');
        if (!response.ok) {
          throw new Error('conferences.csv の読み込みに失敗しました。');
        }

        const text = await response.text();
        const parsed = parseConferenceCsv(text).sort((a, b) => compareIsoDate(a.paper_deadline, b.paper_deadline));
        setConferences(parsed);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'データ読み込み中にエラーが発生しました。');
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
    if (!selectedConference) {
      return availableConferences;
    }

    const otherConferences = availableConferences.filter((conference) => conference.id !== selectedConference.id);
    return [selectedConference, ...otherConferences];
  }, [availableConferences, selectedConference]);

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
  }

  function resetSelection() {
    setSelection(INITIAL_SELECTION);
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
          title="クリックで選択を解除"
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
          title="クリックで選択を解除"
        >
          リジェクト後に次に投稿可能な会議を可視化
        </p>

        <div className="controls">
          <label htmlFor="rank-filter">ランク:</label>
          <select
            id="rank-filter"
            value={rankFilter}
            onChange={(event) => setRankFilter(event.target.value as RankFilter)}
          >
            <option value="no_filter">ランク指定なし（全表示）</option>
            <option value="a_star_only">A*のみ</option>
            <option value="a_or_higher">A以上</option>
            <option value="b_or_higher">B以上</option>
            <option value="c_or_higher">C以上</option>
          </select>

          <button type="button" onClick={() => setSelection(INITIAL_SELECTION)}>
            選択を解除
          </button>
        </div>

        <div className="status">
          <p>
            選択: {selection.selectedConference ?? '-'} / {selectionTypeLabel(selection.selectedType)} / {selection.selectedDate ?? '-'}
          </p>
          <p>次に投稿可能な日: {nextAvailableDate ?? '-'}</p>
        </div>

        {errorMessage && <p className="error">{errorMessage}</p>}

        <div className="table-wrap">
          <table>
            <thead>
                <tr>
                <th>会議名</th>
                <th>rank</th>
                <th>Abstract Deadline</th>
                <th>Submission deadline</th>
                <th>Early Reject Notification</th>
                <th>Notification</th>
                <th>Revision</th>
              </tr>
            </thead>
            <tbody>
              {displayedConferences.map((conference) => {
                const isEarliest = earliestConference?.id === conference.id;
                const isSelectedDate = (date: string) =>
                  selection.selectedConference === conference.id && selection.selectedDate === date;

                // 行の状態クラスを決定
                const available = isConferenceAvailable(conference, selectedConference, selection);
                const classes = [isEarliest ? 'earliest' : ''];
                // 常にタイル表示クラスを付与
                classes.push('tiled-row');
                if (selection.selectedConference === conference.id) classes.push('selected-conf');

                // 予測的に、R1 / R2 の場合にその会議が利用可能かを計算して表示用クラスを付与
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
                            // 外部ページへ飛ぶので選択は解除しておく
                            resetSelection();
                          }}
                        >
                          {conference.name}
                        </a>
                      ) : (
                        <button type="button" className="name-btn" onClick={() => setSelection(INITIAL_SELECTION)}>
                          {conference.name}
                        </button>
                      )}
                    </td>
                    <td>{conference.rank ?? '-'}</td>
                    <td>
                      {conference.abstract_deadline ? (
                        <span className="abstract-cell">{conference.abstract_deadline}</span>
                      ) : (
                        <span className="empty-cell" aria-hidden="true">&nbsp;</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`date-btn${isSelectedDate(conference.paper_deadline) ? ' selected' : ''}`}
                        onClick={() => selectEvent(conference, 'submit', conference.paper_deadline)}
                      >
                        {conference.paper_deadline}
                      </button>
                    </td>
                    <td>
                      {conference.r1_date ? (
                        <button
                          type="button"
                          className={`date-btn${isSelectedDate(conference.r1_date) ? ' selected' : ''}`}
                          onClick={() => selectEvent(conference, 'R1', conference.r1_date)}
                        >
                          {formatShort(conference.r1_date)}
                        </button>
                      ) : (
                        <span className="empty-cell" aria-hidden="true">&nbsp;</span>
                      )}
                    </td>
                    <td>
                      {conference.r2_date ? (
                        <button
                          type="button"
                          className={`date-btn${isSelectedDate(conference.r2_date) ? ' selected' : ''}`}
                          onClick={() => selectEvent(conference, 'R2', conference.r2_date)}
                        >
                          {formatShort(conference.r2_date)}
                        </button>
                      ) : (
                        <span className="empty-cell" aria-hidden="true">&nbsp;</span>
                      )}
                    </td>
                    <td>
                      {conference.revision_date ? (
                        <button
                          type="button"
                          className={`date-btn${isSelectedDate(conference.revision_date) ? ' selected' : ''}`}
                          onClick={() => selectEvent(conference, 'Revision', conference.revision_date)}
                        >
                          {formatShort(conference.revision_date)}
                        </button>
                      ) : (
                        <span className="empty-cell" aria-hidden="true">&nbsp;</span>
                      )}
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
