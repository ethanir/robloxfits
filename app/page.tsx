'use client';

import { useEffect, useMemo, useState } from 'react';

type RobloxCatalogItem = {
  id: number;
  name: string;
  creatorName?: string;
  thumbnailUrl?: string | null;
  price?: number | null;
  assetTypeId?: number;
  assetType?: number | { id: number };
};

type CategoryKey =
  | 'hat'
  | 'hair'
  | 'face'
  | 'shirt'
  | 'pants'
  | 'shoes'
  | 'accessory1'
  | 'accessory2';

const CATEGORY_DEFS: { key: CategoryKey; label: string }[] = [
  { key: 'hat', label: 'Hat' },
  { key: 'hair', label: 'Hair' },
  { key: 'face', label: 'Face' },
  { key: 'shirt', label: 'Shirt' },
  { key: 'pants', label: 'Pants' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'accessory1', label: 'Acc 1' },
  { key: 'accessory2', label: 'Acc 2' },
];

type BuildState = Record<CategoryKey, RobloxCatalogItem | null>;

type SavedBuild = {
  id: number;
  name: string;
  build: BuildState;
  customImageUrl?: string;
  voteScore: number;
  owner: string;
  isPublic: boolean;
  userVote?: 'up' | 'down' | null;
};

type ApiOutfit = {
  id: number;
  name: string | null;
  build: BuildState;
  isPublic: boolean;
  voteScore: number;
  owner: string;
  customImageUrl?: string | null;
};

