"use client";

import { useEffect, useMemo, useState } from "react";

type Rarity = "mythic" | "legendary" | "epic" | "rare" | "common";

interface CardEntry {
  owner_repo: string;
  card_num: number;
  total_cards: number;
  owned_count: number;
  contributor: {
    login: string;
    avatar: string | null;
    rarity: Rarity;
    power: number;
    title: string | null;
    ability: { name?: string; desc?: string; icon?: string; color?: string } | null;
    commits: number;
    prsMerged: number;
    issues: number;
    maxStreak: number;
    peak: number;
    activeWeeks: number;
    totalWeeks: number;
  };
}

interface ApiResponse {
  meta: { login: string; avatar: string | null };
  cards: CardEntry[];
  viewer_authenticated: boolean;
}

const RARITY_ORDER: Rarity[] = ["mythic", "legendary", "epic", "rare", "common"];

type SortKey = "power" | "rarity" | "repo" | "owned";
type OwnedFilter = "all" | "owned" | "missing";

export default function ContributorClient({ login }: { login: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterRarity, setFilterRarity] = useState<"all" | Rarity>("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("power");
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>("all");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cards-by-contributor/${encodeURIComponent(login)}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Not found" : "Failed to load");
        return r.json();
      })
      .then((d: ApiResponse) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || "Failed to load");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [login]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let pool = [...data.cards];
    if (filterRarity !== "all") pool = pool.filter((c) => c.contributor.rarity === filterRarity);
    if (search) {
      const q = search.toLowerCase();
      pool = pool.filter((c) => c.owner_repo.toLowerCase().includes(q));
    }
    if (ownedFilter === "owned") pool = pool.filter((c) => c.owned_count > 0);
    if (ownedFilter === "missing") pool = pool.filter((c) => c.owned_count === 0);

    const rarityRank = (r: Rarity) => RARITY_ORDER.indexOf(r);
    const sorters: Record<SortKey, (a: CardEntry, b: CardEntry) => number> = {
      power: (a, b) => b.contributor.power - a.contributor.power,
      rarity: (a, b) =>
        rarityRank(a.contributor.rarity) - rarityRank(b.contributor.rarity) ||
        b.contributor.power - a.contributor.power,
      repo: (a, b) => a.owner_repo.localeCompare(b.owner_repo),
      owned: (a, b) => b.owned_count - a.owned_count || b.contributor.power - a.contributor.power,
    };
    pool.sort(sorters[sortBy]);
    return pool;
  }, [data, filterRarity, search, sortBy, ownedFilter]);

  const rarityCounts = useMemo(() => {
    const counts: Record<Rarity, number> = { mythic: 0, legendary: 0, epic: 0, rare: 0, common: 0 };
    if (data) for (const c of data.cards) counts[c.contributor.rarity]++;
    return counts;
  }, [data]);

  const ownedTotals = useMemo(() => {
    if (!data) return { unique: 0, total: 0 };
    let unique = 0;
    let total = 0;
    for (const c of data.cards) {
      if (c.owned_count > 0) {
        unique++;
        total += c.owned_count;
      }
    }
    return { unique, total };
  }, [data]);

  if (loading) {
    return (
      <div className="contributor-page">
        <div className="contributor-loading">Loading cards...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="contributor-page">
        <div className="contributor-error">{error || "No cards found"}</div>
        <a href="/" className="profile-back-link">Back to GitPacks</a>
      </div>
    );
  }

  const displayLogin = data.meta.login || login;
  const avatar = data.meta.avatar;
  const totalRepos = data.cards.length;

  return (
    <div className="contributor-page">
      <a href="/" className="profile-back-link">← Back to GitPacks</a>

      <div className="contributor-header">
        {avatar && (
          <img src={avatar} alt={displayLogin} className="contributor-avatar" />
        )}
        <div className="contributor-header-info">
          <h1 className="contributor-username">{displayLogin}</h1>
          <p className="contributor-subtitle">
            {totalRepos === 0
              ? "No cards in any tracked repos yet"
              : `${totalRepos} card${totalRepos === 1 ? "" : "s"} across tracked repos`}
          </p>
        </div>
        <div className="contributor-header-links">
          <a
            href={`https://github.com/${displayLogin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="profile-gh-link"
          >
            GitHub
          </a>
          <a href={`/profile/${encodeURIComponent(displayLogin)}`} className="profile-gh-link">
            Profile
          </a>
        </div>
      </div>

      {totalRepos > 0 && (
        <>
          <div className="contributor-stats">
            <div className="profile-stat-card">
              <div className="profile-stat-value">{totalRepos}</div>
              <div className="profile-stat-label">Repos</div>
            </div>
            <div className="profile-stat-card">
              <div className="profile-stat-value mythic-text">{rarityCounts.mythic}</div>
              <div className="profile-stat-label">Mythic</div>
            </div>
            <div className="profile-stat-card">
              <div className="profile-stat-value legendary-text">{rarityCounts.legendary}</div>
              <div className="profile-stat-label">Legendary</div>
            </div>
            <div className="profile-stat-card">
              <div className="profile-stat-value epic-text">{rarityCounts.epic}</div>
              <div className="profile-stat-label">Epic</div>
            </div>
            {data.viewer_authenticated && (
              <div className="profile-stat-card">
                <div className="profile-stat-value">{ownedTotals.unique}/{totalRepos}</div>
                <div className="profile-stat-label">You Own</div>
              </div>
            )}
          </div>

          <div className="contributor-controls">
            <input
              type="text"
              className="contributor-search"
              placeholder="Filter by repo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="contributor-select"
              value={filterRarity}
              onChange={(e) => setFilterRarity(e.target.value as "all" | Rarity)}
            >
              <option value="all">All rarities</option>
              <option value="mythic">Mythic</option>
              <option value="legendary">Legendary</option>
              <option value="epic">Epic</option>
              <option value="rare">Rare</option>
              <option value="common">Common</option>
            </select>
            <select
              className="contributor-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
            >
              <option value="power">Sort: Power</option>
              <option value="rarity">Sort: Rarity</option>
              <option value="repo">Sort: Repo name</option>
              {data.viewer_authenticated && <option value="owned">Sort: Owned</option>}
            </select>
            {data.viewer_authenticated && (
              <select
                className="contributor-select"
                value={ownedFilter}
                onChange={(e) => setOwnedFilter(e.target.value as OwnedFilter)}
              >
                <option value="all">All cards</option>
                <option value="owned">Owned only</option>
                <option value="missing">Missing only</option>
              </select>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="profile-empty">No cards match the current filters.</p>
          ) : (
            <div className="contributor-grid">
              {filtered.map((entry) => {
                const c = entry.contributor;
                const owned = entry.owned_count > 0;
                const cardImg = `/api/card/${entry.owner_repo}/${encodeURIComponent(c.login)}`;
                const cardLink = `/card/${entry.owner_repo}/${encodeURIComponent(c.login)}`;
                return (
                  <a
                    key={entry.owner_repo}
                    href={cardLink}
                    className={`contributor-cell rarity-border-${c.rarity} ${owned ? "" : "ghost"}`}
                    data-rarity={c.rarity}
                  >
                    <div className="contributor-cell-img">
                      <img src={cardImg} alt={`${c.login} card for ${entry.owner_repo}`} loading="lazy" />
                      {data.viewer_authenticated && entry.owned_count > 1 && (
                        <span className="contributor-qty">x{entry.owned_count}</span>
                      )}
                      {data.viewer_authenticated && !owned && (
                        <span className="contributor-missing-tag">Missing</span>
                      )}
                    </div>
                    <div className="contributor-cell-meta">
                      <span className="contributor-cell-repo" title={entry.owner_repo}>
                        {entry.owner_repo}
                      </span>
                      <span className={`my-rarity-badge ${c.rarity}`}>{c.rarity}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
