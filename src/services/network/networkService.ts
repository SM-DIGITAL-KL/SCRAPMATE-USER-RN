/**
 * Network Status Service
 * Monitors network connectivity and provides network status information
 */

import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: NetInfoStateType;
}

type EventListener = (...args: any[]) => void;

class NetworkService {
  private currentState: NetworkState | null = null;
  private unsubscribe: (() => void) | null = null;
  private listeners: Map<string, Set<EventListener>> = new Map();

  /**
   * Add event listener
   */
  on(event: string, listener: EventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Remove event listener
   */
  off(event: string, listener: EventListener): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  /**
   * Add one-time event listener
   */
  once(event: string, listener: EventListener): void {
    const onceWrapper = (...args: any[]) => {
      this.off(event, onceWrapper);
      listener(...args);
    };
    this.on(event, onceWrapper);
  }

  /**
   * Emit event
   */
  private emit(event: string, ...args: any[]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Initialize network monitoring
   */
  async initialize(): Promise<NetworkState> {
    // Get initial state
    const state = await NetInfo.fetch();
    this.currentState = this.parseState(state);

    // Subscribe to network state changes
    this.unsubscribe = NetInfo.addEventListener((state) => {
      const newState = this.parseState(state);
      const wasConnected = this.currentState?.isConnected ?? false;
      const isConnected = newState.isConnected;

      this.currentState = newState;

      // Emit events
      this.emit('networkStateChange', newState);
      
      if (wasConnected !== isConnected) {
        if (isConnected) {
          this.emit('online');
        } else {
          this.emit('offline');
        }
      }
    });

    return this.currentState;
  }

  /**
   * Parse NetInfo state to our NetworkState format
   */
  private parseState(state: NetInfoState): NetworkState {
    return {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
    };
  }

  /**
   * Get current network state
   */
  getCurrentState(): NetworkState | null {
    return this.currentState;
  }

  /**
   * Check if device is currently online
   */
  isOnline(): boolean {
    return this.currentState?.isConnected ?? false;
  }

  /**
   * Check if internet is reachable
   */
  isInternetReachable(): boolean {
    return this.currentState?.isInternetReachable ?? false;
  }

  /**
   * Wait for network to be available
   */
  async waitForOnline(timeout: number = 30000): Promise<boolean> {
    if (this.isOnline()) {
      return true;
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.off('online', onOnline);
        resolve(false);
      }, timeout);

      const onOnline = () => {
        clearTimeout(timeoutId);
        this.off('online', onOnline);
        resolve(true);
      };

      this.once('online', onOnline);
    });
  }

  /**
   * Cleanup network monitoring
   */
  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.removeAllListeners();
  }
}

// Export singleton instance
export const networkService = new NetworkService();

