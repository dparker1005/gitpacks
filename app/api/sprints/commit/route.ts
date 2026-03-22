import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase-server';
import { getCachedRepo } from '@/app/lib/repo-cache';

const RARITY_SLOTS = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
const RARITY_ORDER: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

/**
 * Auto-select the best lineup from a user's collection for a sprint repo.
 * Slots: mythic-or-lower, legendary-or-lower, epic, rare, common
 * Each card can only be used once. Strategy: fill from bottom (common) up.
 */
function autoSelectLineup(
  contributors: any[],
  library: Record<string, number>
): { card_common: string | null; card_rare: string | null; card_epic: string | null; card_legendary: string | null; card_mythic: string | null; total_power: number } {
  // Get owned cards with their data
  const owned = contributors
    .filter(c => library[c.login])
    .map(c => ({ login: c.login, rarity: c.rarity, power: c.power }));

  // Group by rarity
  const byRarity: Record<string, typeof owned> = {};
  for (const c of owned) {
    if (!byRarity[c.rarity]) byRarity[c.rarity] = [];
    byRarity[c.rarity].push(c);
  }
  // Sort each group by power descending
  for (const r of Object.keys(byRarity)) {
    byRarity[r].sort((a, b) => b.power - a.power);
  }

  const used = new Set<string>();
  const result: { card_common: string | null; card_rare: string | null; card_epic: string | null; card_legendary: string | null; card_mythic: string | null; total_power: number } = {
    card_common: null, card_rare: null, card_epic: null, card_legendary: null, card_mythic: null, total_power: 0
  };

  // Helper: pick best available card of exact rarity that hasn't been used
  function pickExact(rarity: string): { login: string; power: number } | null {
    const pool = byRarity[rarity] || [];
    for (const c of pool) {
      if (!used.has(c.login)) {
        used.add(c.login);
        return c;
      }
    }
    return null;
  }

  // Helper: pick best available card at or below a max rarity
  function pickAtOrBelow(maxRarity: string): { login: string; power: number } | null {
    const maxIdx = RARITY_ORDER[maxRarity];
    // Try from highest allowed rarity down to common
    for (let i = maxIdx; i >= 0; i--) {
      const rarity = RARITY_SLOTS[i];
      const pick = pickExact(rarity);
      if (pick) return pick;
    }
    return null;
  }

  // Fill fixed-rarity slots first (bottom up: common, rare, epic)
  const common = pickExact('common');
  if (common) { result.card_common = common.login; result.total_power += common.power; }

  const rare = pickExact('rare');
  if (rare) { result.card_rare = rare.login; result.total_power += rare.power; }

  const epic = pickExact('epic');
  if (epic) { result.card_epic = epic.login; result.total_power += epic.power; }

  // Flexible slots: legendary-or-lower, then mythic-or-lower
  const legendary = pickAtOrBelow('legendary');
  if (legendary) { result.card_legendary = legendary.login; result.total_power += legendary.power; }

  const mythic = pickAtOrBelow('mythic');
  if (mythic) { result.card_mythic = mythic.login; result.total_power += mythic.power; }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { sprintId } = body;
    if (!sprintId) {
      return NextResponse.json({ error: 'Missing sprintId' }, { status: 400 });
    }

    // Get sprint details
    const { data: sprint, error: sprintErr } = await supabase
      .from('sprints')
      .select('id, repo_owner, repo_name, type, starts_at, ends_at')
      .eq('id', sprintId)
      .single();

    if (sprintErr || !sprint) {
      return NextResponse.json({ error: 'Sprint not found' }, { status: 404 });
    }

    // Validate sprint is active
    const now = new Date();
    if (now < new Date(sprint.starts_at) || now >= new Date(sprint.ends_at)) {
      return NextResponse.json({ error: 'Sprint is not active' }, { status: 400 });
    }

    const ownerRepo = `${sprint.repo_owner}/${sprint.repo_name}`.toLowerCase();

    // Get repo data for card info
    const repoData = await getCachedRepo(ownerRepo);
    if (!repoData || !Array.isArray(repoData)) {
      return NextResponse.json({ error: 'Repo data not cached' }, { status: 404 });
    }

    // Get user's collection for this repo
    const { data: collection } = await supabase
      .from('user_collections')
      .select('contributor_login, count')
      .eq('user_id', user.id)
      .eq('owner_repo', ownerRepo);

    if (!collection || collection.length === 0) {
      return NextResponse.json({ error: 'No cards collected for this repo' }, { status: 400 });
    }

    const library: Record<string, number> = {};
    for (const c of collection) {
      library[c.contributor_login] = c.count;
    }

    // Auto-select best lineup
    const lineup = autoSelectLineup(repoData, library);

    if (lineup.total_power === 0) {
      return NextResponse.json({ error: 'No valid cards for lineup' }, { status: 400 });
    }

    // Commit via RPC (validates ownership server-side)
    const { data: result, error: rpcError } = await supabase.rpc('commit_sprint_lineup', {
      p_user_id: user.id,
      p_sprint_id: sprintId,
      p_card_common: lineup.card_common,
      p_card_rare: lineup.card_rare,
      p_card_epic: lineup.card_epic,
      p_card_legendary: lineup.card_legendary,
      p_card_mythic: lineup.card_mythic,
      p_total_power: lineup.total_power,
    });

    if (rpcError) {
      return NextResponse.json({ error: 'Failed to commit', detail: rpcError.message }, { status: 500 });
    }

    const row = Array.isArray(result) ? result[0] : result;

    // Use server-computed power (not client-computed)
    const serverPower = row?.computed_power ?? lineup.total_power;

    return NextResponse.json({
      success: row?.success ?? false,
      committedAt: row?.committed_at,
      lineup: {
        cardCommon: lineup.card_common,
        cardRare: lineup.card_rare,
        cardEpic: lineup.card_epic,
        cardLegendary: lineup.card_legendary,
        cardMythic: lineup.card_mythic,
        totalPower: serverPower,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'Unexpected error', detail: e?.message }, { status: 500 });
  }
}
