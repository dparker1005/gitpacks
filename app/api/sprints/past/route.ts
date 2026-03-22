import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20', 10) || 20, 50);
    const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0', 10) || 0;

    // Get user's past sprint entries (finished sprints only — rank is set)
    const { data: entries, error: entriesErr, count } = await supabase
      .from('sprint_entries')
      .select(`
        id,
        sprint_id,
        total_power,
        committed_at,
        rank,
        percentile,
        packs_won,
        packs_claimed,
        card_common,
        card_rare,
        card_epic,
        card_legendary,
        card_mythic,
        sprints!inner(repo_owner, repo_name, type, starts_at, ends_at)
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .not('rank', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (entriesErr) {
      return NextResponse.json({ error: entriesErr.message }, { status: 500 });
    }

    // Get total participant counts for each sprint
    const sprintIds = [...new Set((entries || []).map((e: any) => e.sprint_id))];
    let participantCounts: Record<string, number> = {};

    if (sprintIds.length > 0) {
      for (const sid of sprintIds) {
        const { count } = await supabase
          .from('sprint_entries')
          .select('id', { count: 'exact', head: true })
          .eq('sprint_id', sid)
          .not('committed_at', 'is', null);
        participantCounts[sid] = count || 0;
      }
    }

    const results = (entries || []).map((e: any) => ({
      id: e.id,
      sprintId: e.sprint_id,
      repoOwner: e.sprints.repo_owner,
      repoName: e.sprints.repo_name,
      type: e.sprints.type,
      startsAt: e.sprints.starts_at,
      endsAt: e.sprints.ends_at,
      totalPower: e.total_power,
      committedAt: e.committed_at,
      rank: e.rank,
      percentile: e.percentile,
      packsWon: e.packs_won,
      packsClaimed: e.packs_claimed,
      participants: participantCounts[e.sprint_id] || 0,
      cardCommon: e.card_common,
      cardRare: e.card_rare,
      cardEpic: e.card_epic,
      cardLegendary: e.card_legendary,
      cardMythic: e.card_mythic,
    }));

    return NextResponse.json({
      entries: results,
      total: count || 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'Unexpected error', detail: e?.message }, { status: 500 });
  }
}
