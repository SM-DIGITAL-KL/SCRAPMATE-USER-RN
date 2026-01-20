import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Platform, PermissionsAndroid, Alert, UIManager, NativeEventEmitter } from 'react-native';
import { requireNativeComponent, NativeModules, findNodeHandle } from 'react-native';
import { saveLocationToCache as saveLocationCache, getCachedLocations } from '../services/location/locationCacheService';
import type { CachedLocation } from '../services/location/locationCacheService';
import { useLocation } from '../context/LocationContext';

const { NativeMapViewModule } = NativeModules;

// Export function to get address from coordinates (FREE - uses OpenStreetMap Nominatim API)
export const getAddressFromCoordinates = async (
  latitude: number,
  longitude: number
): Promise<{
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
}> => {
  if (NativeMapViewModule) {
    try {
      const address = await NativeMapViewModule.getAddressFromCoordinates(latitude, longitude);
      return address;
    } catch (error) {
      // Network errors are expected and handled by callers - don't log as error
      // Only log if it's not a network timeout/connection error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('failed to connect') && !errorMessage.includes('timeout')) {
        console.warn('Address lookup error:', error);
      }
      throw error;
    }
  } else {
    throw new Error('Address lookup not available on this platform');
  }
};

// Convenience function to get current location with address
export const getCurrentLocationWithAddress = async (): Promise<{
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
}> => {
  if (NativeMapViewModule) {
    try {
      // Get current location
      const location = await NativeMapViewModule.getCurrentLocation();
      
      // Get address from coordinates
      try {
        const address = await NativeMapViewModule.getAddressFromCoordinates(
          location.latitude,
          location.longitude
        );
        return {
          ...location,
          address,
        };
      } catch (addressError) {
        // If address lookup fails, still return location
        console.warn('Address lookup failed:', addressError);
        return location;
      }
    } catch (error) {
      console.error('Error getting location with address:', error);
      throw error;
    }
  } else {
    throw new Error('Location lookup not available on this platform');
  }
};

interface NativeMapViewProps {
  style?: any;
  onLocationUpdate?: (event: { nativeEvent: { latitude: number; longitude: number; accuracy: number; timestamp: number } }) => void;
  onMapReady?: () => void;
}

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

const NativeMapViewComponent = requireNativeComponent<NativeMapViewProps>('NativeMapView', {
  nativeOnly: {
    // Event handlers are handled automatically by React Native bridge
  }
});

