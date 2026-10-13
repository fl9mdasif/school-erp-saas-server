import { env } from '../config/env';

interface Entry<T> {
  at: number;
  value: T;
}

const stores = new Set<Map<string, Entry<unknown>>>();

/**
 * Tiny per-process TTL cache for hot public lookups (tenant by slug, lookup mode). Result day is read heavy and
 * these rows almost never change. Writers call clearPublicCaches(), so staleness is bounded by the TTL at worst.
 */
export const ttlCache = <T>() => {
  const map = new Map<string, Entry<T>>();
  stores.add(map as Map<string, Entry<unknown>>);
  return {
    async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
      const ttl = env.PUBLIC_CACHE_TTL_MS;
      const hit = map.get(key);
      if (ttl > 0 && hit && Date.now() - hit.at < ttl) return hit.value;
      const value = await load();
      if (ttl > 0) map.set(key, { at: Date.now(), value });
      return value;
    },
  };
};

export const clearPublicCaches = () => {
  for (const m of stores) m.clear();
};
