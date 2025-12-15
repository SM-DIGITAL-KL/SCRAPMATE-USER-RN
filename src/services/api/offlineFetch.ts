/**
 * Offline-aware fetch utility
 * Handles network errors gracefully and provides offline support
 */

import { networkService } from '../network/networkService';

export interface OfflineFetchOptions extends RequestInit {
  /**
   * Whether to throw an error when offline (default: false)
   * If false, returns a response with status 0 and error message
   */
  throwOnOffline?: boolean;
  /**
   * Whether to use cached data when offline (default: true)
   */
  useCacheWhenOffline?: boolean;
}

/**
 * Custom error class for offline errors
 */
export class OfflineError extends Error {
  constructor(message: string = 'Network request failed. You appear to be offline.') {
    super(message);
    this.name = 'OfflineError';
  }
}

/**
 * Enhanced fetch with offline detection and graceful error handling
 */
export const offlineFetch = async (
  url: string,
  options: OfflineFetchOptions = {}
): Promise<Response> => {
  const {
    throwOnOffline = false,
    useCacheWhenOffline = true,
    ...fetchOptions
  } = options;

  // Check network status
  const isOnline = networkService.isOnline();

  if (!isOnline) {
    if (throwOnOffline) {
      throw new OfflineError();
    }

    // Return a mock response for offline scenarios
    // This allows React Query to use cached data
    return new Response(
      JSON.stringify({
        error: true,
        message: 'Network request failed. You appear to be offline.',
        offline: true,
      }),
      {
        status: 0, // Status 0 indicates network error
        statusText: 'Offline',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  try {
    // Attempt the fetch request
    const response = await fetch(url, fetchOptions);

    // Check if response is actually successful
    if (!response.ok && response.status >= 500) {
      // Server error - might be temporary
      console.warn(`Server error ${response.status} for ${url}`);
    }

    return response;
  } catch (error: any) {
    // Network error occurred
    const isStillOffline = !networkService.isOnline();

    if (isStillOffline || error.message?.includes('Network request failed')) {
      if (throwOnOffline) {
        throw new OfflineError();
      }

      // Return mock response for offline
      return new Response(
        JSON.stringify({
          error: true,
          message: 'Network request failed. You appear to be offline.',
          offline: true,
        }),
        {
          status: 0,
          statusText: 'Offline',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Re-throw other errors
    throw error;
  }
};

/**
 * Check if an error is an offline error
 */
export const isOfflineError = (error: any): boolean => {
  return error instanceof OfflineError || 
         error?.name === 'OfflineError' ||
         (error?.message && error.message.includes('offline'));
};

/**
 * Check if a response indicates offline status
 */
export const isOfflineResponse = (response: Response): boolean => {
  return response.status === 0 || 
         (response.status >= 500 && response.status < 600);
};

