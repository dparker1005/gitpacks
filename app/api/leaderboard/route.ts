import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/app/lib/repo-cache';

export async function GET(request: NextRequest) {
  const repo = request.nextUrl.searchParams.get('repo');
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10) || 50, 100);
  const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10) || 0;

  const ownerRepo = repo ? repo.toLowerCase() : '__global__';

  const { data, error, count } = await supabase
    .from('leaderboard_scores')
    .select(`
      user_id,
      base_points,
      completion_bonus,
      total_points,
      unique_cards,
      total_cards_in_repo,
      profiles!inner(github_username, avatar_url)
    `, { count: 'exact' })
    .eq('owner_repo', ownerRepo)
    .gt('total_points', 0)
    .order('total_points', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];

  // For global leaderboard, fetch completed repo counts
  let completionsMap: Record<string, number> = {};
  if (!repo && rows.length > 0) {
    const userIds = rows.map((r: any) => r.user_id);
    const { data: completions } = await supabase
      .from('collection_completions')
      .select('user_id')
      .in('user_id', userIds)
      .eq('is_complete', true);

    if (completions) {
      for (const c of completions) {
        completionsMap[c.user_id] = (completionsMap[c.user_id] || 0) + 1;
      }
    }
  }

  const entries = rows.map((row: any, i: number) => ({
    rank: offset + i + 1,
    github_username: row.profiles?.github_username || '',
    avatar_url: row.profiles?.avatar_url || '',
    total_points: row.total_points,
    base_points: row.base_points,
    completion_bonus: row.completion_bonus,
    unique_cards: row.unique_cards,
    total_cards_in_repo: row.total_cards_in_repo,
    repos_completed: completionsMap[row.user_id] || 0,
  }));

  return NextResponse.json({
    entries,
    total_entries: count || 0,
    repo: repo || null,
  });
}
