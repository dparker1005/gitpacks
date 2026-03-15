// Shared SVG card generator — produces an animated SVG string for a contributor card

const RARITY_COLORS: Record<string, string> = {
  mythic: '#ff0040', legendary: '#ffd700', epic: '#c084fc', rare: '#60a5fa', common: '#888',
};
const RARITY_BORDER_COLORS: Record<string, string[]> = {
  mythic: ['#ff0040', '#ff6600', '#ff00ff'],
  legendary: ['#ffd700', '#ff6ec7'],
  epic: ['#a855f7', '#6366f1'],
  rare: ['#3b82f6', '#06b6d4'],
  common: ['#3a3a5a', '#4a4a6a'],
};
const INNER_BG_COLORS: Record<string, [string, string, string]> = {
  mythic: ['#1a0a0a', '#200810', '#1a0508'],
  legendary: ['#1a1420', '#201530', '#150f24'],
  epic: ['#161428', '#1a1538', '#110f24'],
  rare: ['#121428', '#151a35', '#0f1224'],
  common: ['#141428', '#1a1a35', '#0f0f24'],
};
const POWER_GRAD_COLORS: Record<string, string[]> = {
  mythic: ['#ff0040', '#ff6600', '#ff00ff'],
  legendary: ['#ffd700', '#ff6ec7'],
  epic: ['#a855f7', '#6366f1'],
  rare: ['#3b82f6', '#06b6d4'],
  common: ['#555', '#777'],
};
const BADGE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  mythic: { bg: 'rgba(255,0,64,0.4)', color: '#ff0040', border: 'rgba(255,0,64,0.6)' },
  legendary: { bg: 'rgba(255,215,0,0.3)', color: '#ffd700', border: 'rgba(255,215,0,0.4)' },
  epic: { bg: 'rgba(168,85,247,0.25)', color: '#c084fc', border: 'rgba(168,85,247,0.4)' },
  rare: { bg: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: 'rgba(59,130,246,0.4)' },
  common: { bg: 'rgba(100,100,130,0.3)', color: '#888', border: 'rgba(100,100,130,0.4)' },
};

