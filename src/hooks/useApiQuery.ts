/**
 * Custom hook for API queries with React Query
 * 
 * Usage example:
 * ```ts
 * const { isLoading, isError, data } = useApiQuery({
 *   queryKey: ["search", textInputValue],
 *   queryFn: async () => {
 *     if (textInputValue.trim().length === 0) {
 *       return [];
 *     }
 *     const searchEndpoint = `${ENDPOINTS.SEARCH}&query=${textInputValue}`;
 *     const response = await getRequest(searchEndpoint);
 *     return response.results;
 *   },
 *   gcTime: 365 * 24 * 60 * 60 * 1000, // 365 days (optional, defaults to 365 days from QueryClient)
 * });
 * ```
 * 
 * All queries are automatically persisted for 365 days via AsyncStorage.
 * The QueryClient is configured with 365-day persistence by default.
 */

import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { parseError, ApiError } from '../services/api/client';

export interface UseApiQueryOptions<TData, TError = ApiError> 
  extends Omit<UseQueryOptions<TData, TError>, 'queryFn'> {
  queryFn: () => Promise<TData>;
}

/**
 * Enhanced useQuery hook with automatic error parsing and 365-day persistence
 * 
 * This hook:
 * - Uses useQuery directly (matches the pattern from the example)
 * - Automatically persists data for 365 days via AsyncStorage
 * - Provides error parsing
 * - Works completely offline using cached data
 * 
 * Default behavior (from QueryClient):
 * - staleTime: 365 days (data is considered fresh for 365 days)
 * - gcTime: 365 days (cache persists for 365 days)
 * - retry: false
 */
export function useApiQuery<TData = unknown, TError = ApiError>(
  options: UseApiQueryOptions<TData, TError>
): UseQueryResult<TData, TError> {
  return useQuery<TData, TError>({
    // Merge with provided options
    // Defaults from queryClient will apply (365-day staleTime, gcTime, etc.)
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

