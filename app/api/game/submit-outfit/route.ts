/**
 * app/api/game/submit-outfit/route.ts
 *
 * Receives outfit submissions from the Roblox game.
 * The game sends full item data (name, price) so we don't need to
 * re-fetch from the flaky Roblox Economy API. We only fetch
 * web-compatible thumbnail URLs since the game uses rbxthumb:// URIs.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  fetchAssetThumbnails,
  type CategoryKey,
} from '@/lib/roblox';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GameItem = {
  id: number;
  name?: string;
  price?: number | null;
  thumbnailUrl?: string;
};

type GameItemsMap = Partial<Record<CategoryKey, GameItem | number | null>>;

const VALID_CATEGORIES: CategoryKey[] = [
  'hat', 'hair', 'face', 'shirt', 'pants', 'shoes', 'accessory1', 'accessory2',
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateRequest(
  body: unknown,
): { valid: true; data: { apiKey: string; robloxUserId: number; robloxUsername: string; outfitName?: string; items: GameItemsMap } } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.apiKey !== 'string' || b.apiKey.trim().length === 0) {
    return { valid: false, error: 'Missing or invalid apiKey.' };
  }
  if (typeof b.robloxUserId !== 'number' || b.robloxUserId <= 0) {
    return { valid: false, error: 'Missing or invalid robloxUserId.' };
  }
  if (typeof b.robloxUsername !== 'string' || b.robloxUsername.trim().length === 0) {
    return { valid: false, error: 'Missing or invalid robloxUsername.' };
  }
  if (!b.items || typeof b.items !== 'object') {
    return { valid: false, error: 'Missing or invalid items object.' };
  }

  const items = b.items as Record<string, unknown>;

  for (const key of Object.keys(items)) {
    if (!VALID_CATEGORIES.includes(key as CategoryKey)) {
      return { valid: false, error: `Invalid item category: "${key}".` };
    }
  }

  // Items can be either numbers (old format) or objects (new format with name/price)
  let hasAtLeastOneItem = false;
  for (const [, value] of Object.entries(items)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' && value > 0) {
      hasAtLeastOneItem = true;
    } else if (typeof value === 'object' && value !== null && typeof (value as GameItem).id === 'number') {
      hasAtLeastOneItem = true;
    }
  }

  if (!hasAtLeastOneItem) {
    return { valid: false, error: 'Outfit must contain at least one item.' };
  }

  return {
    valid: true,
    data: {
      apiKey: b.apiKey as string,
      robloxUserId: b.robloxUserId as number,
      robloxUsername: (b.robloxUsername as string).trim(),
      outfitName:
        typeof b.outfitName === 'string' && b.outfitName.trim().length > 0
          ? b.outfitName.trim()
          : undefined,
      items: items as GameItemsMap,
    },
  };
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const validation = validateRequest(body);

    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 },
      );
    }

    const { apiKey, robloxUserId, robloxUsername, outfitName, items } =
      validation.data;

    // --- Authenticate ---
    const expectedKey = process.env.GAME_API_KEY;
    if (!expectedKey) {
      console.error('[game/submit-outfit] GAME_API_KEY not set.');
      return NextResponse.json(
        { success: false, error: 'Server configuration error.' },
        { status: 500 },
      );
    }
    if (apiKey !== expectedKey) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key.' },
        { status: 401 },
      );
    }

    // --- Find or create user ---
    let user = await prisma.user.findFirst({
      where: { robloxUserId: robloxUserId },
    });

    if (!user) {
      user = await prisma.user.findUnique({
        where: { username: robloxUsername },
      });

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { robloxUserId },
        });
      } else {
        user = await prisma.user.create({
          data: {
            username: robloxUsername,
            password: `roblox_${robloxUserId}_${Date.now()}`,
            robloxUserId,
          },
        });
      }
    }

    // --- Build resolved items from game data ---
    // Extract asset IDs and game-provided metadata
    const assetIds: number[] = [];
    const itemDataMap = new Map<number, { name: string; price: number | null }>();

    for (const [, value] of Object.entries(items)) {
      if (value === null || value === undefined) continue;

      if (typeof value === 'number' && value > 0) {
        assetIds.push(value);
      } else if (typeof value === 'object' && value !== null) {
        const item = value as GameItem;
        if (item.id > 0) {
          assetIds.push(item.id);
          itemDataMap.set(item.id, {
            name: item.name ?? `Item #${item.id}`,
            price: typeof item.price === 'number' ? item.price : null,
          });
        }
      }
    }

    // Fetch web-compatible thumbnail URLs (game sends rbxthumb:// which only works in Roblox)
    const thumbnailMap = await fetchAssetThumbnails(assetIds);

    // Build the final resolved items object (same format the website expects)
    const allCategories: CategoryKey[] = [
      'hat', 'hair', 'face', 'shirt', 'pants', 'shoes', 'accessory1', 'accessory2',
    ];

    const resolvedItems: Record<string, { id: number; name: string; thumbnailUrl: string | null; price: number | null; creatorName?: string; assetTypeId?: number } | null> = {};

    for (const category of allCategories) {
      const value = items[category];

      if (value === null || value === undefined) {
        resolvedItems[category] = null;
        continue;
      }

      let assetId: number;
      let name: string;
      let price: number | null;

      if (typeof value === 'number') {
        assetId = value;
        name = `Item #${value}`;
        price = null;
      } else {
        const item = value as GameItem;
        assetId = item.id;
        name = item.name ?? `Item #${item.id}`;
        price = typeof item.price === 'number' ? item.price : null;
      }

      resolvedItems[category] = {
        id: assetId,
        name,
        thumbnailUrl: thumbnailMap.get(assetId) ?? null,
        price,
      };
    }

    // Resolve screenshot asset ID to a viewable image URL
    let screenshotUrl: string | null = null;
    const rawScreenshotId = (body as Record<string, unknown>).screenshotUrl;
    if (typeof rawScreenshotId === 'string' && rawScreenshotId.length > 0) {
      try {
        // Try asset delivery API - returns JSON with location field
        const assetRes = await fetch(
          `https://assetdelivery.roblox.com/v1/asset/?id=${rawScreenshotId}`,
          { redirect: 'follow' },
        );
        const contentType = assetRes.headers.get('content-type') || '';
        if (contentType.includes('image')) {
          // Direct image URL
          screenshotUrl = `https://assetdelivery.roblox.com/v1/asset/?id=${rawScreenshotId}`;
        } else if (assetRes.ok) {
          const text = await assetRes.text();
          try {
            const json = JSON.parse(text);
            if (json?.location) {
              screenshotUrl = json.location;
            }
          } catch {
            // Not JSON, maybe it's the raw image served with wrong content-type
            screenshotUrl = `https://assetdelivery.roblox.com/v1/asset/?id=${rawScreenshotId}`;
          }
        }
      } catch (e) {
        console.warn('[game/submit-outfit] Asset delivery failed:', e);
      }

      // Fallback: try thumbnails API
      if (!screenshotUrl) {
        try {
          const thumbRes = await fetch(
            `https://thumbnails.roblox.com/v1/assets?assetIds=${rawScreenshotId}&returnPolicy=PlaceHolder&size=420x420&format=Png`,
          );
          if (thumbRes.ok) {
            const thumbData = await thumbRes.json();
            const entry = thumbData?.data?.[0];
            if (entry?.imageUrl && !entry.imageUrl.includes('placeholder')) {
              screenshotUrl = entry.imageUrl;
            }
          }
        } catch {}
      }

      // Last fallback: store raw ID, resolve on display
      if (!screenshotUrl) {
        screenshotUrl = `https://assetdelivery.roblox.com/v1/asset/?id=${rawScreenshotId}`;
      }
    }

    // --- Save to database ---
    const outfit = await prisma.outfit.create({
      data: {
        name: outfitName ?? null,
        buildJson: JSON.stringify(resolvedItems),
        customImage: screenshotUrl,
        isPublic: true,
        voteScore: 0,
        ownerId: user.id,
        source: 'game',
      },
      include: { owner: true },
    });

    console.log(
      `[game/submit-outfit] Outfit #${outfit.id} created by ${robloxUsername} (Roblox ID: ${robloxUserId})`,
    );

    return NextResponse.json(
      {
        success: true,
        outfit: {
          id: outfit.id,
          name: outfit.name,
          owner: outfit.owner.username,
          isPublic: outfit.isPublic,
          voteScore: outfit.voteScore,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('[game/submit-outfit] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    );
  }
}