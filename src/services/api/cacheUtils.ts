/**
 * Cache utility functions for offline-first data management
 */

import { queryClient } from './queryClient';
import { QueryKey } from '@tanstack/react-query';

/**
 * Get data from cache if available
 */
export const getCachedData = <T>(queryKey: QueryKey): T | undefined => {
  return queryClient.getQueryData<T>(queryKey);
};

/**
 * Set data in cache manually
 */
export const setCachedData = <T>(queryKey: QueryKey, data: T): void => {
  queryClient.setQueryData<T>(queryKey, data);
};

/**
 * Prefetch data and store in cache
 */
export const prefetchData = async <T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>
): Promise<void> => {
  await queryClient.prefetchQuery({
    queryKey,
    queryFn,
  });
};

/**
 * Invalidate specific cache entries
 */
export const invalidateCache = (queryKey: QueryKey): Promise<void> => {
  return queryClient.invalidateQueries({ queryKey });
};

/**
 * Check if data exists in cache
 */
export const hasCachedData = (queryKey: QueryKey): boolean => {
  return queryClient.getQueryState(queryKey)?.data !== undefined;
};

/**
 * Get cache state for a query
 */
export const getCacheState = (queryKey: QueryKey) => {
  return queryClient.getQueryState(queryKey);
};

