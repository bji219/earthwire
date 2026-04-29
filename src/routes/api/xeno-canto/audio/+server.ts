import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
  const id = url.searchParams.get('id');
  if (!id) throw error(400, 'Missing id parameter');

  const audioUrl = `https://xeno-canto.org/${id}/download`;

  try {
    const res = await fetch(audioUrl, {
      headers: { 'User-Agent': 'Earthwire/1.0 (https://earthwire.app)' },
    });
    if (!res.ok) throw error(res.status, `Upstream audio fetch failed: ${res.status}`);

    return new Response(res.body, {
      headers: {
        'content-type': res.headers.get('content-type') ?? 'audio/mpeg',
        'cache-control': 'public, max-age=86400',
      },
    });
  } catch (e: any) {
    if (e?.status) throw e;
    throw error(500, e?.message ?? 'Failed to proxy audio');
  }
};
