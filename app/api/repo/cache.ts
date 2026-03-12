// Shared in-memory cache for repo contributor data
export const cache = new Map<string, { ts: number; data: any }>();
export const CACHE_TTL = 60 * 60 * 1000; // 1 hour
