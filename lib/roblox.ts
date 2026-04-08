/**
 * lib/roblox.ts
 *
 * Utility functions for interacting with the Roblox Web API.
 * Handles fetching catalog item details, asset thumbnails,
 * and user avatar renders.
 *
 * Roblox API docs: https://create.roblox.com/docs/reference/cloud
 *
 * @module lib/roblox
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of a single item returned by the Roblox economy details endpoint. */
export interface RobloxItemDetails {
  id: number;
  name: string;
  description?: string;
  creatorName?: string;
  price?: number | null;
  assetTypeId?: number;
}

/** Shape of a single thumbnail entry from the Roblox thumbnails API. */
export interface RobloxThumbnail {
  targetId: number;
  state: string; // "Completed" | "Pending" | "Blocked" etc.
  imageUrl: string;
}

/**
 * The category keys used by our outfit builder.
 * Each slot in an outfit corresponds to one of these keys.
 */
export type CategoryKey =
  | 'hat'
  | 'hair'
  | 'face'
  | 'shirt'
  | 'pants'
  | 'shoes'
  | 'accessory1'
  | 'accessory2';

/**
 * A fully resolved catalog item with all the data needed
 * to display it on the website (matches the existing BuildState shape).
 */
export interface ResolvedCatalogItem {
  id: number;
  name: string;
  creatorName?: string;
  thumbnailUrl: string | null;
  price?: number | null;
  assetTypeId?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL for fetching individual asset details from Roblox. */
const ROBLOX_ECONOMY_URL = 'https://economy.roblox.com/v2/assets';

/** Base URL for batch-fetching asset thumbnails from Roblox. */
const ROBLOX_THUMBNAILS_URL = 'https://thumbnails.roblox.com/v1/assets';

/** Base URL for fetching user avatar thumbnails from Roblox. */
const ROBLOX_AVATAR_THUMBNAILS_URL =
  'https://thumbnails.roblox.com/v1/users/avatar';

// ---------------------------------------------------------------------------
// Item Details
// ---------------------------------------------------------------------------

/**
 * Fetches details for a single Roblox asset by its ID.
 *
 * Uses the Roblox Economy API v2 which provides name, description,
 * price, creator info, and asset type for catalog items.
 *
 * @param assetId - The numeric Roblox asset ID to look up.
 * @returns The item details, or null if the request fails.
 *
 * @example
 * ```ts
 * const hat = await fetchItemDetails(607702162);
 * // => { id: 607702162, name: "Roblox Baseball Cap", price: 75, ... }
 * ```
 */
export async function fetchItemDetails(
  assetId: number,
): Promise<RobloxItemDetails | null> {
  try {
    const res = await fetch(`${ROBLOX_ECONOMY_URL}/${assetId}/details`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      console.warn(
        `[roblox] Failed to fetch details for asset ${assetId}:`,
        res.status,
      );
      return null;
    }

    const data = await res.json();

    return {
      id: data.AssetId ?? data.id ?? assetId,
      name: data.Name ?? data.name ?? 'Unknown Item',
      description: data.Description ?? data.description,
      creatorName: data.Creator?.Name ?? data.creatorName,
      price: data.PriceInRobux ?? data.price ?? null,
      assetTypeId: data.AssetTypeId ?? data.assetTypeId,
    };
  } catch (err) {
    console.error(`[roblox] Error fetching details for asset ${assetId}:`, err);
    return null;
  }
}

/**
 * Fetches details for multiple Roblox assets in parallel.
 *
 * Fires all requests concurrently and returns a Map keyed by asset ID.
 * Failed lookups are silently excluded from the result map.
 *
 * @param assetIds - Array of numeric Roblox asset IDs.
 * @returns A Map of asset ID → item details (only successful lookups).
 *
 * @example
 * ```ts
 * const details = await fetchMultipleItemDetails([607702162, 4819740796]);
 * // details.get(607702162) => { id: 607702162, name: "...", ... }
 * ```
 */
export async function fetchMultipleItemDetails(
  assetIds: number[],
): Promise<Map<number, RobloxItemDetails>> {
  const results = await Promise.allSettled(
    assetIds.map((id) => fetchItemDetails(id)),
  );

  const detailsMap = new Map<number, RobloxItemDetails>();

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      detailsMap.set(result.value.id, result.value);
    }
  }

  return detailsMap;
}

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------

/**
 * Fetches thumbnail image URLs for a batch of Roblox assets.
 *
 * Uses the Roblox Thumbnails API which supports batch requests
 * (up to 100 asset IDs per call). Returns a Map of asset ID → image URL.
 *
 * @param assetIds - Array of numeric Roblox asset IDs.
 * @param size     - Desired thumbnail size (default: "150x150").
 * @returns A Map of asset ID → thumbnail image URL.
 *
 * @example
 * ```ts
 * const thumbs = await fetchAssetThumbnails([607702162, 4819740796]);
 * // thumbs.get(607702162) => "https://tr.rbxcdn.com/..."
 * ```
 */
