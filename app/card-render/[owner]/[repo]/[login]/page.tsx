import { getCachedRepo } from '@/app/lib/repo-cache';
import { notFound } from 'next/navigation';

interface Params {
  owner: string;
  repo: string;
  login: string;
}

function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

function rarityColor(r: string): string {
  const map: Record<string, string> = {
    mythic: '#ff0040',
    legendary: '#ffd700',
    epic: '#c084fc',
    rare: '#60a5fa',
    common: '#888',
  };
  return map[r] || '#888';
}

function powerGrad(r: string): string {
  const map: Record<string, string> = {
    mythic: 'linear-gradient(90deg,#ff0040,#ff6600,#ff00ff)',
    legendary: 'linear-gradient(90deg,#ffd700,#ff6ec7)',
    epic: 'linear-gradient(90deg,#a855f7,#6366f1)',
    rare: 'linear-gradient(90deg,#3b82f6,#06b6d4)',
    common: 'linear-gradient(90deg,#555,#777)',
  };
  return map[r] || 'linear-gradient(90deg,#555,#777)';
}

export default async function CardRenderPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { owner, repo, login } = await params;
  const cacheKey = `${owner}/${repo}`.toLowerCase();
  const cached = await getCachedRepo(cacheKey);

  if (!cached || !Array.isArray(cached)) {
    notFound();
  }

  const contributor = cached.find(
    (c: any) => c.login.toLowerCase() === login.toLowerCase()
  );

  if (!contributor) {
    notFound();
  }

  const c = contributor;
  const idx = cached.indexOf(contributor) + 1;
  const total = cached.length;
  const repoName = `${owner}/${repo}`;
  const rc = rarityColor(c.rarity);

  // Build sparkles deterministically (seeded by login hash) for consistency
  let sparklesHTML = '';
  if (c.rarity === 'mythic' || c.rarity === 'legendary' || c.rarity === 'epic') {
    const count = c.rarity === 'mythic' ? 24 : c.rarity === 'legendary' ? 16 : 8;
    const sparkles: string[] = [];
    // Use deterministic positions based on index for screenshot consistency
    for (let i = 0; i < count; i++) {
      const left = ((i * 37 + 13) % 100);
      const top = ((i * 53 + 7) % 100);
      const dur = 1.5 + (i % 5) * 0.4;
      const delay = (i % 7) * 0.43;
      sparkles.push(
        `<div class="sparkle" style="left:${left}%;top:${top}%;--dur:${dur}s;--delay:${delay}s"></div>`
      );
    }
    sparklesHTML = `<div class="card-sparkles">${sparkles.join('')}</div>`;
  }

  const statsHTML = `
    <div class="stat-box"><div class="stat-value" style="color:${rc}">${fmt(c.commits)}</div><div class="stat-label">Commits</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#4ade80">${fmt(c.prsMerged)}</div><div class="stat-label">PRs Merged</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#f472b6">${fmt(c.issues)}</div><div class="stat-label">Issues</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#4adede">${c.activeWeeks}</div><div class="stat-label">Active Wks</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#c084fc">${c.peak}</div><div class="stat-label">Peak Week</div></div>
    <div class="stat-box"><div class="stat-value" style="color:#facc15">${c.maxStreak}w</div><div class="stat-label">Streak</div></div>`;

  const cardHTML = `<div class="card" data-rarity="${c.rarity}"><div class="card-inner"><div class="card-shine"></div><div class="card-holo"></div><div class="card-rainbow"></div>${sparklesHTML}
    <div class="card-header-repo">${repoName}</div>
    <div class="card-top"><div class="card-top-bg"><img src="${c.avatar}" alt="" /></div><div class="card-top-overlay"></div>
    <div class="title-chip" style="color:${rc}">${c.title}</div>
    <div class="rarity-badge ${c.rarity}">${c.rarity}</div>
    <div class="avatar-container"><div class="avatar-ring"><img src="${c.avatar}" alt="${c.login}" /></div></div></div>
    <div class="card-body"><div class="card-name">${c.login}</div>
    <div class="card-title">${c.title}</div>
    <div class="power-bar"><span class="power-label">PWR</span><div class="power-track"><div class="power-fill" style="width:${c.power}%;background:${powerGrad(c.rarity)}"></div></div><span class="power-value" style="color:${rc}">${c.power}</span></div>
    <div class="stats-grid">${statsHTML}</div>
    <div class="ability-trait">
      <span class="ability-icon">${c.ability.icon}</span>
      <div class="ability-info"><div class="ability-name" style="color:${c.ability.color}">${c.ability.name}</div><div class="ability-desc">${c.ability.desc}</div></div>
    </div>
    </div>
    <div class="card-footer"><span>#${String(idx).padStart(3, '0')} / ${total}</span><span class="card-footer-brand">GitPacks</span></div></div>
    <div class="card-total-badge">${total} in set</div></div>`;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        margin: 0,
        padding: 0,
      }}
    >
      <div
        id="card-wrapper"
        data-ready="true"
        style={{
          width: '320px',
          height: '480px',
        }}
        dangerouslySetInnerHTML={{ __html: cardHTML }}
      />
    </div>
  );
}
