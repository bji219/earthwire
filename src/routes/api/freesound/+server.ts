// src/routes/api/freesound/+server.ts
import { json, error } from '@sveltejs/kit';
import { FREESOUND_CLIENT_ID } from '$env/static/private';
import type { RequestHandler } from './$types';

const SEARCH_BASE = 'https://freesound.org/apiv2/search/text/';

export const GET: RequestHandler = async ({ url }) => {
  const action = url.searchParams.get('action') ?? 'search';

  const clientId = FREESOUND_CLIENT_ID ?? '';

  if (action === 'search' && !clientId) {
    throw error(503, 'Freesound API key not configured. Add FREESOUND_CLIENT_ID to your .env file — get one at freesound.org/apiv2/apply/');
  }

  if (action === 'search') {
    const query   = url.searchParams.get('q') ?? '';
    const maxLen  = url.searchParams.get('max_duration') ?? '';
    const cc0Only = url.searchParams.get('cc0') === '1';
    const page    = url.searchParams.get('page') ?? '1';

    const params = new URLSearchParams({
      query,
      token: clientId,
      fields: 'id,name,duration,license,previews,username,url',
      page_size: '20',
      page,
    });

    if (maxLen) params.set('filter', `duration:[0 TO ${maxLen}]`);
    if (cc0Only) {
      const existing = params.get('filter') ?? '';
      params.set('filter', `${existing} license:("Creative Commons 0")`.trim());
    }

    try {
      const res = await fetch(`${SEARCH_BASE}?${params}`);
      if (!res.ok) throw error(res.status, 'Freesound search error');
      return json(await res.json());
    } catch (e: any) {
      if (e?.status) throw e;
      throw error(500, e?.message ?? 'Freesound search failed');
    }
  }

  if (action === 'download') {
    const previewUrl = url.searchParams.get('url') ?? '';
    if (!previewUrl.startsWith('https://cdn.freesound.org/')) {
      throw error(400, 'Invalid preview URL');
    }
    try {
      const res = await fetch(previewUrl);
      if (!res.ok) throw error(res.status, 'Preview fetch failed');
      const bytes = await res.arrayBuffer();
      return new Response(bytes, {
        headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'audio/mpeg' },
      });
    } catch (e: any) {
      if (e?.status) throw e;
      throw error(500, e?.message ?? 'Download failed');
    }
  }

  throw error(400, 'Unknown action');
};
