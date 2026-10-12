// Public /motorsport pages — types for board-service's public
// /api/board/motorsport/* (motorsport.js). Mirrors the admin-only shapes in
// lib/admin-motorsport.ts, trimmed to what the public endpoints actually
// return (no publication/audit columns).
export type EventKind = 'RACE' | 'TRACK_DAY' | 'EVENT';
export type EventStatus = 'SCHEDULED' | 'TENTATIVE' | 'CHANGED' | 'CANCELLED';
export type SeriesScope = 'DOMESTIC' | 'INTERNATIONAL';

export const KIND_LABELS: Record<EventKind, string> = {RACE: '경기', TRACK_DAY: '스포츠주행', EVENT: '행사'};
export const STATUS_LABELS: Record<EventStatus, string> = {
  SCHEDULED: '예정대로',
  TENTATIVE: '일정 잠정',
  CHANGED: '일정 변경',
  CANCELLED: '취소',
};
export const SCOPE_LABELS: Record<SeriesScope, string> = {DOMESTIC: '국내', INTERNATIONAL: '해외'};

// Date-based phase (today vs startsOn/endsOn), separate from the server's
// `status` (which is about schedule reliability, not timing). Computed on the
// client with lib/motorsport.ts's eventPhase().
export type EventPhase = 'upcoming' | 'ongoing' | 'ended';
export const PHASE_LABELS: Record<EventPhase, string> = {upcoming: '예정', ongoing: '진행 중', ended: '종료'};

export type EventSeries = {id: number; code: string; name: string; scope: SeriesScope};
export type EventVenue = {
  id: number;
  name: string;
  country: string;
  region: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
};

// Dates are venue-local YYYY-MM-DD; startsAt is a UTC ISO string or null
// (only set when the organizer published a time, not just a date).
export type PublicEvent = {
  id: number;
  kind: EventKind;
  title: string;
  startsOn: string;
  endsOn: string;
  startsAt: string | null;
  status: EventStatus;
  sourceUrl: string;
  sourceName: string;
  verifiedOn: string;
  note: string | null;
  series: EventSeries | null;
  venue: EventVenue;
  linkedPostCount: number;
};

export type MotorsportSeries = {id: number; code: string; name: string; scope: SeriesScope; officialUrl: string | null; active: boolean};
export type MotorsportVenue = {
  id: number;
  name: string;
  country: string;
  region: string | null;
  timezone: string;
  officialUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
};
