'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type RobloxCatalogItem = {
  id: number;
  name: string;
  creatorName?: string;
  thumbnailUrl?: string | null;
  price?: number | null;
  assetTypeId?: number;
  assetType?: number | { id: number };
};

type RobloxSearchResponse = {
  data: RobloxCatalogItem[];
  nextPageCursor?: string | null;
  previousPageCursor?: string | null;
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
  { key: 'shirt', label: 'Shirt / Top' },
  { key: 'pants', label: 'Pants / Bottom' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'accessory1', label: 'Accessory 1' },
  { key: 'accessory2', label: 'Accessory 2' },
];

const DEFAULT_KEYWORD_BY_CATEGORY: Record<CategoryKey, string> = {
  hat: 'hat',
  hair: 'hair',
  face: 'face',
  shirt: 'shirt',
  pants: 'pants',
  shoes: 'shoes',
  accessory1: 'accessory',
  accessory2: 'accessory',
};

const PLACEHOLDER_BY_CATEGORY: Record<CategoryKey, string> = {
  hat: 'Search hats (beanie, cap, hood...)',
  hair: 'Search hair (bangs, ponytail, layered...)',
  face: 'Search faces / face accessories (glasses, mask...)',
  shirt: 'Search shirts / tops (hoodie, tee, jacket...)',
  pants: 'Search pants / bottoms (jeans, skirt, shorts...)',
  shoes: 'Search shoes (sneakers, boots, platforms...)',
  accessory1: 'Search accessories (backpack, wings, scarf...)',
  accessory2: 'Search accessories (backpack, wings, scarf...)',
};

const ALLOWED_ASSET_TYPES: Record<CategoryKey, number[]> = {
  hat: [8],
  hair: [41],
  face: [18, 42],
  shirt: [11, 2, 64, 65, 67, 68],
  pants: [12, 66, 69, 72],
  shoes: [70, 71, 19],
  accessory1: [43, 44, 45, 46, 47, 19],
  accessory2: [43, 44, 45, 46, 47, 19],
};

function getAssetTypeId(item: RobloxCatalogItem): number | undefined {
  const raw: any =
    (item as any).assetTypeId ?? (item as any).assetType ?? undefined;

  if (typeof raw === 'number') return raw;
  if (raw && typeof raw === 'object' && typeof raw.id === 'number') {
    return raw.id;
  }
  return undefined;
}

function isItemCompatible(
  item: RobloxCatalogItem,
  category: CategoryKey,
): boolean {
  const allowed = ALLOWED_ASSET_TYPES[category];

  if (category === 'shoes') {
    const nameLower = (item.name || '').toLowerCase();
    const looksLikeShoes = /\bshoe|shoes|boot|boots|sneaker|sneakers\b/.test(
      nameLower,
    );
    if (looksLikeShoes) return true;
  }

  if (!allowed || allowed.length === 0) return true;

  const typeId = getAssetTypeId(item);
  if (typeId === undefined) return false;
  return allowed.includes(typeId);
}

type BuildState = Record<CategoryKey, RobloxCatalogItem | null>;

