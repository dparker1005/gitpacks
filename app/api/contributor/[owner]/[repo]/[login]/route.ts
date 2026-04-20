import { NextRequest, NextResponse } from 'next/server';
import { getCachedRepoData } from '@/app/lib/repo-cache';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; login: string }> }
) {
  const { owner, repo, login } = await params;
  const cacheKey = `${owner}/${repo}`.toLowerCase();
  const cached = await getCachedRepoData(cacheKey);

  if (!cached || !Array.isArray(cached)) {
    return NextResponse.json({ error: 'Repo not cached' }, { status: 404 });
  }

  const contributor = cached.find(
    (c: any) => c.login?.toLowerCase() === login.toLowerCase()
  );

  if (!contributor) {
    return NextResponse.json({ error: 'Contributor not found' }, { status: 404 });
  }

  return NextResponse.json(contributor, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
