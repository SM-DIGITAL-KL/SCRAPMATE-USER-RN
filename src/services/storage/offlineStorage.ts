/**
 * Offline Storage Service
 * Manages offline data storage and synchronization
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  OFFLINE_QUEUE: 'OFFLINE_MUTATION_QUEUE',
  OFFLINE_DATA: 'OFFLINE_DATA',
  SYNC_STATUS: 'SYNC_STATUS',
} as const;

export interface QueuedMutation {
  id: string;
  timestamp: number;
  mutationKey: string;
  variables: any;
  retryCount: number;
  maxRetries: number;
}

export interface SyncStatus {
  lastSyncTime: number | null;
  pendingMutations: number;
  isSyncing: boolean;
}

/**
 * Offline Storage Service
 */
class OfflineStorageService {
  /**
   * Queue a mutation for later execution
   */
  async queueMutation(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>): Promise<string> {
    const queue = await this.getMutationQueue();
    const id = `mutation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const queuedMutation: QueuedMutation = {
      id,
      timestamp: Date.now(),
      ...mutation,
    };

    queue.push(queuedMutation);
    await this.saveMutationQueue(queue);
    
    return id;
  }

  /**
   * Get all queued mutations
   */
  async getMutationQueue(): Promise<QueuedMutation[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error reading mutation queue:', error);
      return [];
    }
  }

  /**
   * Save mutation queue
   */
  private async saveMutationQueue(queue: QueuedMutation[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
    } catch (error) {
      console.error('Error saving mutation queue:', error);
    }
  }

  /**
   * Remove a mutation from the queue
   */
  async removeMutation(mutationId: string): Promise<void> {
    const queue = await this.getMutationQueue();
    const filtered = queue.filter(m => m.id !== mutationId);
    await this.saveMutationQueue(filtered);
  }

  /**
   * Clear all queued mutations
   */
  async clearMutationQueue(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
  }

  /**
   * Update mutation retry count
   */
  async updateMutationRetry(mutationId: string, retryCount: number): Promise<void> {
    const queue = await this.getMutationQueue();
    const mutation = queue.find(m => m.id === mutationId);
    if (mutation) {
      mutation.retryCount = retryCount;
      await this.saveMutationQueue(queue);
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_STATUS);
      if (data) {
        const status = JSON.parse(data);
        const queue = await this.getMutationQueue();
        return {
          ...status,
          pendingMutations: queue.length,
        };
      }
    } catch (error) {
      console.error('Error reading sync status:', error);
    }

    const queue = await this.getMutationQueue();
    return {
      lastSyncTime: null,
      pendingMutations: queue.length,
      isSyncing: false,
    };
  }

  /**
   * Update sync status
   */
  async updateSyncStatus(status: Partial<SyncStatus>): Promise<void> {
    try {
      const current = await this.getSyncStatus();
      const updated = {
        ...current,
        ...status,
      };
      await AsyncStorage.setItem(STORAGE_KEYS.SYNC_STATUS, JSON.stringify(updated));
    } catch (error) {
      console.error('Error updating sync status:', error);
    }
  }

  /**
   * Store offline data
   */
  async storeOfflineData(key: string, data: any): Promise<void> {
    try {
      const offlineData = await this.getOfflineData();
      offlineData[key] = {
        data,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_DATA, JSON.stringify(offlineData));
    } catch (error) {
      console.error('Error storing offline data:', error);
    }
  }

  /**
   * Get offline data
   */
  async getOfflineData(): Promise<Record<string, { data: any; timestamp: number }>> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_DATA);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error reading offline data:', error);
      return {};
    }
  }

  /**
   * Get specific offline data by key
   */
  async getOfflineDataByKey(key: string): Promise<any | null> {
    const offlineData = await this.getOfflineData();
    return offlineData[key]?.data ?? null;
  }

  /**
   * Clear offline data
   */
  async clearOfflineData(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_DATA);
  }
}

// Export singleton instance
export const offlineStorage = new OfflineStorageService();

