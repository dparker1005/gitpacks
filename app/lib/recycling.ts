export const REVERT_YIELD: Record<string, number> = {
  common: 1,
  rare: 3,
  epic: 10,
  legendary: 30,
  mythic: 100,
};

export const CHERRY_PICK_COST: Record<string, number> = {
  common: 5,
  rare: 15,
  epic: 50,
  legendary: 150,
  mythic: 500,
};

/**
 * Look up a contributor's rarity from repo_cache data.
 * Returns null if not found.
 */
export function getContributorRarity(
  repoData: any[],
  login: string
): string | null {
  const c = repoData.find(
    (item: any) => item.login?.toLowerCase() === login.toLowerCase()
  );
  return c?.rarity ?? null;
}
