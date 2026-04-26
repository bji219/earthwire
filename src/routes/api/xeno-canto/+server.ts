// src/routes/api/xeno-canto/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const BASE = 'https://xeno-canto.org/api/2/recordings';

export const GET: RequestHandler = async ({ url }) => {
  const query    = url.searchParams.get('q') ?? '';
  const quality  = url.searchParams.get('quality') ?? '';
  const len      = url.searchParams.get('len') ?? '';
  const country  = url.searchParams.get('country') ?? '';
  const page     = url.searchParams.get('page') ?? '1';

  let q = query;
  if (quality) q += ` q:${quality}`;
  if (country) q += ` cnt:${country}`;
  if (len)     q += ` len:${len}`;

  const params = new URLSearchParams({ query: q, page });

  try {
    const res = await fetch(`${BASE}?${params}`);
    if (!res.ok) throw error(res.status, 'Xeno-canto API error');
    const data = await res.json();
    return json(data);
  } catch (e: any) {
    if (e?.status) throw e;
    throw error(500, e?.message ?? 'Failed to fetch Xeno-canto');
  }
};
