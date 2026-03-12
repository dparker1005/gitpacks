import { NextRequest, NextResponse } from 'next/server';
import { getCachedRepo } from '../../../cache';

interface Contributor {
  rarity: string;
  [key: string]: any;
}

function selectPackCards(allContributors: Contributor[], count: number): Contributor[] {
  const weights: Record<string, number> = { mythic: 1, legendary: 3, epic: 10, rare: 22, common: 64 };
  const byRarity: Record<string, Contributor[]> = { mythic: [], legendary: [], epic: [], rare: [], common: [] };
  allContributors.forEach((c) => byRarity[c.rarity].push(c));

  // Build weighted pool based on available rarities
  function rollRarity(): string {
    const available: Record<string, number> = {};
    let totalW = 0;
    for (const r of ['mythic', 'legendary', 'epic', 'rare', 'common']) {
      if (byRarity[r].length > 0) {
        available[r] = weights[r];
        totalW += weights[r];
      }
    }
    let roll = Math.random() * totalW;
    for (const [r, w] of Object.entries(available)) {
      roll -= w;
      if (roll <= 0) return r;
    }
    return 'common';
  }

  const picks: Contributor[] = [];

  // Guarantee at least one rare+ card per pack
  const rareOrBetter = [...byRarity.rare, ...byRarity.epic, ...byRarity.legendary];
  if (rareOrBetter.length > 0) {
    // Roll rarity for guaranteed slot (rare+ only)
    const guarWeights: Record<string, number> = { mythic: 1, legendary: 3, epic: 10, rare: 86 };
    const guarAvail: Record<string, number> = {};
    let guarTotal = 0;
    for (const r of ['mythic', 'legendary', 'epic', 'rare']) {
      if (byRarity[r].length > 0) {
        guarAvail[r] = guarWeights[r];
        guarTotal += guarWeights[r];
      }
    }
    let roll = Math.random() * guarTotal;
    let guarRarity = 'rare';
    for (const [r, w] of Object.entries(guarAvail)) {
      roll -= w;
      if (roll <= 0) {
        guarRarity = r;
        break;
      }
    }
    const pool = byRarity[guarRarity];
    picks.push(pool[Math.floor(Math.random() * pool.length)]);
  }

  // Fill remaining slots with weighted random
  while (picks.length < count) {
    const rarity = rollRarity();
    const pool = byRarity[rarity];
    const c = pool[Math.floor(Math.random() * pool.length)];
    if (picks.includes(c) && picks.length < allContributors.length) continue;
    picks.push(c);
  }

  // Shuffle
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }

  return picks;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const { owner, repo } = await params;

  if (!owner || !repo) {
    return NextResponse.json({ error: 'Missing owner or repo' }, { status: 400 });
  }

  const cacheKey = `${owner}/${repo}`.toLowerCase();
  const cached = await getCachedRepo(cacheKey);

  if (!cached) {
    return NextResponse.json(
      { error: 'Repo data not cached. Fetch /api/repo/[owner]/[repo] first.' },
      { status: 404 }
    );
  }

  const allContributors: Contributor[] = cached;

  if (!Array.isArray(allContributors) || allContributors.length === 0) {
    return NextResponse.json({ error: 'No contributor data available' }, { status: 404 });
  }

  const countParam = request.nextUrl.searchParams.get('count');
  const count = countParam ? Math.max(1, Math.min(parseInt(countParam, 10) || 5, 30)) : 5;

  const cards = selectPackCards(allContributors, count);

  return NextResponse.json(cards);
}
