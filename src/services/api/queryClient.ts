/**
 * React Query Client Configuration
 * Configured with optimal defaults for React Native with offline-first support
 */

import { QueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Create AsyncStorage persister for offline support
export let asyncStoragePersister: any = null;

try {
  const { createAsyncStoragePersister } = require('@tanstack/query-async-storage-persister');
  asyncStoragePersister = createAsyncStoragePersister({
    storage: AsyncStorage,
    key: 'REACT_QUERY_OFFLINE_CACHE',
    throttleTime: 1000, // Throttle writes to AsyncStorage
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  });
} catch (e) {
  console.warn('@tanstack/query-async-storage-persister not installed. Persistence disabled.');
}

/**
 * Default query options - Optimized for offline-first (cache-first strategy)
 * 
 * Behavior:
 * - Shows cached data immediately if available (instant UI)
 * - Refetches in background if data is stale (after staleTime)
 * - Works completely offline using cached data
 * - Persists cache across app restarts
 */
const defaultQueryOptions = {
  queries: {
    // Cache time: 365 days (keep data in cache for a year) - for categories/subcategories
    gcTime: 365 * 24 * 60 * 60 * 1000,
    // Stale time: 365 days (data is considered fresh for 365 days)
    // Cached data will be shown immediately, and only refetched after 365 days if online
    // For categories/subcategories, we use incremental updates instead of full refetch
    staleTime: 365 * 24 * 60 * 60 * 1000,
    // Retry failed requests 2 times (reduced for faster offline detection)
    retry: 2,
    // Retry delay increases exponentially
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // Refetch on mount: 'always' but with staleTime, it will show cache first
    // If data is fresh (< staleTime), it won't refetch
    // If data is stale (> staleTime), it will show cache and refetch in background
    refetchOnMount: 'always' as const,
    // Refetch on window focus only if data is stale
    refetchOnWindowFocus: false,
    // Refetch on reconnect (important for offline-first)
    refetchOnReconnect: true,
    // Network mode: offlineFirst (allows queries to work offline using cached data)
    networkMode: 'offlineFirst' as const,
    // Use cached data as placeholder while refetching (cache-first behavior)
    // This ensures we always show cached data while fetching new data
    placeholderData: (previousData: any) => previousData,
    // Always show cached data first, then refetch in background if stale
    // This ensures instant UI with cached data
    structuralSharing: true,
  },
  mutations: {
    // Retry failed mutations once
    retry: 1,
    // Retry delay
    retryDelay: 1000,
    // Network mode: offlineFirst (allows mutations to be queued when offline)
    networkMode: 'offlineFirst' as const,
  },
};

/**
 * Create and configure QueryClient
 */
export const queryClient = new QueryClient({
  defaultOptions: defaultQueryOptions,
});

/**
 * Reset query cache
 */
export const resetQueryCache = () => {
  queryClient.clear();
};

/**
 * Invalidate all queries
 */
export const invalidateAllQueries = () => {
  queryClient.invalidateQueries();
};

/**
 * Prefetch query data
 */
export const prefetchQuery = async <T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>
) => {
  await queryClient.prefetchQuery({
    queryKey,
    queryFn,
  });
};


