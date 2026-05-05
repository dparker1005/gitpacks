import type { Metadata } from "next";
import ContributorClient from "./ContributorClient";

type Props = {
  params: Promise<{ login: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { login } = await params;
  return {
    title: `${login}'s Cards — GitPacks`,
    description: `Every GitPacks contributor card for ${login} across all tracked repos.`,
    openGraph: {
      title: `${login}'s Cards — GitPacks`,
      description: `Every GitPacks contributor card for ${login} across all tracked repos.`,
      siteName: "GitPacks",
    },
    twitter: {
      card: "summary",
      title: `${login}'s Cards — GitPacks`,
      description: `Every GitPacks contributor card for ${login} across all tracked repos.`,
    },
  };
}

export default async function ContributorPage({ params }: Props) {
  const { login } = await params;
  return <ContributorClient login={login} />;
}
