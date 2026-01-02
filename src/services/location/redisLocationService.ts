/**
 * Redis Location Service for Customer App
 * Fetches vendor vehicle location directly from Upstash Redis
 */

import { REDIS_CONFIG } from '../../config/redisConfig';

export interface VehicleLocation {
  user_id: number;
  user_type: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  order_id: number;
  distance?: number; // Distance in meters (calculated)
  distanceKm?: number; // Distance in kilometers (calculated)
}

interface VehicleLocationWithDistance extends VehicleLocation {
  distance: number; // Distance in meters
  distanceKm: number; // Distance in kilometers
}

class RedisLocationService {
  private redisUrl: string = REDIS_CONFIG.REDIS_URL;
  private redisToken: string = REDIS_CONFIG.REDIS_TOKEN;

  /**
   * Calculate distance between two coordinates using Haversine formula
   * @param lat1 - Latitude of first point
   * @param lon1 - Longitude of first point
   * @param lat2 - Latitude of second point
   * @param lon2 - Longitude of second point
   * @returns Distance in meters
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  /**
   * Get vehicle location for an order from Redis
   * @param orderId - Order ID
   * @param destination - Optional destination coordinates to calculate distance
   * @returns Vehicle location with calculated distance (if destination provided) or null if not found
   */
  async getVehicleLocation(
    orderId: number,
    destination?: { latitude: number; longitude: number }
  ): Promise<VehicleLocation | null> {
    try {
      if (!this.redisUrl || !this.redisToken) {
        console.warn('⚠️ Redis credentials not configured');
        return null;
      }

      const orderLocationKey = `location:order:${orderId}`;
      const redisUrl = this.redisUrl.replace(/\/$/, '');

      // Upstash Redis REST API: GET command
      // Body: ["GET", "key"]
      const response = await fetch(redisUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['GET', orderLocationKey]),
      });

      if (!response.ok) {
        console.warn(`⚠️ Failed to get location from Redis: ${response.status}`);
        return null;
      }

      const result = await response.json();
      
      // Upstash returns result in format: { result: "value" }
      if (result && result.result) {
        try {
          const locationData = JSON.parse(result.result) as VehicleLocation;
          
          // Calculate distance if destination is provided
          if (destination && locationData.latitude && locationData.longitude) {
            const distance = this.calculateDistance(
              locationData.latitude,
              locationData.longitude,
              destination.latitude,
              destination.longitude
            );
            
            return {
              ...locationData,
              distance, // Distance in meters
              distanceKm: distance / 1000, // Distance in kilometers
            };
          }
          
          return locationData;
        } catch (parseError) {
          console.error('❌ Error parsing location data:', parseError);
          return null;
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Error fetching vehicle location from Redis:', error);
      return null;
    }
  }

  /**
   * Start polling for vehicle location updates
   * @param orderId - Order ID
   * @param onLocationUpdate - Callback when location is updated
   * @param interval - Polling interval in milliseconds (default: 5 minutes)
   * @param destination - Optional destination coordinates to calculate distance
   * @returns Function to stop polling
   */
  startPolling(
    orderId: number,
    onLocationUpdate: (location: VehicleLocation | null) => void,
    interval: number = 5 * 60 * 1000, // 5 minutes in milliseconds
    destination?: { latitude: number; longitude: number }
  ): () => void {
    let pollingInterval: NodeJS.Timeout | null = null;
    let isPolling = true;

    const poll = async () => {
      if (!isPolling) return;

      const location = await this.getVehicleLocation(orderId, destination);
      onLocationUpdate(location);

      if (isPolling) {
        pollingInterval = setTimeout(poll, interval);
      }
    };

    // Start polling immediately
    poll();

    // Return stop function
    return () => {
      isPolling = false;
      if (pollingInterval) {
        clearTimeout(pollingInterval);
        pollingInterval = null;
      }
    };
  }
}

// Export singleton instance
export const redisLocationService = new RedisLocationService();

