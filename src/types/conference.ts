export type Rank = 'A*' | 'A' | 'B' | 'C';
export type SelectionType = 'submit' | 'R1' | 'R2' | 'Revision';
export type RankFilter = 'no_filter' | 'c_or_higher' | 'b_or_higher' | 'a_or_higher' | 'a_star_only';

export type Conference = {
  id: string;
  name: string;
  rank?: Rank;
  area: string;
  location: string;
  url: string;
  paper_deadline: string;
  abstract_deadline?: string;
  r1_date: string;
  r2_date: string;
  revision_date: string;
  camera_ready?: string;
  event_start: string;
  event_end: string;
  estimated?: boolean;
};

export type SelectionState = {
  selectedConference: string | null;
  selectedDate: string | null;
  selectedType: SelectionType | null;
};
