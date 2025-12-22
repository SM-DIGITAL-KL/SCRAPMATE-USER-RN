import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { NativeMapView, getAddressFromCoordinates } from './NativeMapView';

interface LocationHistoryMapProps {
  style?: any;
  onMapReady?: () => void;
  onLocationUpdate?: (location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }) => void;
}

/**
 * Component to display current location on a map
 * Simple map view that shows only the current location
 */
export const LocationHistoryMap: React.FC<LocationHistoryMapProps> = ({ 
  style,
  onMapReady,
  onLocationUpdate
}) => {
  // Track address lookup to prevent repeated calls (similar to DeliveryTrackingScreen)
  const addressFetchedRef = useRef(false);
  const addressFailedRef = useRef(false);

  return (
    <View style={[styles.container, style]}>
      <NativeMapView
        style={styles.map}
        onLocationUpdate={async (location) => {
          console.log('📍 Current location:', location);
          
          // Get and log address for debugging - only once (success or failure)
          if (!addressFetchedRef.current && !addressFailedRef.current) {
            try {
              const address = await getAddressFromCoordinates(location.latitude, location.longitude);
              addressFetchedRef.current = true;
              console.log('📍 Address:', address.address || address.formattedAddress);
            } catch (error) {
              addressFailedRef.current = true;
              console.warn('⚠️ Failed to get address:', error);
            }
          }
          
          // Call parent's onLocationUpdate if provided
          onLocationUpdate?.(location);
        }}
        onMapReady={() => {
          console.log('🗺️ Map is ready');
          onMapReady?.();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    flex: 1,
    width: '100%',
  },
});

