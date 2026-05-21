// src/routes/api/xeno-canto/+server.ts
import { json, error } from '@sveltejs/kit';
import { XENO_CANTO_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const BASE = 'https://xeno-canto.org/api/3/recordings';

export const GET: RequestHandler = async ({ url }) => {
  if (!XENO_CANTO_KEY) {
    throw error(503, 'Xeno-canto API key not configured. Add XENO_CANTO_KEY to your .env file — get one at xeno-canto.org/account');
  }

  const query   = url.searchParams.get('q') ?? '';
  const quality = url.searchParams.get('quality') ?? '';
  const len     = url.searchParams.get('len') ?? '';
  const country = url.searchParams.get('country') ?? '';
  const type    = url.searchParams.get('type') ?? '';
  const page    = url.searchParams.get('page') ?? '1';

  // v3 API requires tagged queries. Prefix each bare word with en: so users
  // can search by common name. Multi-word: "hawk eagle" → "en:hawk en:eagle".
  let q: string;
  if (query.includes(':')) {
    q = query;
  } else {
    const words = query.trim().split(/\s+/).filter(Boolean);
    q = words.map(w => `en:${w}`).join(' ');
  }
  if (quality) q += ` q:${quality}`;
  if (country) q += ` cnt:${country}`;
  if (len)     q += ` len:${len}`;
  if (type)    q += type.includes(' ') ? ` type:"${type}"` : ` type:${type}`;

  const params = new URLSearchParams({ key: XENO_CANTO_KEY, query: q, page });

  try {
    const res = await fetch(`${BASE}?${params}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      throw error(res.ok ? 400 : res.status, body?.message ?? 'Xeno-canto API error');
    }
    return json(body);
  } catch (e: any) {
    if (e?.status) throw e;
    throw error(500, e?.message ?? 'Failed to fetch Xeno-canto');
  }
};
