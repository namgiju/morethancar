// Client-side (browser) calls only — mirrors lib/motorsport-api.ts's
// apiFetch pattern. Every call wraps board-service's public
// /api/board/spots/* (board-service/src/spots.js).
import {ApiError} from './community-api';
import type {PublicSpot, SpotCategory} from './spots-types';

export {ApiError};

const BASE = '/api/board/spots';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, {credentials: 'same-origin', cache: 'no-store'});
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message || `요청을 처리하지 못했습니다. (${res.status})`, res.status);
  return data as T;
}

export type Bbox = {swLat: number; swLng: number; neLat: number; neLng: number};

// bbox가 없으면 조건에 맞는 공개 스팟 전체(최대 200개)를 돌려준다. 지도 패널은 이동할 때마다
// 보이는 영역만 bbox로 다시 불러오고, 목록·"내 주변 찾기"는 bbox 없이 전체를 받아 브라우저에서
// Haversine 거리로 정렬한다(규모가 작아 서버 반경 검색 없이도 충분하다).
export async function fetchSpots(params: {
  category?: SpotCategory | '';
  region?: string;
  q?: string;
  bbox?: Bbox;
  limit?: number;
}): Promise<{spots: PublicSpot[]}> {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.region) query.set('region', params.region);
  if (params.q) query.set('q', params.q);
  if (params.bbox) query.set('bbox', `${params.bbox.swLat},${params.bbox.swLng},${params.bbox.neLat},${params.bbox.neLng}`);
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return apiFetch(`${BASE}${qs ? `?${qs}` : ''}`);
}

export async function fetchSpot(id: number): Promise<PublicSpot> {
  return apiFetch(`${BASE}/${id}`);
}
