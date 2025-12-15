/**
 * Offline Mutation Queue Service
 * Handles queuing and processing mutations when offline
 */

import { networkService } from '../network/networkService';
import { offlineStorage, QueuedMutation } from '../storage/offlineStorage';
import { queryClient } from '../api/queryClient';

export interface MutationProcessor {
  (mutation: QueuedMutation): Promise<any>;
}

class OfflineQueueService {
  private isProcessing = false;
  private processors: Map<string, MutationProcessor> = new Map();

  /**
   * Register a mutation processor for a specific mutation key
   */
  registerProcessor(mutationKey: string, processor: MutationProcessor) {
    this.processors.set(mutationKey, processor);
  }

  /**
   * Queue a mutation for offline processing
   */
  async queueMutation(
    mutationKey: string,
    variables: any,
    processor: MutationProcessor,
    maxRetries: number = 3
  ): Promise<string> {
    // Register processor if not already registered
    if (!this.processors.has(mutationKey)) {
      this.registerProcessor(mutationKey, processor);
    }

    const mutationId = await offlineStorage.queueMutation({
      mutationKey,
      variables,
      retryCount: 0,
      maxRetries,
    });

    // If online, try to process immediately
    if (networkService.isOnline()) {
      this.processQueue().catch((error) => {
        console.error('Error processing queue:', error);
      });
    }

    return mutationId;
  }

  /**
   * Process all queued mutations
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    if (!networkService.isOnline()) {
      console.log('Network offline, skipping queue processing');
      return;
    }

    this.isProcessing = true;
    await offlineStorage.updateSyncStatus({ isSyncing: true });

    try {
      const queue = await offlineStorage.getMutationQueue();
      const processed: string[] = [];
      const failed: QueuedMutation[] = [];

      for (const mutation of queue) {
        try {
          const processor = this.processors.get(mutation.mutationKey);
          if (!processor) {
            console.warn(`No processor found for mutation: ${mutation.mutationKey}`);
            processed.push(mutation.id);
            continue;
          }

          // Check retry limit
          if (mutation.retryCount >= mutation.maxRetries) {
            console.warn(`Mutation ${mutation.id} exceeded max retries, removing from queue`);
            processed.push(mutation.id);
            continue;
          }

          // Process mutation
          await processor(mutation);
          
          // Success - remove from queue
          processed.push(mutation.id);
        } catch (error) {
          console.error(`Error processing mutation ${mutation.id}:`, error);
          
          // Increment retry count
          const newRetryCount = mutation.retryCount + 1;
          if (newRetryCount < mutation.maxRetries) {
            await offlineStorage.updateMutationRetry(mutation.id, newRetryCount);
            failed.push(mutation);
          } else {
            // Max retries exceeded, remove from queue
            processed.push(mutation.id);
          }
        }
      }

      // Remove processed mutations
      for (const id of processed) {
        await offlineStorage.removeMutation(id);
      }

      // Update sync status
      await offlineStorage.updateSyncStatus({
        lastSyncTime: Date.now(),
        isSyncing: false,
      });

      if (failed.length > 0) {
        console.log(`${failed.length} mutations failed and will be retried later`);
      }
    } catch (error) {
      console.error('Error processing mutation queue:', error);
      await offlineStorage.updateSyncStatus({ isSyncing: false });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get queue status
   */
  async getQueueStatus() {
    const queue = await offlineStorage.getMutationQueue();
    const syncStatus = await offlineStorage.getSyncStatus();
    
    return {
      pendingMutations: queue.length,
      isProcessing: this.isProcessing,
      isOnline: networkService.isOnline(),
      ...syncStatus,
    };
  }

  /**
   * Clear all queued mutations
   */
  async clearQueue(): Promise<void> {
    await offlineStorage.clearMutationQueue();
    await offlineStorage.updateSyncStatus({
      lastSyncTime: null,
      pendingMutations: 0,
      isSyncing: false,
    });
  }

  /**
   * Initialize offline queue service
   */
  initialize() {
    // Process queue when network comes online
    networkService.on('online', () => {
      console.log('Network online, processing queued mutations...');
      this.processQueue().catch((error) => {
        console.error('Error processing queue on network reconnect:', error);
      });
    });

    // Process queue on app start if online
    if (networkService.isOnline()) {
      this.processQueue().catch((error) => {
        console.error('Error processing queue on initialization:', error);
      });
    }
  }
}

// Export singleton instance
export const offlineQueue = new OfflineQueueService();

