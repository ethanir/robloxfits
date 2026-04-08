# RobloxFits

**Live site:** [robloxfits.com](https://www.robloxfits.com)

RobloxFits is a full-stack web platform paired with a Roblox game that lets players build, share, and vote on Roblox avatar outfits. Players try on catalog items in-game with live character preview, then submit their outfits to the website where the community can browse, vote, and discover new looks.

![RobloxFits](https://img.shields.io/badge/status-live-brightgreen) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Roblox](https://img.shields.io/badge/Roblox-Lua-red)

## How It Works

**In the Roblox game:**
1. Player opens the outfit builder UI
2. Searches the Roblox catalog across 8 categories (hat, hair, face, shirt, pants, shoes, accessories)
3. Clicks items to try them on — items appear on their character in real-time
4. Submits the outfit to robloxfits.com with one click

**On the website:**
1. Outfits from the game appear on the public leaderboard with all item details
2. Users can also build outfits directly on the website using the catalog search
3. Community votes rank outfits — sign in to upvote/downvote
4. Each item links to its Roblox catalog page with price and creator info

## Tech Stack

### Website
- **Framework:** Next.js 16 (App Router) with React 19 and TypeScript
- **Database:** PostgreSQL on Neon (serverless)
- **ORM:** Prisma
- **Hosting:** Vercel
- **Styling:** Tailwind CSS

### Roblox Game
- **Language:** Lua (Roblox Luau)
- **Catalog Search:** AvatarEditorService for searching the Roblox catalog from game scripts
- **Live Try-On:** InsertService to load and equip catalog items on player characters in real-time
- **Server Communication:** HttpService to POST outfit data to the website API

### API Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/api/game/submit-outfit` | POST | Receives outfit submissions from the Roblox game |
| `/api/roblox/catalog` | GET | Proxies Roblox catalog search with thumbnail enrichment |
| `/api/outfits` | GET/POST | List all outfits / save a new outfit from the website |
| `/api/outfits/vote` | POST | Submit a vote on an outfit |
| `/api/outfits/toggle-public` | POST | Toggle outfit visibility on the leaderboard |
| `/api/auth/signup` | POST | Create a new account |
| `/api/auth/login` | POST | Sign in to an existing account |

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│   Roblox Game        │         │   robloxfits.com     │
│                     │         │                      │
│  AvatarEditorService│         │  Next.js App Router  │
│  ↓ catalog search   │         │  ↓                   │
│  InsertService      │  HTTP   │  /api/game/submit    │
│  ↓ live try-on      │────────→│  ↓                   │
│  HttpService        │  POST   │  Prisma ORM          │
│  ↓ submit outfit    │         │  ↓                   │
└─────────────────────┘         │  PostgreSQL (Neon)   │
                                │                      │
┌─────────────────────┐         │  Roblox APIs         │
│   Website Users      │         │  ↓ resolve items     │
│                     │  HTTPS  │  ↓ fetch thumbnails  │
│  Browse outfits     │←────────│  ↓ fetch prices      │
│  Vote on outfits    │────────→│                      │
│  Build outfits      │         └──────────────────────┘
└─────────────────────┘
```

## Key Features

- **Live try-on in Roblox** — Items are loaded via `InsertService:LoadAsset()` and equipped on the player's character using `Humanoid:AddAccessory()`. Original accessories are hidden (not destroyed) and restored when items are removed.

- **Authenticated game submissions** — The Roblox game authenticates with the API using a shared secret key. Players are identified by their Roblox user ID and automatically linked to website accounts.

- **Catalog item resolution** — The game only sends asset IDs. The server resolves each ID into full item details (name, thumbnail, price, creator) by calling Roblox's Economy and Thumbnails APIs.

- **Community voting** — Users must be signed in to vote. Can't vote on your own outfits. Vote state persists across sessions.

- **Dual creation flow** — Outfits can be created either in-game (with live try-on) or on the website (with catalog search). Both flows store outfits in the same format and appear on the same leaderboard.

## Database Schema

```
User
├── id           (int, auto-increment)
├── username     (string, unique)
├── password     (string)
├── robloxUserId (bigint, unique, nullable)
├── outfits      (Outfit[])
└── createdAt    (datetime)

Outfit
├── id          (int, auto-increment)
├── name        (string, nullable)
├── buildJson   (string — JSON serialized item data)
├── customImage (string, nullable — screenshot URL)
├── isPublic    (boolean)
├── voteScore   (int)
├── source      (string — "website" or "game")
├── owner       (User relation)
├── createdAt   (datetime)
└── updatedAt   (datetime)
```

## Author

**Ethan Irimiciuc** — Computer Science student at UIC

- GitHub: [@ethanir](https://github.com/ethanir)