/**
 * Hook for offline-aware mutations
 * Automatically queues mutations when offline
 */

import React from 'react';
import { useMutation, UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { networkService } from '../services/network/networkService';
import { offlineQueue } from '../services/offline/offlineQueue';
import { parseError, ApiError } from '../services/api/client';

export interface UseOfflineMutationOptions<TData, TVariables, TError = ApiError>
  extends Omit<UseMutationOptions<TData, TError, TVariables>, 'mutationFn'> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  mutationKey: string;
  invalidateQueries?: readonly unknown[][];
  onSuccess?: (data: TData, variables: TVariables, context: unknown) => void | Promise<void>;
  onError?: (error: TError, variables: TVariables, context: unknown) => void | Promise<void>;
  /**
   * Whether to queue mutations when offline (default: true)
   */
  queueWhenOffline?: boolean;
  /**
   * Maximum number of retries for queued mutations (default: 3)
   */
  maxRetries?: number;
}

/**
 * Enhanced useMutation hook with offline support
 * Automatically queues mutations when offline and processes them when online
 */
export function useOfflineMutation<TData = unknown, TVariables = void, TError = ApiError>(
  options: UseOfflineMutationOptions<TData, TVariables, TError>
): UseMutationResult<TData, TError, TVariables> {
  const queryClient = useQueryClient();
  const {
    mutationKey,
    invalidateQueries,
    onSuccess,
    onError,
    queueWhenOffline = true,
    maxRetries = 3,
    ...mutationOptions
  } = options;

  // Register mutation processor for offline queue
  React.useEffect(() => {
    if (queueWhenOffline) {
      offlineQueue.registerProcessor(mutationKey, async (queuedMutation) => {
        return await options.mutationFn(queuedMutation.variables);
      });
    }
  }, [mutationKey, queueWhenOffline]);

  return useMutation<TData, TError, TVariables>({
    ...mutationOptions,
    mutationFn: async (variables: TVariables) => {
      // Check if offline
      if (!networkService.isOnline() && queueWhenOffline) {
        // Queue the mutation for later processing
        const mutationId = await offlineQueue.queueMutation(
          mutationKey,
          variables,
          async (queuedMutation) => {
            return await options.mutationFn(queuedMutation.variables);
          },
          maxRetries
        );

        // Return a promise that resolves when the mutation is processed
        // This allows the UI to show a "queued" state
        return new Promise((resolve, reject) => {
          // Wait for network to come online and mutation to be processed
          networkService.waitForOnline().then(() => {
            offlineQueue.processQueue().then(() => {
              // Mutation should be processed, but we can't get the result here
              // The mutation will be retried when online
              resolve({ queued: true, mutationId } as any);
            }).catch(reject);
          }).catch(reject);
        });
      }

      // Online - execute immediately
      try {
        return await options.mutationFn(variables);
      } catch (error) {
        const parsedError = parseError(error) as TError;
        throw parsedError;
      }
    },
    onSuccess: async (data, variables, context) => {
      // Invalidate specified queries after successful mutation
      if (invalidateQueries) {
        invalidateQueries.forEach((queryKey) => {
          queryClient.invalidateQueries({
            queryKey,
            refetchType: 'active',
          });
        });
      }

      // Call custom onSuccess if provided
      if (onSuccess) {
        await onSuccess(data, variables, context);
      }
    },
    onError: async (error, variables, context) => {
      // Call custom onError if provided
      if (onError) {
        await onError(error, variables, context);
      }
    },
  });
}

