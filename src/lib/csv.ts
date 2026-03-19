import { Conference, Rank } from '@/types/conference';

const REQUIRED_FIELDS: Array<keyof Conference> = [
  'id',
  'name',
  'rank',
  'area',
  'location',
  'url',
  'paper_deadline',
  'r1_date',
  'r2_date',
  'revision_date',
  'event_start',
  'event_end'
];

const RANKS: Rank[] = ['A*', 'A', 'B', 'C'];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseConferenceRow(header: string[], row: string): Conference {
  const values = parseCsvLine(row);
  const raw = Object.fromEntries(header.map((key, i) => [key, values[i] ?? ''])) as Record<string, string>;

  for (const field of REQUIRED_FIELDS) {
    if (!raw[field]) {
      throw new Error(`必須項目が不足しています: ${field}`);
    }
  }

  if (!RANKS.includes(raw.rank as Rank)) {
    throw new Error(`rank が不正です: ${raw.rank}`);
  }

  const dateFields: Array<keyof Conference> = [
    'paper_deadline',
    'r1_date',
    'r2_date',
    'revision_date',
    'event_start',
    'event_end'
  ];

  for (const field of dateFields) {
    if (!isIsoDate(raw[field])) {
      throw new Error(`${field} は YYYY-MM-DD 形式である必要があります: ${raw[field]}`);
    }
  }

  if (raw.camera_ready && !isIsoDate(raw.camera_ready)) {
    throw new Error(`camera_ready は YYYY-MM-DD 形式である必要があります: ${raw.camera_ready}`);
  }

  return {
    id: raw.id,
    name: raw.name,
    rank: raw.rank as Rank,
    area: raw.area,
    location: raw.location,
    url: raw.url,
    paper_deadline: raw.paper_deadline,
    r1_date: raw.r1_date,
    r2_date: raw.r2_date,
    revision_date: raw.revision_date,
    camera_ready: raw.camera_ready || undefined,
    event_start: raw.event_start,
    event_end: raw.event_end
  };
}

export function parseConferenceCsv(csvText: string): Conference[] {
  const rows = csvText
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);

  if (rows.length < 2) {
    return [];
  }

  const header = parseCsvLine(rows[0]);
  return rows.slice(1).map((row) => parseConferenceRow(header, row));
}