type SavedBuild = {
  id: number; // database id
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

function OutfitThumbnailGrid({ build, customImageUrl }: { build: BuildState; customImageUrl?: string }) {
  // If there's a custom image (screenshot from game), show that
  if (customImageUrl) {
    return (
      <img
        src={customImageUrl}
        alt="Outfit preview"
        className="w-40 h-40 md:w-48 md:h-48 object-cover rounded-lg"
      />
    );
  }

  // Otherwise show a 4x2 grid of item thumbnails
  const slots: { key: CategoryKey; label: string }[] = [
    { key: 'hat', label: 'Hat' },
    { key: 'hair', label: 'Hair' },
    { key: 'face', label: 'Face' },
    { key: 'shirt', label: 'Shirt' },
    { key: 'pants', label: 'Pants' },
    { key: 'shoes', label: 'Shoes' },
    { key: 'accessory1', label: 'Acc 1' },
    { key: 'accessory2', label: 'Acc 2' },
  ];

  const filledCount = slots.filter(s => build[s.key] !== null).length;

  return (
    <div className="w-40 md:w-48 rounded-lg bg-zinc-900 border border-zinc-800 p-2">
      <div className="grid grid-cols-4 gap-1">
        {slots.map(({ key, label }) => {
          const item = build[key];
          return (
            <div key={key} className="aspect-square rounded bg-zinc-800/60 overflow-hidden flex items-center justify-center" title={item ? item.name : label}>
              {item?.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[7px] text-zinc-600">{label}</span>
              )}
            </div>
          );
        })}
      </div>
      {filledCount > 0 && (
        <div className="text-[9px] text-zinc-500 text-center mt-1">{filledCount}/8 items</div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<
    'builder' | 'your' | 'leaderboard'
  >('builder');

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signIn');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [selectedCategoryKey, setSelectedCategoryKey] =
    useState<CategoryKey>('hat');
  const [keyword, setKeyword] = useState(DEFAULT_KEYWORD_BY_CATEGORY['hat']);
  const [items, setItems] = useState<RobloxCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [build, setBuild] = useState<BuildState>({
    hat: null,
    hair: null,
    face: null,
    shirt: null,
    pants: null,
    shoes: null,
    accessory1: null,
    accessory2: null,
  });

  const [savedBuilds, setSavedBuilds] = useState<SavedBuild[]>([]);

  const yourOutfits = useMemo(
    () =>
      currentUser
        ? savedBuilds.filter((o) => o.owner === currentUser)
        : ([] as SavedBuild[]),
    [savedBuilds, currentUser],
  );

  const leaderboardOutfits = useMemo(
    () =>
      [...savedBuilds]
        .filter((o) => o.isPublic)
        .sort((a, b) => (b.voteScore ?? 0) - (a.voteScore ?? 0)),
    [savedBuilds],
  );

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingName, setPendingName] = useState('');

  const selectedCategoryLabel = useMemo(() => {
    const def = CATEGORY_DEFS.find((c) => c.key === selectedCategoryKey);
    return def?.label ?? 'Slot';
  }, [selectedCategoryKey]);

  const hasAnySelected = useMemo(
    () => Object.values(build).some((slot) => slot !== null),
    [build],
  );

  const isBuildComplete = useMemo(
    () => CATEGORY_DEFS.every(({ key }) => build[key] !== null),
    [build],
  );

  // Load current user from localStorage (just the username)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedUser = window.localStorage.getItem('rdh_currentUser');
    if (storedUser) {
      setCurrentUser(storedUser);
    }
  }, []);

  // Load outfits from backend (including customImageUrl stored in DB)
  useEffect(() => {
    async function fetchOutfits() {
      try {
        const res = await fetch('/api/outfits');
        if (!res.ok) {
          console.error('Failed to fetch outfits', await res.text());
          return;
        }

        const data = (await res.json()) as { outfits: ApiOutfit[] };

        const mapped: SavedBuild[] = data.outfits.map((o) => ({
          id: o.id,
          name: o.name ?? '',
          build: o.build,
          customImageUrl: o.customImageUrl ?? undefined,
          voteScore: o.voteScore ?? 0,
          owner: o.owner,
          isPublic: o.isPublic,
          userVote: null,
        }));

        setSavedBuilds(mapped);
      } catch (err) {
        console.error('Error fetching outfits', err);
      }
    }

    fetchOutfits();
  }, []);

  // Canvas outfit preview
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(1, '#020617');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#1f2933';
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.28, H * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(W * 0.38, H * 0.4, W * 0.24, H * 0.25);
    ctx.fillRect(W * 0.40, H * 0.65, W * 0.07, H * 0.18);
    ctx.fillRect(W * 0.53, H * 0.65, W * 0.07, H * 0.18);

    type LayerDef = {
      item: RobloxCatalogItem | null;
      w: number;
      h: number;
      cx: number;
      cy: number;
    };

    const layers: LayerDef[] = [
      { item: build.pants, w: 0.55, h: 0.55, cx: 0.5, cy: 0.72 },
      { item: build.shoes, w: 0.5, h: 0.5, cx: 0.5, cy: 0.9 },
      { item: build.shirt, w: 0.6, h: 0.6, cx: 0.5, cy: 0.48 },
      { item: build.accessory1, w: 0.45, h: 0.45, cx: 0.28, cy: 0.5 },
      { item: build.accessory2, w: 0.45, h: 0.45, cx: 0.72, cy: 0.5 },
      { item: build.face, w: 0.35, h: 0.35, cx: 0.5, cy: 0.28 },
      { item: build.hair, w: 0.4, h: 0.4, cx: 0.5, cy: 0.22 },
      { item: build.hat, w: 0.45, h: 0.45, cx: 0.5, cy: 0.16 },
    ];

    const toLoad = layers.filter((layer) => layer.item?.thumbnailUrl);
    if (toLoad.length === 0) return;

    let cancelled = false;
    Promise.all(
      toLoad.map(
        (layer) =>
          new Promise<{ img: HTMLImageElement; layer: LayerDef }>(
            (resolve) => {
              const img = new Image();
              img.onload = () => resolve({ img, layer });
              img.onerror = () => resolve({ img, layer });
              img.src = layer.item!.thumbnailUrl as string;
            },
          ),
      ),
    ).then((results) => {
      if (cancelled) return;
      for (const { img, layer } of results) {
        if (!layer.item?.thumbnailUrl) continue;
        const drawW = layer.w * W;
        const drawH = layer.h * H;
        const dx = layer.cx * W - drawW / 2;
        const dy = layer.cy * H - drawH / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [build]);

  async function search() {
    try {
      setLoading(true);
      setError(null);
      setItems([]);

      const params = new URLSearchParams({
        keyword,
        limit: '30',
      });

      const res = await fetch(`/api/roblox/catalog?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch from API');
      }

      const data: RobloxSearchResponse = await res.json();
      setItems(data.data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function handleChooseItem(item: RobloxCatalogItem) {
    if (!isItemCompatible(item, selectedCategoryKey)) return;
    setBuild((prev) => ({
      ...prev,
      [selectedCategoryKey]: item,
    }));
  }

  function handleClearCategory(key: CategoryKey) {
    setBuild((prev) => ({
      ...prev,
      [key]: null,
    }));
  }

  function handleResetBuild() {
    setBuild({
      hat: null,
      hair: null,
      face: null,
      shirt: null,
      pants: null,
      shoes: null,
      accessory1: null,
      accessory2: null,
    });
  }

  function handleSelectCategory(key: CategoryKey) {
    setSelectedCategoryKey(key);
    setKeyword(DEFAULT_KEYWORD_BY_CATEGORY[key]);
  }

  function openSaveDialog() {
    if (!isBuildComplete) return;
    if (!currentUser) {
      alert('Please sign in or create an account before saving outfits.');
      return;
    }
    setShowSaveDialog(true);
  }

  async function confirmSaveBuild() {
    if (!currentUser) {
      alert('You must be signed in to save.');
      return;
    }

    try {
      const res = await fetch('/api/outfits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser,
          name: pendingName,
          build,

        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Failed to save outfit', data);
        alert(data.error || 'Failed to save outfit.');
        return;
      }

      const created = (await res.json()) as ApiOutfit;

      const newSaved: SavedBuild = {
        id: created.id,
        name: created.name ?? '',
        build: created.build,
        customImageUrl: created.customImageUrl ?? undefined,
        voteScore: created.voteScore ?? 0,
        owner: created.owner,
        isPublic: created.isPublic,
        userVote: null,
      };

      setSavedBuilds((prev) => [newSaved, ...prev]);

      setShowSaveDialog(false);
      setPendingName('');
      handleResetBuild();
      setActiveTab('your');
    } catch (err) {
      console.error('Error saving outfit', err);
      alert('Failed to save outfit.');
    }
  }

  function cancelSaveDialog() {
    setShowSaveDialog(false);
    setPendingName('');
  }

  // Load persisted votes from localStorage
  useEffect(() => {
    if (!currentUser) return;
    const stored = window.localStorage.getItem(`rdh_votes_${currentUser}`);
    if (stored) {
      try {
        const votesMap = JSON.parse(stored) as Record<string, 'up' | 'down'>;
        setSavedBuilds((prev) =>
          prev.map((o) => ({
            ...o,
            userVote: votesMap[String(o.id)] ?? null,
          })),
        );
      } catch {}
    }
  }, [currentUser, savedBuilds.length > 0 ? 'loaded' : 'empty']);

  function persistVote(outfitId: number, vote: 'up' | 'down' | null) {
    if (!currentUser) return;
    const key = `rdh_votes_${currentUser}`;
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

  async function handleVote(outfitId: number, direction: 'up' | 'down') {
    if (!currentUser) {
      alert('Please sign in to vote.');
      return;
    }

    setSavedBuilds((prev) => {
      let deltaForServer = 0;

      const updated = prev.map((outfit) => {
        if (outfit.id !== outfitId) return outfit;

        let voteScore = outfit.voteScore ?? 0;
        let userVote: 'up' | 'down' | null = outfit.userVote ?? null;

        const prevScore = voteScore;

        if (direction === 'up') {
          if (userVote === 'up') {
            voteScore -= 1;
            userVote = null;
          } else if (userVote === 'down') {
            voteScore += 2;
            userVote = 'up';
          } else {
            voteScore += 1;
            userVote = 'up';
          }
        } else {
          if (userVote === 'down') {
            voteScore += 1;
            userVote = null;
          } else if (userVote === 'up') {
            voteScore -= 2;
            userVote = 'down';
          } else {
            voteScore -= 1;
            userVote = 'down';
          }
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

  async function togglePublic(outfitId: number) {
    if (!currentUser) return;

    try {
      const res = await fetch('/api/outfits/toggle-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outfitId, username: currentUser }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('togglePublic failed', data);
        alert(data.error || 'Failed to update visibility.');
        return;
      }

      const data = (await res.json()) as { id: number; isPublic: boolean };

      setSavedBuilds((prev) =>
        prev.map((o) =>
          o.id === data.id ? { ...o, isPublic: data.isPublic } : o,
        ),
      );
    } catch (err) {
      console.error('togglePublic error', err);
      alert('Failed to update visibility.');
    }
  }

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);

    const username = authUsername.trim();
    const password = authPassword.trim();

    if (!username || !password) {
      setAuthError('Enter a username and password.');
      return;
    }

    try {
      const endpoint =
        authMode === 'signIn' ? '/api/auth/login' : '/api/auth/signup';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed.');
        return;
      }

      setCurrentUser(username);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('rdh_currentUser', username);
      }
      setAuthPassword('');
      setAuthError(null);
    } catch (err) {
      console.error('Auth submit error', err);
      setAuthError('Something went wrong.');
    }
  }

  function handleLogout() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('rdh_currentUser');
    }
    setCurrentUser(null);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-start p-6 gap-4 bg-black text-white relative">
      {/* Auth bar */}
      <div className="w-full max-w-5xl flex justify-end">
        {currentUser ? (
          <div className="flex items-center gap-3 text-xs bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2">
            <span>
              Signed in as{' '}
              <span className="font-semibold">{currentUser}</span>
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="px-2 py-1 rounded-full border border-zinc-700 hover:bg-zinc-800"
            >
              Log out
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleAuthSubmit}
            className="flex flex-wrap items-center gap-2 text-xs bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2"
          >
            <input
              className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-xs text-white"
              placeholder="Username"
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
            />
            <input
              type="password"
              className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-xs text-white"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
            />
            <button
              type="submit"
              className="px-3 py-1 rounded-full bg-white text-black font-semibold"
            >
              {authMode === 'signIn' ? 'Sign in' : 'Sign up'}
            </button>
            <button
              type="button"
              onClick={() =>
                setAuthMode((mode) =>
                  mode === 'signIn' ? 'signUp' : 'signIn',
                )
              }
              className="px-2 py-1 rounded-full border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              {authMode === 'signIn'
                ? 'Create account'
                : 'Use existing account'}
            </button>
            {authError && (
              <div className="w-full text-[10px] text-red-400 mt-1">
                {authError}
              </div>
            )}
          </form>
        )}
      </div>

      <h1 className="text-3xl font-bold mt-2">Roblox Drip Hub (Prototype)</h1>

      {/* Tabs */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('builder')}
          className={`px-4 py-2 rounded-full text-sm border ${
            activeTab === 'builder'
              ? 'bg-white text-black border-white'
              : 'border-zinc-600 text-zinc-300 hover:border-white/70'
          }`}
        >
          Build outfit
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('your')}
          className={`px-4 py-2 rounded-full text-sm border ${
            activeTab === 'your'
              ? 'bg-white text-black border-white'
              : 'border-zinc-600 text-zinc-300 hover:border-white/70'
          }`}
        >
          Your outfits
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('leaderboard')}
          className={`px-4 py-2 rounded-full text-sm border ${
            activeTab === 'leaderboard'
              ? 'bg-white text-black border-white'
              : 'border-zinc-600 text-zinc-300 hover:border-white/70'
          }`}
        >
          Leaderboard
        </button>
      </div>

      {activeTab === 'builder' && (
        <>
          <p className="text-sm text-zinc-400">
            1) Pick a slot on the right • 2) Search for that slot • 3) Click a
            compatible item to fill it.
          </p>

          <div className="flex flex-col items-center gap-2 mt-2">
            <div className="text-xs text-zinc-400">
              Currently editing:{' '}
              <span className="font-semibold text-white">
                {selectedCategoryLabel}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                className="border rounded px-3 py-2 bg-zinc-900 border-zinc-700 text-white w-64"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={PLACEHOLDER_BY_CATEGORY[selectedCategoryKey]}
              />
              <button
                onClick={search}
                className="px-4 py-2 rounded bg-white text-black font-semibold disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {error && <p className="text-red-400">{error}</p>}

          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="text-sm text-zinc-400">Outfit preview</div>
            <div className="relative rounded-lg border border-zinc-700 bg-zinc-900/90 flex items-center justify-center">
              <canvas
                ref={previewCanvasRef}
                className="w-40 h-40 md:w-52 md:h-52"
                width={208}
                height={208}
              />
              {!hasAnySelected && (
                <span className="pointer-events-none absolute text-xs text-zinc-500 text-center px-4">
                  Pick items to see your outfit preview here.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={openSaveDialog}
              disabled={!isBuildComplete}
              className="mt-1 px-4 py-2 rounded bg-emerald-500 text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isBuildComplete ? 'Save outfit' : 'Fill all slots to save'}
            </button>
          </div>

          <div className="w-full max-w-5xl mt-4 grid grid-cols-1 md:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] gap-6">
            <div className="space-y-3">
              <div className="text-sm text-zinc-400">
                Only items that match{' '}
                  <span className="font-semibold text-white">
                  {selectedCategoryLabel}
                </span>{' '}
                can be added. Incompatible items are greyed out.
              </div>

              <div className="w-full grid gap-2">
                {items.map((item) => {
                  const isCompatible = isItemCompatible(
                    item,
                    selectedCategoryKey,
                  );
                  const isUsedSomewhere = (
                    Object.values(build) as (RobloxCatalogItem | null)[]
                  ).some((slotItem) => slotItem?.id === item.id);
                  const isUsedInSelected =
                    build[selectedCategoryKey]?.id === item.id;

                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => handleChooseItem(item)}
                      disabled={!isCompatible}
                      className={`border border-zinc-700 rounded p-3 flex items-center justify-between gap-3 bg-zinc-900 text-left transition-colors ${
                        isCompatible
                          ? 'hover:border-white/70 cursor-pointer'
                          : 'opacity-50 cursor-not-allowed'
                      } ${isUsedInSelected ? 'ring-2 ring-white/80' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        {item.thumbnailUrl && (
                          <img
                            src={item.thumbnailUrl}
                            alt={item.name}
                            className="w-16 h-16 rounded object-cover flex-shrink-0 bg-zinc-800"
                          />
                        )}
                        <div>
                          <div className="font-semibold">{item.name}</div>
                          {item.creatorName && (
                            <div className="text-sm text-zinc-400">
                              by {item.creatorName}
                            </div>
                          )}
                          {typeof item.price === 'number' && (
                            <div className="text-xs text-emerald-300 mt-1">
                              Price: {item.price.toLocaleString()} R$
                            </div>
                          )}
                          {isUsedSomewhere && (
                            <div className="text-xs text-emerald-400 mt-1">
                              ✓ In build
                            </div>
                          )}
                          {!isCompatible && (
                            <div className="text-xs text-red-300 mt-1">
                              Not compatible with {selectedCategoryLabel}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-zinc-500">ID: {item.id}</div>
                    </button>
                  );
                })}

                {!loading && items.length === 0 && (
                  <p className="text-zinc-500 text-sm">
                    No items yet. Try a search.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-950/60 flex flex-col gap-3">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h2 className="font-semibold text-lg">Build Outfit</h2>
                    <p className="text-xs text-zinc-400">
                      Click a slot to focus its search, then click a compatible
                      item.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetBuild}
                    className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  >
                    Reset build
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {CATEGORY_DEFS.map(({ key, label }) => {
                    const slotItem = build[key];
                    const isSelected = key === selectedCategoryKey;

                    return (
                      <div
                        key={key}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectCategory(key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectCategory(key);
                          }
                        }}
                        className={`w-full flex items-center justify-between gap-3 rounded-md px-3 py-2 border transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-white bg-zinc-900'
                            : 'border-zinc-700 bg-zinc-900/70 hover:border-white/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {slotItem?.thumbnailUrl ? (
                            <img
                              src={slotItem.thumbnailUrl}
                              alt={slotItem.name}
                              className="w-10 h-10 rounded object-cover bg-zinc-800 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-zinc-800/70 flex-shrink-0 flex items-center justify-center text-xs text-zinc-500">
                              Empty
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-semibold">
                              {label}
                            </div>
                            {slotItem ? (
                              <div className="text-xs text-zinc-300 truncate max-w-[180px]">
                                {slotItem.name}
                              </div>
                            ) : (
                              <div className="text-xs text-zinc-500">
                                Click here, then search.
                              </div>
                            )}
                          </div>
                        </div>

                        {slotItem && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearCategory(key);
                            }}
                            className="text-[10px] px-2 py-1 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* YOUR OUTFITS TAB */}
      {activeTab === 'your' && (
        <section className="w-full max-w-5xl mt-6">
          {!currentUser ? (
            <p className="text-sm text-zinc-400">
              Sign in or create an account to see your saved outfits.
            </p>
          ) : yourOutfits.length === 0 ? (
            <p className="text-sm text-zinc-400">
              You haven&apos;t saved any outfits yet. Build one on the{' '}
              <span className="font-semibold text-white">Build outfit</span> tab
              and click <span className="font-semibold">Save outfit</span>.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {yourOutfits.map((saved) => {
                const totalPrice = CATEGORY_DEFS.reduce((sum, { key }) => {
                  const item = saved.build[key];
                  if (item && typeof item.price === 'number') {
                    return sum + item.price;
                  }
                  return sum;
                }, 0);

                return (
                  <div
                    key={saved.id}
                    className="border border-zinc-800 rounded-lg p-4 bg-zinc-950 flex flex-col md:flex-row gap-4"
                  >
                    <div className="flex-shrink-0 flex items-center justify-center">
                      <OutfitThumbnailGrid build={saved.build} customImageUrl={saved.customImageUrl} />
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase text-zinc-500">
                            Outfit name
                          </div>
                          <div className="text-base font-semibold">
                            {saved.name || 'Untitled outfit'}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-1">
                            Visibility:{' '}
                            <span
                              className={
                                saved.isPublic
                                  ? 'text-emerald-400 font-semibold'
                                  : 'text-zinc-300'
                              }
                            >
                              {saved.isPublic
                                ? 'Public on leaderboard'
                                : 'Private (not on leaderboard)'}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            Current score:{' '}
                            <span className="text-zinc-200">
                              {saved.voteScore ?? 0}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          {totalPrice > 0 && (
                            <div className="text-xs text-emerald-400 font-semibold whitespace-nowrap">
                              Total: {totalPrice.toLocaleString()} R$
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => togglePublic(saved.id)}
                            className="mt-1 px-3 py-1 rounded-full border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800"
                          >
                            {saved.isPublic
                              ? 'Remove from leaderboard'
                              : 'Make public on leaderboard'}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 text-xs text-zinc-300">
                        {CATEGORY_DEFS.map(({ key, label }) => {
                          const item = saved.build[key];

                          if (item) {
                            const url = `https://www.roblox.com/catalog/${item.id}`;
                            return (
                              <a
                                key={key}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 border border-zinc-800/60 rounded-md px-2 py-1 bg-zinc-900/60 hover:border-emerald-400/80 hover:bg-zinc-900 transition-colors"
                              >
                                {item.thumbnailUrl ? (
                                  <img
                                    src={item.thumbnailUrl}
                                    alt={item.name}
                                    className="w-8 h-8 rounded object-cover bg-zinc-800 flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded bg-zinc-800/60 flex-shrink-0 flex items-center justify-center text-[9px] text-zinc-500">
                                    –
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-[10px] uppercase text-zinc-500">
                                    {label}
                                  </div>
                                  <div className="text-xs text-zinc-200 truncate">
                                    {item.name}
                                  </div>
                                  <div className="text-[10px] text-zinc-500">
                                    ID: {item.id} · Click to view
                                  </div>
                                  {typeof item.price === 'number' && (
                                    <div className="text-[10px] text-emerald-300">
                                      Price: {item.price.toLocaleString()} R$
                                    </div>
                                  )}
                                </div>
                              </a>
                            );
                          }

                          return (
                            <div
                              key={key}
                              className="flex items-center gap-2 border border-zinc-800/60 rounded-md px-2 py-1 bg-zinc-900/40"
                            >
                              <div className="w-8 h-8 rounded bg-zinc-800/60 flex-shrink-0 flex items-center justify-center text-[9px] text-zinc-500">
                                –
                              </div>
                              <div className="min-w-0">
                                <div className="text-[10px] uppercase text-zinc-500">
                                  {label}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  None
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* LEADERBOARD TAB */}
      {activeTab === 'leaderboard' && (
        <section className="w-full max-w-5xl mt-6">
          {leaderboardOutfits.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No public outfits on the leaderboard yet. Save an outfit and mark
              it public from the <span className="font-semibold">Your outfits</span>{' '}
              tab.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {leaderboardOutfits.map((saved, index) => {
                const totalPrice = CATEGORY_DEFS.reduce((sum, { key }) => {
                  const item = saved.build[key];
                  if (item && typeof item.price === 'number') {
                    return sum + item.price;
                  }
                  return sum;
                }, 0);

                const score = saved.voteScore ?? 0;
                const userVote = saved.userVote ?? null;

                return (
                  <div
                    key={saved.id}
                    className="border border-zinc-800 rounded-lg p-4 bg-zinc-950 flex flex-col md:flex-row gap-4"
                  >
                    <div className="flex-shrink-0 flex items-center justify-center">
                      <OutfitThumbnailGrid build={saved.build} customImageUrl={saved.customImageUrl} />
                    </div>
                    <div className="flex-1 text-sm">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase text-zinc-500">
                            Rank #{index + 1}
                          </div>
                          <div className="text-xs uppercase text-zinc-500">
                            Outfit name
                          </div>
                          <div className="text-base font-semibold">
                            {saved.name || 'Untitled outfit'}
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-1">
                            by{' '}
                            <span className="text-zinc-200">
                              {saved.owner}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          {totalPrice > 0 && (
                            <div className="text-xs text-emerald-400 font-semibold whitespace-nowrap">
                              Total: {totalPrice.toLocaleString()} R$
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => handleVote(saved.id, 'up')}
                              disabled={saved.owner === currentUser}
                              className={`px-2 py-1 rounded-full border flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed ${
                                userVote === 'up'
                                  ? 'bg-emerald-500 text-black border-emerald-400'
                                  : 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                              }`}
                            >
                              👍
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVote(saved.id, 'down')}
                              disabled={saved.owner === currentUser}
                              className={`px-2 py-1 rounded-full border flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed ${
                                userVote === 'down'
                                  ? 'bg-red-500 text-black border-red-400'
                                  : 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                              }`}
                            >
                              👎
                            </button>
                            <span className="px-2 py-1 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-200">
                              Score: {score}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 text-xs text-zinc-300">
                        {CATEGORY_DEFS.map(({ key, label }) => {
                          const item = saved.build[key];

                          if (item) {
                            const url = `https://www.roblox.com/catalog/${item.id}`;

                            return (
                              <a
                                key={key}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 border border-zinc-800/60 rounded-md px-2 py-1 bg-zinc-900/60 hover:border-emerald-400/80 hover:bg-zinc-900 transition-colors"
                              >
                                {item.thumbnailUrl ? (
                                  <img
                                    src={item.thumbnailUrl}
                                    alt={item.name}
                                    className="w-8 h-8 rounded object-cover bg-zinc-800 flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded bg-zinc-800/60 flex-shrink-0 flex items-center justify-center text-[9px] text-zinc-500">
                                    –
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-[10px] uppercase text-zinc-500">
                                    {label}
                                  </div>
                                  <div className="text-xs text-zinc-200 truncate">
                                    {item.name}
                                  </div>
                                  <div className="text-[10px] text-zinc-500">
                                    ID: {item.id} · Click to view
                                  </div>
                                  {typeof item.price === 'number' && (
                                    <div className="text-[10px] text-emerald-300">
                                      Price: {item.price.toLocaleString()} R$
                                    </div>
                                  )}
                                </div>
                              </a>
                            );
                          }

                          return (
                            <div
                              key={key}
                              className="flex items-center gap-2 border border-zinc-800/60 rounded-md px-2 py-1 bg-zinc-900/40"
                            >
                              <div className="w-8 h-8 rounded bg-zinc-800/60 flex-shrink-0 flex items-center justify-center text-[9px] text-zinc-500">
                                –
                              </div>
                              <div className="min-w-0">
                                <div className="text-[10px] uppercase text-zinc-500">
                                  {label}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  None
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Save outfit dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-5 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-3">Save outfit</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Give your outfit a name. It will appear on the leaderboard once you make it public.
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Outfit name (optional)
                </label>
                <input
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700 text-sm text-white"
                  placeholder="e.g. Cozy winter fit"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 text-sm">
              <button
                type="button"
                onClick={cancelSaveDialog}
                className="px-3 py-1.5 rounded border border-zinc-600 text-zinc-200 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSaveBuild}
                className="px-3 py-1.5 rounded bg-emerald-500 text-black font-semibold"
              >
                Save outfit
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}