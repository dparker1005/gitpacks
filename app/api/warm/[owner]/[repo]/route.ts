import { NextRequest, NextResponse } from 'next/server';

const WARM_SECRET = process.env.WARM_SECRET;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const auth = request.headers.get('authorization');
  if (!WARM_SECRET || auth !== `Bearer ${WARM_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { owner, repo } = await params;
  const origin = request.nextUrl.origin;

  try {
    const res = await fetch(`${origin}/api/repo/${owner}/${repo}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json({ error: body.error || 'Fetch failed' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ ok: true, cards: Array.isArray(data) ? data.length : 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
