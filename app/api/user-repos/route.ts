import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase-server';
import { supabase as anonSupabase } from '@/app/lib/repo-cache';

export async function GET() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: collections, error } = await supabase
    .from('user_collections')
    .select('owner_repo, contributor_login')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const repoMap: Record<string, number> = {};
  (collections || []).forEach((row: any) => {
    repoMap[row.owner_repo] = (repoMap[row.owner_repo] || 0) + 1;
  });

  const repoNames = Object.keys(repoMap);
  if (repoNames.length === 0) {
    return NextResponse.json([]);
  }

  // Get the user's GitHub username for contributor rarity lookup
  const meta = user.user_metadata || {};
  const githubUsername = meta.user_name || meta.preferred_username || '';

  // Fetch repo cache card counts, scores, and contributor rarities in parallel
  const [cacheResult, scoresResult, rarityResult] = await Promise.all([
    anonSupabase
      .from('repo_cache')
      .select('owner_repo, card_count')
      .in('owner_repo', repoNames),
    anonSupabase
      .from('leaderboard_scores')
      .select('owner_repo, base_points, completion_bonus, total_points')
      .eq('user_id', user.id)
      .in('owner_repo', repoNames),
    githubUsername
      ? anonSupabase.rpc('get_user_contributor_rarities', { github_login: githubUsername })
      : Promise.resolve({ data: [] }),
  ]);

  const cacheData = cacheResult.data;
  const scoresData = scoresResult.data;
  const rarityMap: Record<string, string> = {};
  (rarityResult.data || []).forEach((r: any) => {
    rarityMap[r.owner_repo] = r.rarity;
  });

  const result = repoNames.map(name => {
    const cached = cacheData?.find((r: any) => r.owner_repo === name);
    const totalCards = cached?.card_count || 0;
    const score = scoresData?.find((s: any) => s.owner_repo === name);
    return {
      name,
      collected: repoMap[name],
      cards: totalCards,
      pct: totalCards > 0 ? repoMap[name] / totalCards : 0,
      base_points: score?.base_points || 0,
      completion_bonus: score?.completion_bonus || 0,
      total_points: score?.total_points || 0,
      my_rarity: rarityMap[name] || null,
    };
  });

  result.sort((a, b) => b.pct - a.pct || b.cards - a.cards);

  return NextResponse.json(result);
}
