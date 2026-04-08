// app/api/roblox/catalog/route.ts
import { NextResponse } from 'next/server';

const ROBLOX_CATALOG_URL =
  'https://catalog.roblox.com/v1/search/items/details';
const ROBLOX_THUMBNAILS_URL = 'https://thumbnails.roblox.com/v1/assets';

type RobloxCatalogItem = {
  id: number;
  name: string;
  creatorName?: string;
  thumbnailUrl?: string | null;
  // keep extra fields without TS complaining
  [key: string]: any;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword') ?? '';
    let limit = searchParams.get('limit') ?? '30';

    // Roblox only allows 10, 28, or 30 for Limit – clamp to 30 if bad
    if (!['10', '28', '30'].includes(limit)) {
      limit = '30';
    }

    // 1) Call Roblox catalog search (details) to get ids + names
    const queryParts = [`Limit=${encodeURIComponent(limit)}`];

    if (keyword.trim().length > 0) {
      queryParts.push(`Keyword=${encodeURIComponent(keyword.trim())}`);
    }

    const catalogUrl = `${ROBLOX_CATALOG_URL}?${queryParts.join('&')}`;

    const catalogRes = await fetch(catalogUrl, {
      cache: 'no-store',
    });

    if (!catalogRes.ok) {
      const body = await catalogRes.text();
      console.error('Roblox catalog API error:', catalogRes.status, body);
      return NextResponse.json(
        { error: 'Failed to fetch from Roblox catalog' },
        { status: 500 },
      );
    }

    const catalogData = await catalogRes.json();

    const items: RobloxCatalogItem[] = catalogData.data ?? [];

    // 2) Thumbnails API to get images for all assetIds
    if (items.length > 0) {
      const assetIds = items
        .map((item) => item.id)
        .filter((id) => typeof id === 'number' || typeof id === 'string');

      if (assetIds.length > 0) {
        const thumbParams = new URLSearchParams();
        for (const id of assetIds) {
          thumbParams.append('assetIds', String(id));
        }
        thumbParams.set('returnPolicy', 'PlaceHolder');
        thumbParams.set('size', '150x150');
        thumbParams.set('format', 'Png');
        thumbParams.set('isCircular', 'false');

        const thumbUrl = `${ROBLOX_THUMBNAILS_URL}?${thumbParams.toString()}`;

        const thumbRes = await fetch(thumbUrl, {
          cache: 'no-store',
        });

        if (thumbRes.ok) {
          const thumbData = await thumbRes.json();

          type ThumbEntry = {
            targetId?: number;
            imageUrl?: string;
          };

          const thumbMap = new Map<number, string>();

          for (const t of (thumbData.data as ThumbEntry[]) ?? []) {
            if (t.targetId && t.imageUrl) {
              thumbMap.set(Number(t.targetId), t.imageUrl);
            }
          }

          // attach thumbnailUrl onto each item
          for (const item of items) {
            const thumb = thumbMap.get(Number(item.id));
            item.thumbnailUrl = thumb ?? null;
          }
        } else {
          console.warn(
            'Roblox thumbnails API error:',
            thumbRes.status,
            await thumbRes.text(),
          );
        }
      }
    }

    // return same structure, but with thumbnailUrl added
    return NextResponse.json({
      ...catalogData,
      data: items,
    });
  } catch (err) {
    console.error('Internal error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
