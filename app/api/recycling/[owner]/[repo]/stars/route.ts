import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/app/lib/supabase-server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const { owner, repo } = await params;
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const ownerRepo = `${owner}/${repo}`.toLowerCase();
  const { data, error } = await supabase
    .from('user_stars')
    .select('balance, total_earned, total_spent')
    .eq('user_id', user.id)
    .eq('owner_repo', ownerRepo)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    balance: data?.balance ?? 0,
    totalEarned: data?.total_earned ?? 0,
    totalSpent: data?.total_spent ?? 0,
  });
}
