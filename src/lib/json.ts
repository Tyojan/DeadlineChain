import { Conference } from '@/types/conference';

function pickDate(...candidates: Array<string | undefined>): string | null {
  for (const d of candidates) {
    if (d && d.trim()) return d;
  }
  return null;
}

export function convertJsonToConferences(raw: any): Conference[] {
  if (!raw || !Array.isArray(raw.conferences)) return [];

  const out: Conference[] = [];

  for (const item of raw.conferences) {
    try {
      const paper_deadline = pickDate(item.deadlines?.paper, item.deadlines?.paper_deadline);
      const abstract_deadline = pickDate(item.deadlines?.abstract, item.deadlines?.abstract_deadline);
      if (!paper_deadline) continue; // 紙の締切が無ければ一覧に出さない

      const r1_date = pickDate(item.deadlines?.early_reject, item.deadlines?.r1_date);
      const r2_date = pickDate(item.deadlines?.r2_date, item.deadlines?.notification);
      const revision_date = pickDate(item.deadlines?.rebuttal_start, item.deadlines?.rebuttal);

      const event_start = item.event?.start || item.event?.date || '';
      const event_end = item.event?.end || item.event?.date || '';

      const id = item.id ?? item.name ?? String(Math.random());

      function parseEstimated(v: any): boolean {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') return ['1', 'true', 'yes', 'y'].includes(v.toLowerCase());
        return false;
      }

      const conf: Conference = {
        id: id,
        name: item.name ?? item.id ?? 'Unknown',
        rank: item.rank && ['A*', 'A', 'B', 'C'].includes(item.rank) ? (item.rank as any) : undefined,
        area: item.area ?? '',
        location: item.location ?? '',
        url: item.url ?? item.cfp ?? '',
        paper_deadline: paper_deadline,
        abstract_deadline: abstract_deadline ?? '',
        r1_date: r1_date ?? '',
        r2_date: r2_date ?? '',
        revision_date: revision_date ?? '',
        camera_ready: item.deadlines?.camera_ready ?? '',
        estimated: typeof item.estimated !== 'undefined' ? parseEstimated(item.estimated) : false,
        event_start: event_start,
        event_end: event_end
      };

      out.push(conf);
    } catch (e) {
      // 変換中の個別エラーはその会議をスキップする
      continue;
    }
  }

  return out.sort((a, b) => (a.paper_deadline < b.paper_deadline ? -1 : a.paper_deadline > b.paper_deadline ? 1 : 0));
}
