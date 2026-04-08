/**
 * app/api/game/submit-outfit/route.ts
 *
 * API endpoint for receiving outfit submissions from the Roblox game.
 *
 * When a player builds an outfit in the Roblox experience and hits "Submit",
 * the game sends the selected item IDs (per category) to this endpoint.
 * The server then:
 *   1. Validates the request and authenticates via API key
 *   2. Resolves each item ID into full catalog details (name, thumbnail, price)
 *   3. Optionally fetches the player's avatar thumbnail as a preview image
 *   4. Saves the outfit to the database, linked to the player's account
 *
 * Authentication:
 *   - The Roblox game authenticates using a shared API key (GAME_API_KEY env var)
 *   - The player is identified by their Roblox user ID
 *   - If the player has linked their Roblox account to a website account,
 *     the outfit is saved under their website user
 *   - If not linked, a placeholder user is created with their Roblox username
 *
 * Request body:
 * {
 *   "apiKey": string,                  // Shared secret for game authentication
 *   "robloxUserId": number,            // The submitting player's Roblox user ID
 *   "robloxUsername": string,           // The submitting player's Roblox display name
 *   "outfitName": string (optional),    // Player-chosen name for the outfit
 *   "items": {                          // Asset IDs for each outfit slot
 *     "hat": number | null,
 *     "hair": number | null,
 *     "face": number | null,
 *     "shirt": number | null,
 *     "pants": number | null,
 *     "shoes": number | null,
 *     "accessory1": number | null,
 *     "accessory2": number | null
 *   }
 * }
 *
 * Response (201 Created):
 * {
 *   "success": true,
 *   "outfit": {
 *     "id": number,
 *     "name": string | null,
 *     "owner": string,
 *     "isPublic": boolean,
 *     "voteScore": number,
 *     "avatarThumbnailUrl": string | null
 *   }
 * }
 *
 * @module api/game/submit-outfit
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  resolveOutfitItems,
  fetchUserAvatarThumbnail,
  type CategoryKey,
} from '@/lib/roblox';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Expected shape of the incoming request body from the Roblox game. */
interface GameSubmitRequest {
  apiKey: string;
  robloxUserId: number;
  robloxUsername: string;
  outfitName?: string;
  items: Partial<Record<CategoryKey, number | null>>;
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

/** All valid category keys that can appear in the items object. */
const VALID_CATEGORIES: CategoryKey[] = [
  'hat',
  'hair',
  'face',
  'shirt',
  'pants',
  'shoes',
  'accessory1',
  'accessory2',
];

/**
 * Validates the incoming request body and returns a typed object
 * or an error message string.
 *
 * Checks:
 *   - apiKey is a non-empty string
 *   - robloxUserId is a positive number
 *   - robloxUsername is a non-empty string
 *   - items is an object with valid category keys
 *   - At least one item slot is filled (non-null)
 *   - All provided asset IDs are positive numbers
 */
function validateRequest(
  body: unknown,
): { valid: true; data: GameSubmitRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const b = body as Record<string, unknown>;

  // --- API key ---
  if (typeof b.apiKey !== 'string' || b.apiKey.trim().length === 0) {
    return { valid: false, error: 'Missing or invalid apiKey.' };
  }

  // --- Roblox user ID ---
  if (typeof b.robloxUserId !== 'number' || b.robloxUserId <= 0) {
    return { valid: false, error: 'Missing or invalid robloxUserId.' };
  }

  // --- Roblox username ---
  if (typeof b.robloxUsername !== 'string' || b.robloxUsername.trim().length === 0) {
    return { valid: false, error: 'Missing or invalid robloxUsername.' };
  }

  // --- Items object ---
  if (!b.items || typeof b.items !== 'object') {
    return { valid: false, error: 'Missing or invalid items object.' };
  }

  const items = b.items as Record<string, unknown>;

  // Check that all keys are valid categories
  for (const key of Object.keys(items)) {
    if (!VALID_CATEGORIES.includes(key as CategoryKey)) {
      return { valid: false, error: `Invalid item category: "${key}".` };
    }
  }

  // Check that all values are either null or positive numbers
  for (const [key, value] of Object.entries(items)) {
    if (value !== null && value !== undefined) {
      if (typeof value !== 'number' || value <= 0) {
        return {
          valid: false,
          error: `Invalid asset ID for "${key}": must be a positive number or null.`,
        };
      }
    }
  }

  // Ensure at least one item slot is filled
  const hasAtLeastOneItem = Object.values(items).some(
    (v) => typeof v === 'number' && v > 0,
  );

  if (!hasAtLeastOneItem) {
    return {
      valid: false,
      error: 'Outfit must contain at least one item.',
    };
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
      items: items as Partial<Record<CategoryKey, number | null>>,
    },
  };
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST /api/game/submit-outfit
 *
 * Receives an outfit submission from the Roblox game, resolves all item
 * details via the Roblox API, and saves the outfit to the database.
 */
export async function POST(req: Request) {
  try {
    // --- Parse and validate the request body ---
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

    // --- Authenticate the game server ---
    const expectedKey = process.env.GAME_API_KEY;

    if (!expectedKey) {
      console.error(
        '[game/submit-outfit] GAME_API_KEY environment variable is not set.',
      );
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

    // --- Find or create the user account ---
    // If a website user has linked their Roblox account (robloxUserId field),
    // we use that account. Otherwise, we create a new user with the Roblox
    // username as a placeholder.
    let user = await prisma.user.findFirst({
      where: { robloxUserId: robloxUserId },
    });

    if (!user) {
      // No linked account found — check if a user with this Roblox username exists
      // (they may have signed up on the website with the same name)
      user = await prisma.user.findUnique({
        where: { username: robloxUsername },
      });

      if (user) {
        // Link the existing website account to this Roblox user ID
        user = await prisma.user.update({
          where: { id: user.id },
          data: { robloxUserId },
        });
      } else {
        // Create a new account for this Roblox player
        // Password is set to a random placeholder since they authenticate via the game
        user = await prisma.user.create({
          data: {
            username: robloxUsername,
            password: `roblox_${robloxUserId}_${Date.now()}`, // Not used for login
            robloxUserId,
          },
        });
      }
    }

    // --- Resolve item details and thumbnails from Roblox API ---
    // The game only sends asset IDs; we need to fetch the full details
    // (name, thumbnail URL, price, etc.) from Roblox's servers.
    const resolvedItems = await resolveOutfitItems(items);

    // --- Fetch the player's avatar thumbnail as the outfit preview ---
    // Since the player is wearing this outfit in-game at submission time,
    // their avatar thumbnail will show the complete outfit render.
    const avatarThumbnailUrl = await fetchUserAvatarThumbnail(robloxUserId);

    // --- Save the outfit to the database ---
    const outfit = await prisma.outfit.create({
      data: {
        name: outfitName ?? null,
        buildJson: JSON.stringify(resolvedItems),
        customImage: null, // Full avatar render as the preview
        isPublic: true, // Game-submitted outfits default to public
        voteScore: 0,
        ownerId: user.id,
        source: 'game', // Track that this came from the Roblox game
      },
      include: { owner: true },
    });

    console.log(
      `[game/submit-outfit] Outfit #${outfit.id} created by ${robloxUsername} (Roblox ID: ${robloxUserId})`,
    );

    // --- Return the created outfit ---
    return NextResponse.json(
      {
        success: true,
        outfit: {
          id: outfit.id,
          name: outfit.name,
          owner: outfit.owner.username,
          isPublic: outfit.isPublic,
          voteScore: outfit.voteScore,
          avatarThumbnailUrl,
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