export async function fetchAssetThumbnails(
  assetIds: number[],
  size: string = '150x150',
): Promise<Map<number, string>> {
  const thumbMap = new Map<number, string>();

  if (assetIds.length === 0) return thumbMap;

  try {
    const params = new URLSearchParams();
    for (const id of assetIds) {
      params.append('assetIds', String(id));
    }
    params.set('returnPolicy', 'PlaceHolder');
    params.set('size', size);
    params.set('format', 'Png');
    params.set('isCircular', 'false');

    const res = await fetch(`${ROBLOX_THUMBNAILS_URL}?${params.toString()}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      console.warn('[roblox] Thumbnails API error:', res.status);
      return thumbMap;
    }

    const data = await res.json();

    for (const entry of (data.data as RobloxThumbnail[]) ?? []) {
      if (entry.targetId && entry.imageUrl) {
        thumbMap.set(Number(entry.targetId), entry.imageUrl);
      }
    }
  } catch (err) {
    console.error('[roblox] Error fetching asset thumbnails:', err);
  }

  return thumbMap;
}

/**
 * Fetches the avatar thumbnail for a Roblox user.
 *
 * This renders the user's currently-equipped avatar as a full-body image.
 * Useful for generating preview images when a player submits an outfit
 * from the Roblox game (since they'll be wearing the outfit at submission time).
 *
 * @param userId - The numeric Roblox user ID.
 * @param size   - Desired image size (default: "352x352").
 * @returns The avatar thumbnail URL, or null if the request fails.
 *
 * @example
 * ```ts
 * const avatarUrl = await fetchUserAvatarThumbnail(1234567);
 * // => "https://tr.rbxcdn.com/..."
 * ```
 */
export async function fetchUserAvatarThumbnail(
  userId: number,
  size: string = '352x352',
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      userIds: String(userId),
      size,
      format: 'Png',
      isCircular: 'false',
    });

    const res = await fetch(
      `${ROBLOX_AVATAR_THUMBNAILS_URL}?${params.toString()}`,
      { cache: 'no-store' },
    );

    if (!res.ok) {
      console.warn(
        `[roblox] Avatar thumbnail API error for user ${userId}:`,
        res.status,
      );
      return null;
    }

    const data = await res.json();
    const entry = data.data?.[0];

    if (entry?.state === 'Completed' && entry?.imageUrl) {
      return entry.imageUrl;
    }

    return null;
  } catch (err) {
    console.error(
      `[roblox] Error fetching avatar thumbnail for user ${userId}:`,
      err,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Resolve Full Items
// ---------------------------------------------------------------------------

/**
 * Takes a mapping of category → asset ID (as sent from the Roblox game)
 * and resolves each into a full catalog item with name, thumbnail, and price.
 *
 * This is the core function that bridges the game submission (which only
 * sends asset IDs) with the website's outfit format (which needs full
 * item objects with names, thumbnails, etc.).
 *
 * @param itemIds - Object mapping category keys to Roblox asset IDs.
 * @returns Object mapping category keys to fully resolved catalog items.
 *
 * @example
 * ```ts
 * const resolved = await resolveOutfitItems({
 *   hat: 607702162,
 *   shirt: 4819740796,
 *   pants: null,
 *   // ... other categories
 * });
 * // resolved.hat => { id: 607702162, name: "...", thumbnailUrl: "...", ... }
 * ```
 */
export async function resolveOutfitItems(
  itemIds: Partial<Record<CategoryKey, number | null>>,
): Promise<Record<CategoryKey, ResolvedCatalogItem | null>> {
  // Collect all non-null asset IDs for batch fetching
  const allAssetIds: number[] = [];
  const categoryToId = new Map<CategoryKey, number>();

  for (const [category, assetId] of Object.entries(itemIds)) {
    if (typeof assetId === 'number' && assetId > 0) {
      allAssetIds.push(assetId);
      categoryToId.set(category as CategoryKey, assetId);
    }
  }

  // Fetch item details and thumbnails in parallel for performance
  const [detailsMap, thumbnailMap] = await Promise.all([
    fetchMultipleItemDetails(allAssetIds),
    fetchAssetThumbnails(allAssetIds),
  ]);

  // Build the resolved output object
  const allCategories: CategoryKey[] = [
    'hat',
    'hair',
    'face',
    'shirt',
    'pants',
    'shoes',
    'accessory1',
    'accessory2',
  ];

  const resolved: Record<CategoryKey, ResolvedCatalogItem | null> =
    {} as Record<CategoryKey, ResolvedCatalogItem | null>;

  for (const category of allCategories) {
    const assetId = categoryToId.get(category);

    if (!assetId) {
      resolved[category] = null;
      continue;
    }

    const details = detailsMap.get(assetId);
    const thumbnailUrl = thumbnailMap.get(assetId) ?? null;

    resolved[category] = {
      id: assetId,
      name: details?.name ?? `Item #${assetId}`,
      creatorName: details?.creatorName,
      thumbnailUrl,
      price: details?.price ?? null,
      assetTypeId: details?.assetTypeId,
    };
  }

  return resolved;
}