export default function HomePage() {
  const [outfits, setOutfits] = useState<SavedBuild[]>([]);
  const [loading, setLoading] = useState(true);

  const [visitorId] = useState(() => {
    if (typeof window === 'undefined') return 'anon';
    let id = window.localStorage.getItem('rdh_visitor_id');
    if (!id) {
      id = 'v_' + Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem('rdh_visitor_id', id);
    }
    return id;
  });

  useEffect(() => {
    async function fetchOutfits() {
      try {
        const res = await fetch('/api/outfits');
        if (!res.ok) return;

        const data = (await res.json()) as { outfits: ApiOutfit[] };

        let votesMap: Record<string, 'up' | 'down'> = {};
        try {
          const stored = window.localStorage.getItem(`rdh_votes_${visitorId}`);
          if (stored) votesMap = JSON.parse(stored);
        } catch {}

        const mapped: SavedBuild[] = data.outfits
          .filter((o) => o.isPublic)
          .map((o) => ({
            id: o.id,
            name: o.name ?? '',
            build: o.build,
            customImageUrl: o.customImageUrl ?? undefined,
            voteScore: o.voteScore ?? 0,
            owner: o.owner,
            isPublic: o.isPublic,
            userVote: votesMap[String(o.id)] ?? null,
          }));

        setOutfits(mapped);
      } catch (err) {
        console.error('Error fetching outfits', err);
      } finally {
        setLoading(false);
      }
    }

    fetchOutfits();
  }, [visitorId]);

  const sortedOutfits = useMemo(
    () => [...outfits].sort((a, b) => (b.voteScore ?? 0) - (a.voteScore ?? 0)),
    [outfits],
  );

  function persistVote(outfitId: number, vote: 'up' | 'down' | null) {
    const key = `rdh_votes_${visitorId}`;
    let votesMap: Record<string, string> = {};
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) votesMap = JSON.parse(stored);
    } catch {}
    if (vote) {
      votesMap[String(outfitId)] = vote;
    } else {
      delete votesMap[String(outfitId)];
    }
    window.localStorage.setItem(key, JSON.stringify(votesMap));
  }

  function handleVote(outfitId: number, direction: 'up' | 'down') {
    setOutfits((prev) => {
      let deltaForServer = 0;

      const updated = prev.map((outfit) => {
        if (outfit.id !== outfitId) return outfit;

        let voteScore = outfit.voteScore ?? 0;
        let userVote: 'up' | 'down' | null = outfit.userVote ?? null;
        const prevScore = voteScore;

        if (direction === 'up') {
          if (userVote === 'up') { voteScore -= 1; userVote = null; }
          else if (userVote === 'down') { voteScore += 2; userVote = 'up'; }
          else { voteScore += 1; userVote = 'up'; }
        } else {
          if (userVote === 'down') { voteScore += 1; userVote = null; }
          else if (userVote === 'up') { voteScore -= 2; userVote = 'down'; }
          else { voteScore -= 1; userVote = 'down'; }
        }

        deltaForServer = voteScore - prevScore;
        persistVote(outfitId, userVote);
        return { ...outfit, voteScore, userVote };
      });

      if (deltaForServer !== 0) {
        fetch('/api/outfits/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ outfitId, delta: deltaForServer }),
        }).catch((err) => console.error('Vote error', err));
      }

      return updated;
    });
  }

  return (
    <main className="min-h-screen bg-[#0a0a0c] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800/60 bg-[#0a0a0c]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-black font-black text-sm">
              R
            </div>
            <h1 className="text-xl font-bold tracking-tight">RobloxFits</h1>
          </div>
          <div className="text-sm text-zinc-400 hidden sm:block">
            Build outfits in Roblox • Vote for the best drip
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6">
        <h2 className="text-3xl font-bold tracking-tight">Leaderboard</h2>
        <p className="text-zinc-400 mt-1 text-sm">
          Outfits submitted from the Roblox game, ranked by community votes.
        </p>
      </div>

      {/* Outfit List */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        {loading ? (
          <div className="text-center py-20 text-zinc-500">Loading outfits...</div>
        ) : sortedOutfits.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-zinc-500 text-lg">No outfits yet</div>
            <div className="text-zinc-600 text-sm mt-2">
              Join the Roblox game to build and submit the first outfit!
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {sortedOutfits.map((outfit, index) => {
              const totalPrice = CATEGORY_DEFS.reduce((sum, { key }) => {
                const item = outfit.build[key];
                if (item && typeof item.price === 'number') return sum + item.price;
                return sum;
              }, 0);

              const score = outfit.voteScore ?? 0;
              const userVote = outfit.userVote ?? null;
              const hasScreenshot = !!outfit.customImageUrl;

              return (
                <div
                  key={outfit.id}
                  className="rounded-2xl bg-zinc-900/40 border border-zinc-800/50 overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="px-5 py-4 flex items-center justify-between border-b border-zinc-800/30">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-black text-zinc-700 w-10">
                        #{index + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-lg leading-tight">
                          {outfit.name || 'Untitled outfit'}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          by {outfit.owner}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {totalPrice > 0 && (
                        <div className="text-sm font-semibold text-emerald-400">
                          {totalPrice.toLocaleString()} R$
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleVote(outfit.id, 'up')}
                          className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-all ${
                            userVote === 'up'
                              ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
                              : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                          }`}
                        >
                          ▲
                        </button>
                        <div
                          className={`min-w-[2.5rem] text-center text-sm font-bold tabular-nums ${
                            score > 0 ? 'text-emerald-400' : score < 0 ? 'text-red-400' : 'text-zinc-500'
                          }`}
                        >
                          {score}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleVote(outfit.id, 'down')}
                          className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-all ${
                            userVote === 'down'
                              ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
                              : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                          }`}
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex flex-col md:flex-row gap-5">
                    {/* Screenshot preview (if available) */}
                    {hasScreenshot && (
                      <div className="flex-shrink-0">
                        <img
                          src={outfit.customImageUrl}
                          alt={outfit.name || 'Outfit preview'}
                          className="w-full md:w-52 aspect-square object-cover rounded-xl border border-zinc-800/50"
                        />
                      </div>
                    )}

                    {/* Items Grid */}
                    <div
                      className={`flex-1 grid grid-cols-2 ${
                        hasScreenshot ? 'lg:grid-cols-4' : 'sm:grid-cols-4'
                      } gap-3`}
                    >
                      {CATEGORY_DEFS.map(({ key, label }) => {
                        const item = outfit.build[key];

                        if (!item) {
                          return (
                            <div
                              key={key}
                              className="rounded-xl bg-zinc-800/20 border border-zinc-800/30 p-3 flex flex-col items-center gap-2 opacity-40"
                            >
                              <div className="w-14 h-14 rounded-lg bg-zinc-800/40 flex items-center justify-center">
                                <span className="text-xs text-zinc-600">—</span>
                              </div>
                              <div className="text-center">
                                <div className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">
                                  {label}
                                </div>
                                <div className="text-[11px] text-zinc-600">None</div>
                              </div>
                            </div>
                          );
                        }

                        const url = `https://www.roblox.com/catalog/${item.id}`;

                        return (
                          <a
                            key={key}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group rounded-xl bg-zinc-800/30 border border-zinc-800/40 p-3 flex flex-col items-center gap-2 hover:border-emerald-500/30 hover:bg-zinc-800/50 transition-all"
                          >
                            <div className="w-14 h-14 rounded-lg bg-zinc-900 overflow-hidden flex-shrink-0">
                              {item.thumbnailUrl ? (
                                <img
                                  src={item.thumbnailUrl}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-zinc-600">
                                  ?
                                </div>
                              )}
                            </div>
                            <div className="text-center min-w-0 w-full">
                              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                                {label}
                              </div>
                              <div className="text-[11px] text-zinc-200 truncate font-medium group-hover:text-emerald-300 transition-colors">
                                {item.name}
                              </div>
                              {typeof item.price === 'number' && (
                                <div className="text-[10px] text-emerald-400/80 mt-0.5">
                                  {item.price.toLocaleString()} R$
                                </div>
                              )}
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800/40 py-6">
        <div className="max-w-6xl mx-auto px-6 text-center text-xs text-zinc-600">
          RobloxFits — Build outfits in Roblox, share them with the world.
        </div>
      </footer>
    </main>
  );
}