export const NativeMapView: React.FC<{
  style?: any;
  onLocationUpdate?: (location: LocationData) => void;
  onMapReady?: () => void;
  destination?: { latitude: number; longitude: number };
  source?: { latitude: number; longitude: number }; // Source location (e.g., vehicle location)
  routeProfile?: 'driving' | 'cycling' | 'walking';
}> = ({ 
  style, 
  onLocationUpdate, 
  onMapReady,
  destination,
  source,
  routeProfile = 'driving'
}) => {
  const { setLocationLoading } = useLocation();
  const mapRef = useRef<any>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const isMountedRef = useRef(true);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const locationReadyRef = useRef(false); // Track if location has been loaded at least once

  // Cleanup function to clear all timeouts
  const clearAllTimeouts = useCallback(() => {
    try {
      const timeouts = [...timeoutRefs.current]; // Create a copy to avoid modification during iteration
      timeouts.forEach(timeout => {
        if (timeout) {
          clearTimeout(timeout);
        }
      });
      timeoutRefs.current = [];
    } catch (e) {
      console.warn('Error in clearAllTimeouts:', e);
      timeoutRefs.current = [];
    }
  }, []);

  const requestLocationPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        if (!isMountedRef.current) return;

        if (
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
            PermissionsAndroid.RESULTS.GRANTED ||
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
            PermissionsAndroid.RESULTS.GRANTED
        ) {
          if (isMountedRef.current) {
            setHasPermission(true);
          }
          if (NativeMapViewModule && isMountedRef.current) {
            await NativeMapViewModule.requestLocationPermission();
          }
        } else {
          if (isMountedRef.current) {
            Alert.alert(
              'Location Permission',
              'Location permission is required to show your current location on the map.'
            );
          }
        }
      } catch (err) {
        console.warn(err);
      }
    } else {
      // iOS - permission is requested in native code
      if (isMountedRef.current) {
        setHasPermission(true);
      }
      // Permission will be requested automatically by the native module
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    // Set loading to true when component mounts
    setLocationLoading(true);
    locationReadyRef.current = false;
    
    // If source is provided (vehicle location from Redis), don't request device location permission
    if (source) {
      console.log('📍 Source location provided, skipping device location permission request');
      setLocationLoading(false);
      locationReadyRef.current = true;
      return () => {
        isMountedRef.current = false;
        clearAllTimeouts();
      };
    }
    
    requestLocationPermission();
    
    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      // Clear all timeouts
      try {
        clearAllTimeouts();
      } catch (e) {
        console.warn('Error clearing timeouts:', e);
      }
      // Don't clear mapRef here as it might be needed during unmount
      // It will be cleared naturally when component unmounts
    };
  }, [requestLocationPermission, clearAllTimeouts, setLocationLoading, source]);


  // Fetch location once when permission is granted (only if source is not provided)
  useEffect(() => {
    // Skip if source is provided (vehicle location from Redis)
    if (source) {
      return;
    }
    
    if (hasPermission && Platform.OS === 'android' && isMountedRef.current) {
      // Small delay to ensure map is ready
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current && mapRef.current) {
          fetchLocationOnce();
        }
      }, 1000);
      if (timeoutId) {
        timeoutRefs.current.push(timeoutId);
      }
      
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutRefs.current = timeoutRefs.current.filter(t => t !== timeoutId);
        }
      };
    }
  }, [hasPermission]);

  // Fetch location once (no continuous polling)
  const fetchLocationOnce = async () => {
    if (!isMountedRef.current || !mapRef.current) {
      return;
    }
    
    if (NativeMapViewModule) {
      try {
        const location = await NativeMapViewModule.getCurrentLocation();
        
        if (!isMountedRef.current || !mapRef.current) {
          return;
        }
        
        if (location) {
          setCurrentLocation(location);
          onLocationUpdate?.(location);
          
          // Mark location as ready and disable loading
          if (!locationReadyRef.current) {
            locationReadyRef.current = true;
            setLocationLoading(false);
            console.log('📍 Location loaded - enabling tabs');
          }
          
          // Save location to cache
          try {
            const cachedLocation: CachedLocation = {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy,
              timestamp: location.timestamp || Date.now(),
            };
            
            // Try to get address (non-blocking)
            try {
              const address = await getAddressFromCoordinates(location.latitude, location.longitude);
              cachedLocation.address = address;
            } catch (error) {
              // Address lookup failed, but we still save the location
              console.log('Address lookup failed for cached location:', error);
            }
            
            await saveLocationCache(cachedLocation);
          } catch (error) {
            console.error('Error saving location to cache:', error);
          }
          
          if (Platform.OS === 'android' && mapRef.current && isMountedRef.current) {
            try {
              const nodeHandle = findNodeHandle(mapRef.current);
              if (nodeHandle) {
                try {
                  const commandId = 1; // updateLocation command
                  UIManager.dispatchViewManagerCommand(
                    nodeHandle,
                    commandId,
                    [location.latitude, location.longitude]
                  );
                } catch (error) {
                  console.log('Error updating map location:', error);
                }
              }
            } catch (error) {
              console.log('Error finding map node handle:', error);
            }
          }
        }
      } catch (error) {
        console.log('Error fetching location:', error);
        // If location fetch fails, still disable loading after a timeout
        if (!locationReadyRef.current) {
          setTimeout(() => {
            if (!locationReadyRef.current && isMountedRef.current) {
              locationReadyRef.current = true;
              setLocationLoading(false);
              console.log('📍 Location fetch timeout - enabling tabs anyway');
            }
          }, 10000); // 10 second timeout
        }
      }
    }
  };

  // Throttle location updates to prevent excessive calls
  const lastLocationUpdateTimeRef = useRef<number>(0);
  const lastLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const LOCATION_UPDATE_THROTTLE_MS = 10000; // 10 seconds minimum between updates
  const MIN_LOCATION_CHANGE_METERS = 20; // Only update if moved 20+ meters

  const handleLocationUpdate = (event: any) => {
    // Check if component is still mounted
    if (!mapRef.current) {
      return;
    }
    
    const location = event.nativeEvent;
    const now = Date.now();
    const lastUpdate = lastLocationUpdateTimeRef.current;
    const lastLoc = lastLocationRef.current;
    
    // Calculate distance if we have a previous location
    let distanceChanged = true;
    if (lastLoc) {
      const R = 6371e3; // Earth radius in meters
      const φ1 = lastLoc.latitude * Math.PI / 180;
      const φ2 = location.latitude * Math.PI / 180;
      const Δφ = (location.latitude - lastLoc.latitude) * Math.PI / 180;
      const Δλ = (location.longitude - lastLoc.longitude) * Math.PI / 180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      distanceChanged = distance >= MIN_LOCATION_CHANGE_METERS;
    }
    
    // Only update if enough time has passed AND location changed significantly AND component is still mounted
    if ((now - lastUpdate >= LOCATION_UPDATE_THROTTLE_MS) && distanceChanged && mapRef.current) {
      setCurrentLocation(location);
      onLocationUpdate?.(location);
      
      // Mark location as ready if not already done
      if (!locationReadyRef.current) {
        locationReadyRef.current = true;
        setLocationLoading(false);
        console.log('📍 Location updated - enabling tabs');
      }
      
      lastLocationUpdateTimeRef.current = now;
      lastLocationRef.current = { latitude: location.latitude, longitude: location.longitude };
      
      // Save location to cache (non-blocking)
      (async () => {
        try {
          const cachedLocation: CachedLocation = {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            timestamp: location.timestamp || Date.now(),
          };
          
          // Try to get address (non-blocking)
          try {
            const address = await getAddressFromCoordinates(location.latitude, location.longitude);
            cachedLocation.address = address;
          } catch (error) {
            // Address lookup failed, but we still save the location
            console.log('Address lookup failed for cached location:', error);
          }
          
          await saveLocationCache(cachedLocation);
        } catch (error) {
          console.error('Error saving location to cache:', error);
        }
      })();
      
      // Update map for Android - double check mapRef is still valid
      if (Platform.OS === 'android' && mapRef.current) {
        try {
          const nodeHandle = findNodeHandle(mapRef.current);
          if (nodeHandle && isMountedRef.current) {
            try {
              UIManager.dispatchViewManagerCommand(
                nodeHandle,
                1, // updateLocation command
                [location.latitude, location.longitude]
              );
            } catch (error: any) {
              // Map might be unmounting or WebView crashed, ignore error silently
              if (error?.message && !error.message.includes('ViewManager')) {
                console.warn('Error updating map location:', error.message);
              }
            }
          }
        } catch (error: any) {
          // Map ref is invalid, component likely unmounted
          if (error?.message && !error.message.includes('ViewManager')) {
            console.warn('Map ref invalid:', error.message);
          }
        }
      }
    }
  };

  const handleMapReady = () => {
    if (!isMountedRef.current || !mapRef.current) {
      return;
    }
    
    onMapReady?.();
    
    // If source is provided (e.g., vehicle location from Redis), don't fetch device location
    // The route will be drawn from source to destination
    if (source) {
      if (!locationReadyRef.current) {
        locationReadyRef.current = true;
        setLocationLoading(false);
        console.log('📍 Map ready with source location provided - route will be drawn from source to destination');
        console.log('📍 Source:', source);
        console.log('📍 Destination:', destination);
        
        // Immediately show vehicle location marker
        if (Platform.OS === 'android' && mapRef.current && isMountedRef.current) {
          const timeoutId = setTimeout(() => {
            if (isMountedRef.current && mapRef.current) {
              try {
                const nodeHandle = findNodeHandle(mapRef.current);
                if (nodeHandle) {
                  // Update location marker immediately to show vehicle position
                  UIManager.dispatchViewManagerCommand(
                    nodeHandle,
                    1, // updateLocation command
                    [source.latitude, source.longitude]
                  );
                  console.log('📍 Vehicle location marker updated:', source.latitude, source.longitude);
                }
              } catch (error: any) {
                if (error?.message && !error.message.includes('ViewManager')) {
                  console.warn('Error updating vehicle location marker:', error.message);
                }
              }
            }
          }, 500); // Small delay to ensure map is ready
          if (timeoutId) {
            timeoutRefs.current.push(timeoutId);
          }
        }
        
        // If destination is also available, trigger route drawing immediately
        if (destination && mapRef.current) {
          console.log('📍 Both source and destination available, triggering route draw');
          const timeoutId = setTimeout(() => {
            if (isMountedRef.current && mapRef.current) {
              drawRoute(
                source.latitude,
                source.longitude,
                destination.latitude,
                destination.longitude,
                routeProfile,
                false, // First draw
                true // isVehicleLocation
              );
              routeDrawnRef.current = true;
              lastRouteLocationRef.current = {
                lat: source.latitude,
                lng: source.longitude
              };
              lastRouteDrawTimeRef.current = Date.now();
            }
          }, 1000); // 1 second delay to ensure map is fully ready
          if (timeoutId) {
            timeoutRefs.current.push(timeoutId);
          }
        }
      }
      return;
    }
    
    // Fetch location once when map is ready (only if source is not provided)
    if (hasPermission && Platform.OS === 'android' && isMountedRef.current && mapRef.current) {
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current && mapRef.current) {
          fetchLocationOnce();
        }
      }, 500);
      if (timeoutId) {
        timeoutRefs.current.push(timeoutId);
      }
    } else if (currentLocation && isMountedRef.current && mapRef.current) {
      // If we already have location, center on it and mark as ready
      centerOnCurrentLocation();
      if (!locationReadyRef.current) {
        locationReadyRef.current = true;
        setLocationLoading(false);
        console.log('📍 Map ready with existing location - enabling tabs');
      }
    } else {
      // If no permission or location, still disable loading after timeout
      const timeoutId = setTimeout(() => {
        if (!locationReadyRef.current && isMountedRef.current) {
          locationReadyRef.current = true;
          setLocationLoading(false);
          console.log('📍 Map ready but no location - enabling tabs after timeout');
        }
      }, 10000); // 10 second timeout
      if (timeoutId) {
        timeoutRefs.current.push(timeoutId);
      }
    }
  };

  const centerOnCurrentLocation = () => {
    if (!isMountedRef.current || !mapRef.current) {
      return;
    }
    
    try {
      const nodeHandle = findNodeHandle(mapRef.current);
      if (nodeHandle && isMountedRef.current) {
        if (Platform.OS === 'ios' && NativeMapViewModule) {
          NativeMapViewModule.centerOnCurrentLocation(nodeHandle);
        } else if (Platform.OS === 'android' && currentLocation && isMountedRef.current) {
          // For Android, use command to update location
          try {
            UIManager.dispatchViewManagerCommand(
              nodeHandle,
              1, // updateLocation command
              [currentLocation.latitude, currentLocation.longitude]
            );
          } catch (error) {
            // Component may be unmounting, ignore error
            console.log('Error centering map (may be unmounting):', error);
          }
        }
      }
    } catch (error) {
      // Component unmounted, ignore error
      console.log('Error finding node handle (may be unmounting):', error);
    }
  };

  // Draw route from current location to destination
  const drawRoute = (fromLat: number, fromLng: number, toLat: number, toLng: number, profile: string = 'driving', isUpdate: boolean = false, isVehicleLocation: boolean = false) => {
    if (!isMountedRef.current || !mapRef.current || Platform.OS !== 'android') {
      return;
    }
    
    try {
      const nodeHandle = findNodeHandle(mapRef.current);
      if (nodeHandle && isMountedRef.current) {
        try {
          UIManager.dispatchViewManagerCommand(
            nodeHandle,
            2, // drawRoute command
            [fromLat, fromLng, toLat, toLng, profile, isVehicleLocation]
          );
          if (!isUpdate && isMountedRef.current) {
            console.log(`🗺️ Requesting ${profile} route from [${fromLat}, ${fromLng}] to [${toLat}, ${toLng}] (isVehicleLocation: ${isVehicleLocation})`);
          }
        } catch (error: any) {
          if (error?.message && !error.message.includes('ViewManager')) {
            console.warn('Error drawing route:', error.message);
          }
        }
      }
    } catch (error: any) {
      if (error?.message && !error.message.includes('ViewManager')) {
        console.warn('Error finding node handle for route:', error.message);
      }
    }
  };

  // Track last route draw location and time to throttle updates
  const lastRouteLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRouteDrawTimeRef = useRef<number>(0);
  const routeDrawnRef = useRef<boolean>(false);
  const ROUTE_UPDATE_THROTTLE_MS = 10000; // 10 seconds
  const MIN_DISTANCE_CHANGE_METERS = 30; // Only redraw if moved 30+ meters

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
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
  };

  // Update vehicle location marker when source changes (for Redis location updates)
  useEffect(() => {
    if (source && Platform.OS === 'android' && mapRef.current && isMountedRef.current) {
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current && mapRef.current) {
          try {
            const nodeHandle = findNodeHandle(mapRef.current);
            if (nodeHandle) {
              // Update location marker when source changes
              UIManager.dispatchViewManagerCommand(
                nodeHandle,
                1, // updateLocation command
                [source.latitude, source.longitude]
              );
              console.log('📍 Vehicle location updated from source:', source.latitude, source.longitude);
            }
          } catch (error: any) {
            if (error?.message && !error.message.includes('ViewManager')) {
              console.warn('Error updating vehicle location from source:', error.message);
            }
          }
        }
      }, 300); // Small delay to ensure map is ready
      if (timeoutId) {
        timeoutRefs.current.push(timeoutId);
      }
      
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutRefs.current = timeoutRefs.current.filter(t => t !== timeoutId);
        }
      };
    }
  }, [source?.latitude, source?.longitude]);

  // Draw route when destination and source/current location are available (throttled)
  useEffect(() => {
    // Use source if provided, otherwise use currentLocation
    const fromLocation = source || currentLocation;
    
    if (destination && fromLocation && mapRef.current) {
      // If source is provided, we don't need GPS permission
      const hasRequiredPermission = source ? true : hasPermission;
      
      if (!hasRequiredPermission) return;
      
      const now = Date.now();
      const lastLocation = lastRouteLocationRef.current;
      const shouldRedraw = 
        !routeDrawnRef.current || // First time drawing
        !lastLocation || // No previous location
        (now - lastRouteDrawTimeRef.current) >= ROUTE_UPDATE_THROTTLE_MS || // Throttle time passed
        calculateDistance(
          fromLocation.latitude,
          fromLocation.longitude,
          lastLocation.lat,
          lastLocation.lng
        ) >= MIN_DISTANCE_CHANGE_METERS; // Significant location change

      if (shouldRedraw && mapRef.current && isMountedRef.current) {
        // Small delay to ensure map is ready
        const timeoutId = setTimeout(() => {
          // Check again if component is still mounted before drawing route
          if (!isMountedRef.current || !mapRef.current) {
            return;
          }
          drawRoute(
            fromLocation.latitude,
            fromLocation.longitude,
            destination.latitude,
            destination.longitude,
            routeProfile,
            routeDrawnRef.current, // Pass whether this is initial draw
            !!source // Pass true if source is provided (vehicle location from Redis)
          );
          if (isMountedRef.current) {
            lastRouteLocationRef.current = {
              lat: fromLocation.latitude,
              lng: fromLocation.longitude
            };
            lastRouteDrawTimeRef.current = now;
            routeDrawnRef.current = true;
            console.log(`🗺️ Drawing ${routeProfile} route from ${source ? 'vehicle' : 'current'} location to destination`);
          }
        }, routeDrawnRef.current ? 500 : 1500); // Faster for updates, slower for initial
        if (timeoutId) {
          timeoutRefs.current.push(timeoutId);
        }
        
        // Cleanup timeout if component unmounts
        return () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutRefs.current = timeoutRefs.current.filter(t => t !== timeoutId);
          }
        };
      }
    }
  }, [destination, source, currentLocation, hasPermission, routeProfile]);

  return (
    <View style={[styles.container, style]}>
      <NativeMapViewComponent
        ref={mapRef}
        style={styles.map}
        onLocationUpdate={handleLocationUpdate}
        onMapReady={handleMapReady}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});

