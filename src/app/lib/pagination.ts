import { z } from 'zod';
import type { PageMeta } from './sendResponse';

export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export interface PageParams {
  page: number;
  limit: number;
}

export const toSkip = ({ page, limit }: PageParams) => (page - 1) * limit;

export const buildMeta = (p: PageParams, total: number): PageMeta => ({
  page: p.page,
  limit: p.limit,
  total,
});

/** Escape user text before using it inside a RegExp. */
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
