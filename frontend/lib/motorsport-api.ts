// Client-side (browser) calls only — relative paths, same-origin through the
// existing nginx proxy / next.config.ts rewrite. Mirrors lib/community-api.ts's
// apiFetch pattern. Every call wraps an existing public board-service endpoint
// (board-service/src/motorsport.js); no new API was added for this page.
import {ApiError} from './community-api';
import type {EventKind, MotorsportSeries, MotorsportVenue, PublicEvent, SeriesScope} from './motorsport-types';

export {ApiError};

const BASE = '/api/board/motorsport';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, {credentials: 'same-origin', cache: 'no-store'});
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message || `요청을 처리하지 못했습니다. (${res.status})`, res.status);
  return data as T;
}

// ?from&to(venue-local date range, server defaults to this KST month), up to
// 92 days per call (server limit — the calendar only ever needs one month at
// a time, the home preview up to ~3 months ahead).
export async function fetchEvents(params: {
  from?: string;
  to?: string;
  scope?: SeriesScope | '';
  kind?: EventKind | '';
  series?: string;
  limit?: number;
}): Promise<{from: string; to: string; events: PublicEvent[]}> {
  const query = new URLSearchParams();
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.scope) query.set('scope', params.scope);
  if (params.kind) query.set('kind', params.kind);
  if (params.series) query.set('series', params.series);
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return apiFetch(`${BASE}/events${qs ? `?${qs}` : ''}`);
}

export async function fetchEvent(id: number): Promise<PublicEvent> {
  return apiFetch(`${BASE}/events/${id}`);
}

export async function fetchSeriesList(): Promise<MotorsportSeries[]> {
  return apiFetch(`${BASE}/series`);
}

export async function fetchVenues(): Promise<MotorsportVenue[]> {
  return apiFetch(`${BASE}/venues`);
}
