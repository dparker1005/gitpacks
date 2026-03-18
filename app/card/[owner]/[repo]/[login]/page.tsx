import type { Metadata } from 'next';
import CardRedirect from './CardRedirect';

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
  const ogUrl = `https://www.gitpacks.com/api/og/card/${owner}/${repo}/${login}`;
  const cardUrl = `https://www.gitpacks.com/card/${owner}/${repo}/${login}`;

  return {
    title: `${login} — ${owner}/${repo} | GitPacks`,
    description: `${login}'s contributor card for ${owner}/${repo}. Collect the contributors behind the code.`,
    openGraph: {
      title: `${login}'s GitPacks Card`,
      description: `Contributor card for ${owner}/${repo} on GitPacks`,
      images: [{ url: ogUrl, width: 1200, height: 630, type: 'image/png' }],
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
  const deepLink = `/?repo=${owner}/${repo}&card=${login}`;

  // Always render HTML so OG crawlers see the meta tags.
  // CardRedirect handles the client-side navigation (crawlers ignore JS).
  return <CardRedirect href={deepLink} />;
}