function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildCardSvg(
  c: any,
  cardNum: number,
  total: number,
  repoName: string,
  options: { animated?: boolean } = {}
): string {
  const { animated = true } = options;
  const W = 480;
  const H = 720;
  const rc = RARITY_COLORS[c.rarity] || '#888';
  const borderColors = RARITY_BORDER_COLORS[c.rarity] || RARITY_BORDER_COLORS.common;
  const innerBg = INNER_BG_COLORS[c.rarity] || INNER_BG_COLORS.common;
  const powerColors = POWER_GRAD_COLORS[c.rarity] || POWER_GRAD_COLORS.common;
  const badge = BADGE_STYLES[c.rarity] || BADGE_STYLES.common;
  const isHighRarity = c.rarity === 'mythic' || c.rarity === 'legendary' || c.rarity === 'epic';
  const borderWidth = c.rarity === 'mythic' ? 5 : c.rarity === 'common' ? 2 : 3;

  const stats = [
    { label: 'Commits', value: fmt(c.commits), color: rc },
    { label: 'PRs Merged', value: fmt(c.prsMerged), color: '#4ade80' },
    { label: 'Issues', value: fmt(c.issues), color: '#f472b6' },
    { label: 'Active Wks', value: String(c.activeWeeks), color: '#4adede' },
    { label: 'Peak Week', value: String(c.peak), color: '#c084fc' },
    { label: 'Streak', value: `${c.maxStreak}w`, color: '#facc15' },
  ];

  // Animation CSS
  const animationCSS = animated ? `
    @keyframes shimmer {
      0% { opacity: 0.03; }
      50% { opacity: 0.08; }
      100% { opacity: 0.03; }
    }
    @keyframes borderGlow {
      0% { opacity: 0.8; }
      50% { opacity: 1; }
      100% { opacity: 0.8; }
    }
    @keyframes sparkle {
      0%, 100% { opacity: 0; transform: scale(0.5); }
      50% { opacity: 1; transform: scale(1); }
    }
    @keyframes holo {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }
    .border-glow { animation: borderGlow 3s ease-in-out infinite; }
    .shimmer-overlay { animation: shimmer 4s ease-in-out infinite; }
    .sparkle { animation: sparkle var(--dur) ease-in-out var(--delay) infinite; }
    .holo-sweep { animation: holo 6s ease-in-out infinite; }
  ` : '';

  // Sparkles for high rarity
  let sparklesHtml = '';
  if (isHighRarity) {
    const count = c.rarity === 'mythic' ? 20 : c.rarity === 'legendary' ? 14 : 8;
    for (let i = 0; i < count; i++) {
      const cx = (i * 37 + 13) % 100 * (W - 20) / 100 + 10;
      const cy = (i * 53 + 7) % 100 * (H - 20) / 100 + 10;
      const dur = 1.5 + (i % 5) * 0.5;
      const delay = (i % 7) * 0.5;
      sparklesHtml += `<circle class="sparkle" cx="${cx}" cy="${cy}" r="1.5" fill="white" style="--dur:${dur}s;--delay:${delay}s" />`;
    }
  }

  // Holo sweep for epic+
  const holoSweep = isHighRarity && animated ? `
    <defs>
      <linearGradient id="holoGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="white" stop-opacity="0" />
        <stop offset="40%" stop-color="white" stop-opacity="0" />
        <stop offset="50%" stop-color="white" stop-opacity="0.06" />
        <stop offset="60%" stop-color="white" stop-opacity="0" />
        <stop offset="100%" stop-color="white" stop-opacity="0" />
      </linearGradient>
    </defs>
    <rect class="holo-sweep" x="0" y="0" width="${W}" height="${H}" rx="18" fill="url(#holoGrad)" />
  ` : '';

  // Stats grid (3 cols x 2 rows)
  const statW = 140;
  const statH = 48;
  const statGap = 6;
  const statsStartX = (W - (statW * 3 + statGap * 2)) / 2;
  const statsStartY = 480;

  const statsHtml = stats.map((s, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = statsStartX + col * (statW + statGap);
    const y = statsStartY + row * (statH + statGap);
    return `
      <rect x="${x}" y="${y}" width="${statW}" height="${statH}" rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
      <text x="${x + statW / 2}" y="${y + 22}" fill="${s.color}" font-family="'Orbitron',sans-serif" font-size="16" font-weight="700" text-anchor="middle">${escapeXml(s.value)}</text>
      <text x="${x + statW / 2}" y="${y + 38}" fill="#666" font-family="'Rajdhani',sans-serif" font-size="9" text-anchor="middle" letter-spacing="1" text-transform="uppercase">${escapeXml(s.label)}</text>
    `;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&amp;family=Rajdhani:wght@500;700&amp;display=swap');
    ${animationCSS}
  </style>

  <defs>
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      ${borderColors.map((c, i) => `<stop offset="${i * 100 / Math.max(borderColors.length - 1, 1)}%" stop-color="${c}" />`).join('')}
    </linearGradient>
    <linearGradient id="innerBg" x1="0%" y1="0%" x2="50%" y2="100%">
      ${innerBg.map((c, i) => `<stop offset="${i * 50}%" stop-color="${c}" />`).join('')}
    </linearGradient>
    <linearGradient id="powerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      ${powerColors.map((c, i) => `<stop offset="${i * 100 / Math.max(powerColors.length - 1, 1)}%" stop-color="${c}" />`).join('')}
    </linearGradient>
    <radialGradient id="innerGlow" cx="50%" cy="0%" rx="60%" ry="50%">
      <stop offset="0%" stop-color="${rc}" stop-opacity="0.15" />
      <stop offset="60%" stop-color="${rc}" stop-opacity="0.03" />
      <stop offset="100%" stop-color="${rc}" stop-opacity="0" />
    </radialGradient>
    <clipPath id="avatarClip"><circle cx="${W / 2}" cy="268" r="48" /></clipPath>
    <clipPath id="innerClip"><rect x="${borderWidth}" y="${borderWidth}" width="${W - borderWidth * 2}" height="${H - borderWidth * 2}" rx="${18 - borderWidth}" /></clipPath>
    <filter id="avatarBlur"><feGaussianBlur stdDeviation="25" /></filter>
  </defs>

  <!-- Border -->
  <rect class="${animated ? 'border-glow' : ''}" x="0" y="0" width="${W}" height="${H}" rx="20" fill="url(#borderGrad)" />

  <!-- Inner card -->
  <rect x="${borderWidth}" y="${borderWidth}" width="${W - borderWidth * 2}" height="${H - borderWidth * 2}" rx="${18 - borderWidth}" fill="url(#innerBg)" />

  <!-- Inner glow -->
  <rect x="${borderWidth}" y="${borderWidth}" width="${W - borderWidth * 2}" height="${H - borderWidth * 2}" rx="${18 - borderWidth}" fill="url(#innerGlow)" />

  <!-- Clipped content -->
  <g clip-path="url(#innerClip)">

    <!-- Avatar blurred background -->
    <image href="${escapeXml(c.avatar)}" x="0" y="30" width="${W}" height="220" preserveAspectRatio="xMidYMid slice" filter="url(#avatarBlur)" opacity="0.3" />

    <!-- Top overlay gradient -->
    <defs>
      <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="30%" stop-color="${innerBg[2]}" stop-opacity="0" />
        <stop offset="100%" stop-color="${innerBg[2]}" stop-opacity="1" />
      </linearGradient>
    </defs>
    <rect x="0" y="30" width="${W}" height="220" fill="url(#topFade)" />

    <!-- Shimmer overlay -->
    <rect class="${animated ? 'shimmer-overlay' : ''}" x="0" y="0" width="${W}" height="${H}" fill="${rc}" opacity="0.03" />

    <!-- Repo header bar -->
    <rect x="${borderWidth}" y="${borderWidth}" width="${W - borderWidth * 2}" height="32" fill="rgba(0,0,0,0.7)" />
    <line x1="${borderWidth}" y1="${borderWidth + 32}" x2="${W - borderWidth}" y2="${borderWidth + 32}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
    <text x="${W / 2}" y="${borderWidth + 21}" fill="rgba(255,255,255,0.75)" font-family="'Orbitron',sans-serif" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="2">${escapeXml(repoName.toUpperCase())}</text>

    <!-- Title chip -->
    <rect x="16" y="52" width="${Math.min(c.title.length * 9 + 24, 200)}" height="26" rx="6" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
    <text x="28" y="70" fill="${rc}" font-family="'Orbitron',sans-serif" font-size="11" font-weight="700" letter-spacing="1.5">${escapeXml(c.title.toUpperCase())}</text>

    <!-- Rarity badge -->
    <rect x="${W - 16 - c.rarity.length * 10 - 24}" y="52" width="${c.rarity.length * 10 + 24}" height="26" rx="6" fill="${badge.bg}" stroke="${badge.border}" stroke-width="1" />
    <text x="${W - 16 - (c.rarity.length * 10 + 24) / 2}" y="70" fill="${badge.color}" font-family="'Orbitron',sans-serif" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="2">${escapeXml(c.rarity.toUpperCase())}</text>

    <!-- Avatar ring -->
    <circle cx="${W / 2}" cy="268" r="53" fill="url(#borderGrad)" />
    <circle cx="${W / 2}" cy="268" r="49" fill="${innerBg[2]}" />
    <image href="${escapeXml(c.avatar)}" x="${W / 2 - 48}" y="${268 - 48}" width="96" height="96" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />

    <!-- Name -->
    <text x="${W / 2}" y="345" fill="#fff" font-family="'Orbitron',sans-serif" font-size="20" font-weight="700" text-anchor="middle" letter-spacing="1">${escapeXml(c.login)}</text>

    <!-- Subtitle -->
    <text x="${W / 2}" y="365" fill="#888" font-family="'Rajdhani',sans-serif" font-size="14" text-anchor="middle" letter-spacing="1">${escapeXml(c.title.toUpperCase())}</text>

    <!-- Power bar -->
    <text x="20" y="398" fill="#666" font-family="'Orbitron',sans-serif" font-size="9" letter-spacing="2">PWR</text>
    <rect x="52" y="389" width="${W - 105}" height="7" rx="4" fill="#1a1a35" />
    <rect x="52" y="389" width="${Math.round((W - 105) * c.power / 100)}" height="7" rx="4" fill="url(#powerGrad)" />
    <text x="${W - 20}" y="400" fill="${rc}" font-family="'Orbitron',sans-serif" font-size="16" font-weight="700" text-anchor="end">${c.power}</text>

    <!-- Stats grid -->
    ${statsHtml}

    <!-- Ability -->
    <rect x="18" y="590" width="${W - 36}" height="50" rx="10" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
    <text x="44" y="614" fill="${rc}" font-size="20" text-anchor="middle">${c.ability.icon}</text>
    <text x="62" y="610" fill="${escapeXml(c.ability.color)}" font-family="'Orbitron',sans-serif" font-size="11" font-weight="700" letter-spacing="1">${escapeXml(c.ability.name)}</text>
    <text x="62" y="628" fill="#777" font-family="'Rajdhani',sans-serif" font-size="12">${escapeXml(c.ability.desc)}</text>

    <!-- Sparkles -->
    ${sparklesHtml}

    <!-- Holo sweep -->
    ${holoSweep}

  </g>

  <!-- Footer -->
  <rect x="${borderWidth}" y="${H - borderWidth - 32}" width="${W - borderWidth * 2}" height="32" rx="0" fill="rgba(0,0,0,0.3)" />
  <line x1="${borderWidth}" y1="${H - borderWidth - 32}" x2="${W - borderWidth}" y2="${H - borderWidth - 32}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
  <text x="${borderWidth + 16}" y="${H - borderWidth - 12}" fill="#888" font-family="'Orbitron',sans-serif" font-size="10" letter-spacing="1.5">#${String(cardNum).padStart(3, '0')} / ${total}</text>
  <text x="${W - borderWidth - 16}" y="${H - borderWidth - 12}" fill="#7873f5" font-family="'Orbitron',sans-serif" font-size="11" font-weight="700" text-anchor="end">GitPacks</text>
</svg>`;
}