// Fullscreen Map View Component
const NativeMapViewFullscreenComponent = requireNativeComponent<NativeMapViewProps>('NativeMapViewFullscreen', {
  nativeOnly: {
    // Event handlers are handled automatically by React Native bridge
  }
});

export const NativeMapViewFullscreen: React.FC<{
  style?: any;
  onLocationUpdate?: (location: LocationData) => void;
  onMapReady?: () => void;
  destination?: { latitude: number; longitude: number };
  routeProfile?: 'driving' | 'cycling' | 'walking';
}> = ({ 
  style, 
  onLocationUpdate, 
  onMapReady,
  destination,
  routeProfile = 'driving'
}) => {
  const mapRef = useRef<any>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const isMountedRef = useRef(true);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  // Cleanup function to clear all timeouts
  const clearAllTimeouts = useCallback(() => {
    try {
      const timeouts = [...timeoutRefs.current]; // Create a copy to avoid modification during iteration
      timeouts.forEach(timeout => {
        if (timeout) {
          clearTimeout(timeout);
        }
      });
      timeoutRefs.current = [];
    } catch (e) {
      console.warn('Error in clearAllTimeouts:', e);
      timeoutRefs.current = [];
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    requestLocationPermission();
    
    return () => {
      isMountedRef.current = false;
      try {
        clearAllTimeouts();
      } catch (e) {
        console.warn('Error clearing timeouts (fullscreen):', e);
      }
    };
  }, [requestLocationPermission, clearAllTimeouts]);

  useEffect(() => {
    if (hasPermission && Platform.OS === 'android' && isMountedRef.current) {
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current && mapRef.current) {
          fetchLocationOnce();
        }
      }, 1500);  // Longer delay for fullscreen
      timeoutRefs.current.push(timeoutId);
      
      return () => {
        clearTimeout(timeoutId);
        timeoutRefs.current = timeoutRefs.current.filter(t => t !== timeoutId);
      };
    }
  }, [hasPermission]);

  const requestLocationPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        if (!isMountedRef.current) return;

        if (
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
            PermissionsAndroid.RESULTS.GRANTED ||
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
            PermissionsAndroid.RESULTS.GRANTED
        ) {
          setHasPermission(true);
          if (NativeMapViewModule && isMountedRef.current) {
            await NativeMapViewModule.requestLocationPermission();
          }
        } else {
          if (isMountedRef.current) {
            Alert.alert(
              'Location Permission',
              'Location permission is required to show your current location on the map.'
            );
          }
        }
      } catch (err) {
        console.warn(err);
      }
    } else {
      if (isMountedRef.current) {
        setHasPermission(true);
      }
    }
  }, []);

  const fetchLocationOnce = async () => {
    if (!isMountedRef.current || !mapRef.current) {
      return;
    }
    
    if (NativeMapViewModule) {
      try {
        const location = await NativeMapViewModule.getCurrentLocation();
        
        if (!isMountedRef.current || !mapRef.current) {
          return;
        }
        
        if (location) {
          setCurrentLocation(location);
          onLocationUpdate?.(location);
          
          if (Platform.OS === 'android' && mapRef.current && isMountedRef.current) {
            try {
              const nodeHandle = findNodeHandle(mapRef.current);
              if (nodeHandle) {
                try {
                  const commandId = 1;
                  UIManager.dispatchViewManagerCommand(
                    nodeHandle,
                    commandId,
                    [location.latitude, location.longitude]
                  );
                } catch (error) {
                  console.log('Error updating fullscreen map location:', error);
                }
              }
            } catch (error) {
              console.log('Error finding fullscreen map node handle:', error);
            }
          }
        }
      } catch (error) {
        console.log('Error fetching location for fullscreen map:', error);
      }
    }
  };

  const lastLocationUpdateTimeRef = useRef<number>(0);
  const lastLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const LOCATION_UPDATE_THROTTLE_MS = 10000;
  const MIN_LOCATION_CHANGE_METERS = 20;

  const handleLocationUpdate = (event: any) => {
    if (!mapRef.current) {
      return;
    }
    
    const location = event.nativeEvent;
    const now = Date.now();
    const lastUpdate = lastLocationUpdateTimeRef.current;
    const lastLoc = lastLocationRef.current;
    
    let distanceChanged = true;
    if (lastLoc) {
      const R = 6371e3;
      const φ1 = lastLoc.latitude * Math.PI / 180;
      const φ2 = location.latitude * Math.PI / 180;
      const Δφ = (location.latitude - lastLoc.latitude) * Math.PI / 180;
      const Δλ = (location.longitude - lastLoc.longitude) * Math.PI / 180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      distanceChanged = distance >= MIN_LOCATION_CHANGE_METERS;
    }
    
    if ((now - lastUpdate >= LOCATION_UPDATE_THROTTLE_MS) && distanceChanged && mapRef.current) {
      setCurrentLocation(location);
      onLocationUpdate?.(location);
      lastLocationUpdateTimeRef.current = now;
      lastLocationRef.current = { latitude: location.latitude, longitude: location.longitude };
      
      if (Platform.OS === 'android' && mapRef.current) {
        try {
          const nodeHandle = findNodeHandle(mapRef.current);
          if (nodeHandle) {
            try {
              UIManager.dispatchViewManagerCommand(
                nodeHandle,
                1,
                [location.latitude, location.longitude]
              );
            } catch (error) {
              console.log('Error updating fullscreen map location (may be unmounting):', error);
            }
          }
        } catch (error) {
          console.log('Fullscreen map ref invalid, component may be unmounting');
        }
      }
    }
  };

  const handleMapReady = () => {
    if (!isMountedRef.current || !mapRef.current) {
      return;
    }
    
    console.log('🗺️ Fullscreen map ready callback triggered');
    onMapReady?.();
    
    if (hasPermission && Platform.OS === 'android' && isMountedRef.current && mapRef.current) {
      const timeoutId = setTimeout(() => {
        if (isMountedRef.current && mapRef.current) {
          fetchLocationOnce();
        }
      }, 1000);
      timeoutRefs.current.push(timeoutId);
    } else if (currentLocation && isMountedRef.current && mapRef.current) {
      centerOnCurrentLocation();
    }
  };

  const centerOnCurrentLocation = () => {
    if (!isMountedRef.current || !mapRef.current) {
      return;
    }
    
    try {
      const nodeHandle = findNodeHandle(mapRef.current);
      if (nodeHandle && isMountedRef.current) {
        if (Platform.OS === 'ios' && NativeMapViewModule) {
          NativeMapViewModule.centerOnCurrentLocation(nodeHandle);
        } else if (Platform.OS === 'android' && currentLocation && isMountedRef.current) {
          try {
            UIManager.dispatchViewManagerCommand(
              nodeHandle,
              1,
              [currentLocation.latitude, currentLocation.longitude]
            );
          } catch (error) {
            console.log('Error centering fullscreen map (may be unmounting):', error);
          }
        }
      }
    } catch (error) {
      console.log('Error finding fullscreen map node handle (may be unmounting):', error);
    }
  };

  const drawRoute = (fromLat: number, fromLng: number, toLat: number, toLng: number, profile: string = 'driving', isUpdate: boolean = false) => {
    if (!isMountedRef.current || !mapRef.current || Platform.OS !== 'android') {
      return;
    }
    
    try {
      const nodeHandle = findNodeHandle(mapRef.current);
      if (nodeHandle && isMountedRef.current) {
        try {
          UIManager.dispatchViewManagerCommand(
            nodeHandle,
            2,
            [fromLat, fromLng, toLat, toLng, profile, isUpdate]
          );
          if (!isUpdate && isMountedRef.current) {
            console.log(`🗺️ Requesting ${profile} route in fullscreen from [${fromLat}, ${fromLng}] to [${toLat}, ${toLng}]`);
          }
        } catch (error) {
          console.log('Error drawing route in fullscreen (may be unmounting):', error);
        }
      }
    } catch (error) {
      console.log('Error finding node handle for fullscreen route (may be unmounting):', error);
    }
  };

  const lastRouteLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRouteDrawTimeRef = useRef<number>(0);
  const routeDrawnRef = useRef<boolean>(false);
  const ROUTE_UPDATE_THROTTLE_MS = 10000;
  const MIN_DISTANCE_CHANGE_METERS = 30;

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  };

  useEffect(() => {
    if (destination && currentLocation && hasPermission && mapRef.current) {
      const now = Date.now();
      const lastLocation = lastRouteLocationRef.current;
      const shouldRedraw = 
        !routeDrawnRef.current ||
        !lastLocation ||
        (now - lastRouteDrawTimeRef.current) >= ROUTE_UPDATE_THROTTLE_MS ||
        calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          lastLocation.lat,
          lastLocation.lng
        ) >= MIN_DISTANCE_CHANGE_METERS;

      if (shouldRedraw && mapRef.current && isMountedRef.current) {
        const timeoutId = setTimeout(() => {
          if (!isMountedRef.current || !mapRef.current) {
            return;
          }
          drawRoute(
            currentLocation.latitude,
            currentLocation.longitude,
            destination.latitude,
            destination.longitude,
            routeProfile,
            routeDrawnRef.current
          );
          if (isMountedRef.current) {
            lastRouteLocationRef.current = {
              lat: currentLocation.latitude,
              lng: currentLocation.longitude
            };
            lastRouteDrawTimeRef.current = now;
            routeDrawnRef.current = true;
            console.log(`🗺️ Drawing ${routeProfile} route in fullscreen from current location to destination`);
          }
        }, routeDrawnRef.current ? 800 : 2000);  // Longer delays for fullscreen
        timeoutRefs.current.push(timeoutId);
        
        return () => {
          clearTimeout(timeoutId);
          timeoutRefs.current = timeoutRefs.current.filter(t => t !== timeoutId);
        };
      }
    }
  }, [destination, currentLocation, hasPermission, routeProfile]);

  return (
    <View style={[styles.container, style]}>
      <NativeMapViewFullscreenComponent
        ref={mapRef}
        style={styles.map}
        onLocationUpdate={handleLocationUpdate}
        onMapReady={handleMapReady}
      />
    </View>
  );
};
