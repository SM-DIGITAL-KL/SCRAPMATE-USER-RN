/**
 * Hook to monitor network status
 */

import { useEffect, useState } from 'react';
import { networkService, NetworkState } from '../services/network/networkService';

export interface UseNetworkStatusReturn {
  isOnline: boolean;
  isInternetReachable: boolean | null;
  networkType: string;
  networkState: NetworkState | null;
}

/**
 * Hook to get current network status
 */
export function useNetworkStatus(): UseNetworkStatusReturn {
  const [networkState, setNetworkState] = useState<NetworkState | null>(
    networkService.getCurrentState()
  );

  useEffect(() => {
    // Get initial state
    const currentState = networkService.getCurrentState();
    if (currentState) {
      setNetworkState(currentState);
    }

    // Listen for network state changes
    const handleNetworkChange = (state: NetworkState) => {
      setNetworkState(state);
    };

    networkService.on('networkStateChange', handleNetworkChange);

    return () => {
      networkService.off('networkStateChange', handleNetworkChange);
    };
  }, []);

  return {
    isOnline: networkState?.isConnected ?? false,
    isInternetReachable: networkState?.isInternetReachable ?? null,
    networkType: networkState?.type ?? 'unknown',
    networkState,
  };
}

