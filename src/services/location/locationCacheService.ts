import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_CACHE_KEY = 'LOCATION_HISTORY_CACHE';
const CACHE_EXPIRY_DAYS = 365;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CachedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  address?: {
    formattedAddress?: string;
    address?: string;
    houseNumber?: string;
    road?: string;
    neighborhood?: string;
    suburb?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countryCode?: string;
  };
}

interface LocationCache {
  locations: CachedLocation[];
  lastUpdated: number;
}

/**
 * Save a location to cache (365 days retention)
 */
export const saveLocationToCache = async (location: CachedLocation): Promise<void> => {
  try {
    const cacheData = await getLocationCache();
    const now = Date.now();
    
    // Add new location
    cacheData.locations.push({
      ...location,
      timestamp: location.timestamp || now,
    });
    
    // Remove locations older than 365 days
    const expiryTime = now - (CACHE_EXPIRY_DAYS * MILLISECONDS_PER_DAY);
    cacheData.locations = cacheData.locations.filter(
      loc => loc.timestamp >= expiryTime
    );
    
    // Sort by timestamp (newest first)
    cacheData.locations.sort((a, b) => b.timestamp - a.timestamp);
    
    // Update last updated timestamp
    cacheData.lastUpdated = now;
    
    // Save to AsyncStorage
    await AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(cacheData));
    
    console.log(`💾 Location cached. Total locations: ${cacheData.locations.length}`);
  } catch (error) {
    console.error('Error saving location to cache:', error);
  }
};

/**
 * Get all cached locations (within 365 days)
 */
export const getCachedLocations = async (): Promise<CachedLocation[]> => {
  try {
    const cacheData = await getLocationCache();
    const now = Date.now();
    const expiryTime = now - (CACHE_EXPIRY_DAYS * MILLISECONDS_PER_DAY);
    
    // Filter out expired locations
    const validLocations = cacheData.locations.filter(
      loc => loc.timestamp >= expiryTime
    );
    
    // If we filtered out some locations, update cache
    if (validLocations.length !== cacheData.locations.length) {
      cacheData.locations = validLocations;
      await AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(cacheData));
    }
    
    return validLocations;
  } catch (error) {
    console.error('Error getting cached locations:', error);
    return [];
  }
};

/**
 * Get cached locations within a date range
 */
export const getCachedLocationsByDateRange = async (
  startDate: number,
  endDate: number
): Promise<CachedLocation[]> => {
  try {
    const allLocations = await getCachedLocations();
    return allLocations.filter(
      loc => loc.timestamp >= startDate && loc.timestamp <= endDate
    );
  } catch (error) {
    console.error('Error getting locations by date range:', error);
    return [];
  }
};

/**
 * Get the most recent cached location
 */
export const getMostRecentLocation = async (): Promise<CachedLocation | null> => {
  try {
    const locations = await getCachedLocations();
    return locations.length > 0 ? locations[0] : null;
  } catch (error) {
    console.error('Error getting most recent location:', error);
    return null;
  }
};

/**
 * Clear all cached locations
 */
export const clearLocationCache = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LOCATION_CACHE_KEY);
    console.log('🗑️ Location cache cleared');
  } catch (error) {
    console.error('Error clearing location cache:', error);
  }
};

/**
 * Get location cache statistics
 */
export const getLocationCacheStats = async (): Promise<{
  totalLocations: number;
  oldestLocation: number | null;
  newestLocation: number | null;
  cacheSize: number;
}> => {
  try {
    const locations = await getCachedLocations();
    if (locations.length === 0) {
      return {
        totalLocations: 0,
        oldestLocation: null,
        newestLocation: null,
        cacheSize: 0,
      };
    }
    
    const timestamps = locations.map(loc => loc.timestamp);
    const oldestLocation = Math.min(...timestamps);
    const newestLocation = Math.max(...timestamps);
    
    // Estimate cache size (rough calculation)
    const cacheData = await getLocationCache();
    const cacheString = JSON.stringify(cacheData);
    const cacheSize = new Blob([cacheString]).size; // Approximate size in bytes
    
    return {
      totalLocations: locations.length,
      oldestLocation,
      newestLocation,
      cacheSize,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return {
      totalLocations: 0,
      oldestLocation: null,
      newestLocation: null,
      cacheSize: 0,
    };
  }
};

/**
 * Internal function to get location cache data
 */
const getLocationCache = async (): Promise<LocationCache> => {
  try {
    const cacheString = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
    if (cacheString) {
      return JSON.parse(cacheString);
    }
  } catch (error) {
    console.error('Error reading location cache:', error);
  }
  
  // Return empty cache if not found or error
  return {
    locations: [],
    lastUpdated: Date.now(),
  };
};

