/**
 * Custom hook for API queries with React Query
 */

import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { parseError, ApiError } from '../services/api/client';

export interface UseApiQueryOptions<TData, TError = ApiError> 
  extends Omit<UseQueryOptions<TData, TError>, 'queryFn'> {
  queryFn: () => Promise<TData>;
}

/**
 * Enhanced useQuery hook with automatic error parsing and cache-first behavior
 * 
 * This hook ensures:
 * - Data is loaded from cache first (instant UI)
 * - Refetches from API in background if data is stale
 * - Works completely offline using cached data
 * 
 * The cache-first behavior is achieved through:
 * - staleTime: Data is considered fresh for 30 minutes
 * - placeholderData: Shows cached data while refetching
 * - refetchOnMount: 'always' but respects staleTime
 */
export function useApiQuery<TData = unknown, TError = ApiError>(
  options: UseApiQueryOptions<TData, TError>
): UseQueryResult<TData, TError> {
  return useQuery<TData, TError>({
    // Use cached data as placeholder while refetching (cache-first behavior)
    // This ensures we always show cached data while fetching new data
    placeholderData: options.placeholderData ?? ((previousData: any) => previousData),
    // Merge with provided options (user can override defaults)
    // Defaults from queryClient will apply (staleTime, refetchOnMount, etc.)
    ...options,
    queryFn: async () => {
      try {
        return await options.queryFn();
      } catch (error) {
        const parsedError = parseError(error) as TError;
        throw parsedError;
      }
    },
  });
}

