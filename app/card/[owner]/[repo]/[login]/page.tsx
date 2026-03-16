import type { Metadata } from 'next';
import { getCachedRepo } from '@/app/lib/repo-cache';
import { redirect } from 'next/navigation';
import CardImage from './CardImage';

interface Params {
  owner: string;
  repo: string;
  login: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { owner, repo, login } = await params;
  const ogUrl = `https://www.gitpacks.com/api/card/${owner}/${repo}/${login}?format=png`;
  const cardUrl = `https://www.gitpacks.com/card/${owner}/${repo}/${login}`;

  return {
    title: `${login} — ${owner}/${repo} | GitPacks`,
    description: `${login}'s contributor card for ${owner}/${repo}. Collect the contributors behind the code.`,
    openGraph: {
      title: `${login}'s GitPacks Card`,
      description: `Contributor card for ${owner}/${repo} on GitPacks`,
      images: [{ url: ogUrl, width: 960, height: 1440 }],
      url: cardUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${login}'s GitPacks Card`,
      description: `Contributor card for ${owner}/${repo} on GitPacks`,
      images: [ogUrl],
    },
  };
}

export default async function CardPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { owner, repo, login } = await params;
  const cacheKey = `${owner}/${repo}`.toLowerCase();
  const cached = await getCachedRepo(cacheKey);

  if (!cached || !Array.isArray(cached)) {
    redirect(`/?repo=${owner}/${repo}`);
  }

  const contributor = cached.find(
    (c: any) => c.login.toLowerCase() === login.toLowerCase()
  );

  if (!contributor) {
    redirect(`/?repo=${owner}/${repo}`);
  }

  const cardSvgUrl = `/api/card/${owner}/${repo}/${login}`;
  const viewCardUrl = `/?repo=${owner}/${repo}&card=${login}`;
  const shareUrl = `https://www.gitpacks.com/card/${owner}/${repo}/${login}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out my GitPacks card for ${owner}/${repo}!`)}&url=${encodeURIComponent(shareUrl)}`;
  const markdownSnippet = `<a href="${shareUrl}"><img src="https://www.gitpacks.com/api/card/${owner}/${repo}/${login}" alt="${login} on ${owner}/${repo}" width="200" /></a>`;

  const rarityColors: Record<string, string> = {
    mythic: '#ff0040',
    legendary: '#ffd700',
    epic: '#c084fc',
    rare: '#60a5fa',
    common: '#888',
  };
  const rc = rarityColors[contributor.rarity] || '#888';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        gap: '24px',
      }}
    >
      <CardImage
        src={cardSvgUrl}
        alt={`${login}'s GitPacks card for ${owner}/${repo}`}
        href={viewCardUrl}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
          maxWidth: '500px',
          width: '100%',
        }}
      >
        <div
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '0.65rem',
            color: rc,
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          {contributor.rarity}
        </div>
        <div
          style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '0.85rem',
            color: '#888',
            textAlign: 'center',
            marginBottom: '12px',
          }}
        >
          {login}&apos;s contributor card for{' '}
          <span style={{ color: '#ccc' }}>{owner}/{repo}</span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          maxWidth: '500px',
          width: '100%',
        }}
      >
        <a
          href={viewCardUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 28px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #7873f5, #4adede)',
            color: '#fff',
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase' as const,
            textDecoration: 'none',
          }}
        >
          View Card on GitPacks
        </a>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener"
            style={{
              padding: '8px 20px',
              border: '1px solid #3a3a5a',
              borderRadius: '8px',
              color: '#aaa',
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '0.65rem',
              letterSpacing: '1px',
              textTransform: 'uppercase' as const,
              textDecoration: 'none',
            }}
          >
            Share on X
          </a>
        </div>

        <div
          style={{
            textAlign: 'center',
            padding: '20px 0 10px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            marginTop: '8px',
            width: '100%',
          }}
        >
          <div
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '0.9rem',
              color: '#888',
              marginBottom: '6px',
            }}
          >
            Open packs, collect contributors, and climb the leaderboard.
          </div>
          <div
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '0.85rem',
              color: '#666',
            }}
          >
            <strong style={{ color: '#4adede' }}>10 free packs</strong> when you sign up
          </div>
        </div>

        <details
          style={{
            width: '100%',
            border: '1px solid #2a2a4a',
            borderRadius: '10px',
            padding: '0',
            background: 'rgba(20,20,40,0.6)',
          }}
        >
          <summary
            style={{
              padding: '10px 16px',
              cursor: 'pointer',
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '0.6rem',
              color: '#888',
              letterSpacing: '1px',
              textTransform: 'uppercase' as const,
            }}
          >
            Embed in GitHub README
          </summary>
          <pre
            style={{
              padding: '12px 16px',
              margin: 0,
              fontSize: '0.75rem',
              color: '#4adede',
              overflowX: 'auto',
              borderTop: '1px solid #2a2a4a',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {markdownSnippet}
          </pre>
        </details>
      </div>
    </div>
  );
}
