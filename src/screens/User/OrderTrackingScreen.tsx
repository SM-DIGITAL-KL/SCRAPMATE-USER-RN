import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTranslation } from 'react-i18next';
import { NativeMapView, getAddressFromCoordinates } from '../../components/NativeMapView';
import { SectionCard } from '../../components/SectionCard';
import { redisLocationService } from '../../services/location/redisLocationService';
import { CustomerOrder } from '../../services/api/v2/orders';

interface VehicleLocation {
  latitude: number;
  longitude: number;
  timestamp: string;
  distanceKm?: number; // Distance in kilometers (from Redis)
}

const OrderTrackingScreen = () => {
  const { theme, isDark, themeName } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  
  // Get screen dimensions for styles
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const styles = useMemo(() => getStyles(theme, themeName, screenWidth, screenHeight), [theme, themeName, screenWidth, screenHeight]);

  const order: CustomerOrder = route.params?.order;
  const [vehicleLocation, setVehicleLocation] = useState<VehicleLocation | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const stopPollingRef = useRef<(() => void) | null>(null);
  const hasLocationRef = useRef(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const addressFetchedRef = useRef(false);
  const addressFailedRef = useRef(false);

  // Check if pickup is started (status 3)
  const isPickupStarted = order?.status === 3;
  const isOrderAccepted = order?.status >= 2;
  const isCompleted = order?.status === 5;

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

  // Get destination (customer/order location) - try multiple sources for coordinates
  const destination = useMemo(() => {
    let lat: number | null = null;
    let lng: number | null = null;
    
    // Try 1: Direct latitude/longitude fields
    if (order?.latitude != null && order?.longitude != null) {
      lat = typeof order.latitude === 'number' ? order.latitude : parseFloat(String(order.latitude));
      lng = typeof order.longitude === 'number' ? order.longitude : parseFloat(String(order.longitude));
      
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        console.log('📍 Order destination coordinates (from direct fields):', lat, lng);
        return { latitude: lat, longitude: lng };
      }
    }
    
    // Try 2: Parse from customerdetails JSON string (if it exists)
    if (!lat || !lng) {
      try {
        const customerDetails = (order as any)?.customerdetails;
        if (customerDetails) {
          let parsedDetails: any = null;
          
          // Try to parse if it's a string
          if (typeof customerDetails === 'string') {
            try {
              parsedDetails = JSON.parse(customerDetails);
            } catch {
              // Not JSON, might be plain text
            }
          } else if (typeof customerDetails === 'object') {
            parsedDetails = customerDetails;
          }
          
          if (parsedDetails) {
            // Try latitude/longitude fields
            if (parsedDetails.latitude != null && parsedDetails.longitude != null) {
              lat = typeof parsedDetails.latitude === 'number' 
                ? parsedDetails.latitude 
                : parseFloat(String(parsedDetails.latitude));
              lng = typeof parsedDetails.longitude === 'number' 
                ? parsedDetails.longitude 
                : parseFloat(String(parsedDetails.longitude));
            }
            
            // Try lat_log field (format: "latitude,longitude")
            if ((!lat || !lng) && parsedDetails.lat_log) {
              const latLogStr = String(parsedDetails.lat_log).trim();
              if (latLogStr.includes(',')) {
                const parts = latLogStr.split(',');
                if (parts.length >= 2) {
                  lat = parseFloat(parts[0].trim());
                  lng = parseFloat(parts[1].trim());
                }
              }
            }
            
            if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng) && 
                lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              console.log('📍 Order destination coordinates (from customerdetails):', lat, lng);
              return { latitude: lat, longitude: lng };
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Error parsing customerdetails:', error);
      }
    }
    
    // Try 3: Parse from lat_log field directly on order (if it exists)
    if (!lat || !lng) {
      try {
        const latLog = (order as any)?.lat_log;
        if (latLog && typeof latLog === 'string' && latLog.includes(',')) {
          const parts = latLog.split(',');
          if (parts.length >= 2) {
            lat = parseFloat(parts[0].trim());
            lng = parseFloat(parts[1].trim());
            
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              console.log('📍 Order destination coordinates (from lat_log):', lat, lng);
              return { latitude: lat, longitude: lng };
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Error parsing lat_log:', error);
      }
    }
    
    // If we still don't have coordinates, log what we found
    console.warn('⚠️ Order missing latitude/longitude from all sources:', { 
      hasLat: !!order?.latitude, 
      hasLng: !!order?.longitude,
      hasCustomerdetails: !!(order as any)?.customerdetails,
      hasLatLog: !!(order as any)?.lat_log,
      orderId: order?.id,
      orderKeys: order ? Object.keys(order) : []
    });
    
    return undefined;
  }, [order?.latitude, order?.longitude, (order as any)?.customerdetails, (order as any)?.lat_log]);

  // Use distance from Redis if available, otherwise calculate locally
  const distanceKm = vehicleLocation?.distanceKm !== undefined
    ? vehicleLocation.distanceKm
    : (vehicleLocation && destination
        ? calculateDistance(
            vehicleLocation.latitude,
            vehicleLocation.longitude,
            destination.latitude,
            destination.longitude
          ) / 1000
        : 0);
  const estimatedTime = Math.round(distanceKm * 2); // Rough estimate: 2 min per km

  // Start polling for vehicle location from Redis when order is accepted (status >= 2)
  useEffect(() => {
    if (isOrderAccepted && order?.id) {
      console.log('🚀 Starting vehicle location polling for order:', order.id);
      console.log('📍 Destination coordinates:', destination);
      
      setIsLoadingLocation(true);
      
      // Try to fetch location immediately from Redis
      redisLocationService.getVehicleLocation(order.id, destination).then((location) => {
        if (location) {
          console.log('✅ Vehicle location fetched from Redis:', {
            lat: location.latitude,
            lng: location.longitude,
            timestamp: location.timestamp,
            distanceKm: location.distanceKm
          });
          setIsLoadingLocation(false);
          hasLocationRef.current = true;
          setVehicleLocation({
            latitude: location.latitude,
            longitude: location.longitude,
            timestamp: location.timestamp,
            distanceKm: location.distanceKm, // Use distance from Redis
          });
        } else {
          console.log('⚠️ No vehicle location found in Redis yet for order:', order.id);
          setIsLoadingLocation(false);
        }
      }).catch((error) => {
        console.error('❌ Error fetching vehicle location from Redis:', error);
        setIsLoadingLocation(false);
        // Continue with polling even if initial fetch fails
      });
      
      // Start polling for vehicle location updates from Redis
      const stopPolling = redisLocationService.startPolling(
        order.id,
        (location) => {
          setIsLoadingLocation(false);
          if (location) {
            console.log('📍 Vehicle location updated from Redis:', {
              lat: location.latitude,
              lng: location.longitude,
              timestamp: location.timestamp,
              distanceKm: location.distanceKm
            });
            hasLocationRef.current = true;
            setVehicleLocation({
              latitude: location.latitude,
              longitude: location.longitude,
              timestamp: location.timestamp,
              distanceKm: location.distanceKm, // Use distance from Redis
            });
          } else {
            // Don't set to null if we already have a location (might be temporary Redis issue)
            if (!hasLocationRef.current) {
              console.log('⚠️ Vehicle location not available in Redis');
              setVehicleLocation(null);
            }
          }
        },
        5 * 60 * 1000, // Poll every 5 minutes (300000 ms)
        destination // Pass destination to calculate distance in Redis service
      );

      stopPollingRef.current = stopPolling;

      return () => {
        console.log('🛑 Stopping vehicle location polling for order:', order.id);
        stopPolling();
      };
    } else {
      // Stop polling if order is not accepted
      console.log('🛑 Order not accepted, stopping location polling');
      if (stopPollingRef.current) {
        stopPollingRef.current();
        stopPollingRef.current = null;
      }
      hasLocationRef.current = false;
      setVehicleLocation(null);
    }
  }, [isOrderAccepted, order?.id, destination?.latitude, destination?.longitude]);

  // Get customer location (destination)
  useEffect(() => {
    if (order?.latitude && order?.longitude) {
      setCurrentLocation({
        latitude: order.latitude,
        longitude: order.longitude,
      });
    }
  }, [order?.latitude, order?.longitude]);

  const formatAddress = (address: string | object | null | undefined): string => {
    if (!address) return t('orders.addressNotProvided') || 'Address not provided';
    
    if (typeof address === 'string') {
      try {
        // Try to parse as JSON
        const parsed = JSON.parse(address);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed.address || parsed.formattedAddress || parsed.full_address || JSON.stringify(parsed);
        }
      } catch {
        // Not JSON, return as string
        return address;
      }
      return address;
    }
    
    if (typeof address === 'object') {
      return (address as any).address || (address as any).formattedAddress || (address as any).full_address || JSON.stringify(address);
    }
    
    return String(address);
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 1: {
        const text = t('orders.status.pending');
        return text && text !== 'orders.status.pending' ? text : 'Pending';
      }
      case 2: {
        const text = t('orders.status.assigned');
        return text && text !== 'orders.status.assigned' ? text : 'Assigned';
      }
      case 3: {
        const text = t('orders.status.pickupStarted') || t('orders.status.accepted');
        return text && text !== 'orders.status.pickupStarted' && text !== 'orders.status.accepted' ? text : 'Pickup Started';
      }
      case 4: {
        const text = t('orders.status.arrived');
        return text && text !== 'orders.status.arrived' ? text : 'Arrived';
      }
      case 5: {
        const text = t('orders.status.completed');
        return text && text !== 'orders.status.completed' ? text : 'Completed';
      }
      default: {
        const text = t('orders.status.unknown');
        return text && text !== 'orders.status.unknown' ? text : 'Unknown';
      }
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? theme.background : '#FFFFFF'}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
        <AutoText style={styles.headerTitle} numberOfLines={1}>
          {t('orders.tracking') || 'Order Tracking'}
        </AutoText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={false}
        removeClippedSubviews={true}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
      >
        {/* Map Section (shown when order is accepted but not completed - location will be fetched from Redis) */}
        {isOrderAccepted && !isCompleted ? (
          <>
            <View style={styles.mapContainer}>
              {vehicleLocation ? (
                <NativeMapView
                  style={styles.map}
                  source={{
                    latitude: vehicleLocation.latitude,
                    longitude: vehicleLocation.longitude,
                  }}
                  destination={destination || undefined}
                  routeProfile="driving"
                  onMapReady={() => {
                    console.log('🗺️ Map ready for vehicle tracking');
                    console.log('📍 Vehicle location (from Redis):', {
                      lat: vehicleLocation.latitude,
                      lng: vehicleLocation.longitude,
                      timestamp: vehicleLocation.timestamp
                    });
                    console.log('📍 Destination (order location):', destination);
                    if (destination) {
                      console.log('✅ Route will be drawn from vehicle to order location');
                    } else {
                      console.warn('⚠️ No destination coordinates - route cannot be drawn');
                    }
                  }}
                />
              ) : (
                <View style={styles.mapPlaceholder}>
                  {isLoadingLocation ? (
                    <ActivityIndicator size="large" color={theme.primary} />
                  ) : (
                    <MaterialCommunityIcons
                      name="map-outline"
                      size={48}
                      color={theme.textSecondary}
                    />
                  )}
                  <AutoText style={styles.placeholderText} numberOfLines={2}>
                    {isLoadingLocation
                      ? (t('orders.loadingLocation') || 'Loading vehicle location...')
                      : (t('orders.locationNotAvailable') || 'Vehicle location not available yet')}
                  </AutoText>
                </View>
              )}
              <View style={styles.mapFloatingButtons}>
                <TouchableOpacity
                  style={styles.floatingButton}
                  onPress={() => {
                    // Navigate to fullscreen map if available
                    console.log('Fullscreen map pressed');
                  }}
                >
                  <MaterialCommunityIcons name="fullscreen" size={18} color={theme.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.floatingButton}>
                  <MaterialCommunityIcons name="phone" size={16} color={theme.textPrimary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.floatingButton}>
                  <MaterialCommunityIcons name="message-text" size={16} color={theme.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Distance Bar */}
            {vehicleLocation && destination && (
              <View style={styles.distanceBar}>
                <AutoText style={styles.distanceText}>
                  {distanceKm > 0 ? distanceKm.toFixed(1) : '--'} km
                </AutoText>
                <AutoText style={styles.timeText}>
                  {estimatedTime > 0 ? estimatedTime : '--'} mins
                </AutoText>
              </View>
            )}
          </>
        ) : (
          <View style={styles.waitingSection}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={48}
              color={theme.textSecondary}
            />
            <AutoText style={styles.waitingText} numberOfLines={2}>
              {t('orders.waitingForPickup') || 'Waiting for pickup to start...'}
            </AutoText>
          </View>
        )}

        {/* Order Info Card */}
        <SectionCard style={styles.orderCard}>
          <AutoText style={styles.orderTitle}>
            {t('orders.orderNumber') || 'Order'}: #{order?.order_number || order?.order_no}
          </AutoText>

          {/* Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: isPickupStarted ? theme.accent : theme.border }]}>
            <AutoText style={styles.statusText} numberOfLines={1}>
              {getStatusText(order?.status || 0)}
            </AutoText>
          </View>

          {/* Shop Address (shown when order is accepted) */}
          {isOrderAccepted && order?.shop_address && (
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="store" size={14} color={theme.primary} />
              <AutoText style={styles.detailText} numberOfLines={3}>
                {formatAddress(order.shop_address)}
              </AutoText>
            </View>
          )}

          {/* Customer Address */}
          {order?.address && (
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="map-marker" size={14} color={theme.primary} />
              <AutoText style={styles.addressText} numberOfLines={4}>
                {formatAddress(order.address)}
              </AutoText>
            </View>
          )}

          {/* Estimated Price */}
          {order?.estimated_price && (
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="currency-inr" size={14} color={theme.primary} />
              <AutoText style={styles.detailText} numberOfLines={1}>
                {t('dashboard.estimatedPrice') || 'Estimated Price'}: ₹{order.estimated_price.toLocaleString('en-IN')}
              </AutoText>
            </View>
          )}

          {/* Last Updated (when tracking) */}
          {isPickupStarted && vehicleLocation && (
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={theme.primary} />
              <AutoText style={styles.detailText} numberOfLines={1}>
                {t('orders.lastUpdated') || 'Last updated'}: {new Date(vehicleLocation.timestamp).toLocaleTimeString()}
              </AutoText>
            </View>
          )}
        </SectionCard>
      </ScrollView>
    </View>
  );
};

const getStyles = (theme: any, themeName?: string, screenWidth?: number, screenHeight?: number) => {
  const width = screenWidth || Dimensions.get('window').width;
  const height = screenHeight || Dimensions.get('window').height;

  return ScaledSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: '18@s',
      paddingVertical: '16@vs',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: themeName === 'whitePurple' ? '#FFFFFF' : theme.card,
    },
    headerTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '18@s',
      color: theme.textPrimary,
    },
    scrollContent: {
      paddingBottom: '12@vs',
      paddingHorizontal: 0,
    },
    mapContainer: {
      height: '240@vs',
      position: 'relative',
      backgroundColor: theme.background,
      marginTop: 0,
      borderRadius: '12@s',
      overflow: 'hidden',
    },
    map: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    mapPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
      gap: '12@vs',
    },
    placeholderText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
      textAlign: 'center',
      paddingHorizontal: '20@s',
    },
    mapFloatingButtons: {
      position: 'absolute',
      right: '12@s',
      top: '12@vs',
      gap: '10@vs',
    },
    floatingButton: {
      width: '36@s',
      height: '36@s',
      borderRadius: '18@s',
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
      elevation: 3,
    },
    distanceBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: '14@s',
      paddingVertical: '10@vs',
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    distanceText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: theme.textPrimary,
    },
    timeText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: theme.textPrimary,
    },
    orderCard: {
      marginHorizontal: '14@s',
      marginTop: '14@vs',
      marginBottom: '14@vs',
    },
    orderTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '15@s',
      color: theme.textPrimary,
      marginBottom: '12@vs',
    },
    statusBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: '12@s',
      paddingVertical: '6@vs',
      borderRadius: '12@ms',
      marginBottom: '12@vs',
    },
    statusText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: theme.textPrimary,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: '6@s',
      marginBottom: '10@vs',
    },
    detailText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      flex: 1,
    },
    addressText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      flex: 1,
      lineHeight: '18@vs',
    },
    waitingSection: {
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '40@vs',
      marginHorizontal: '14@s',
      marginTop: '14@vs',
      borderWidth: 1,
      borderColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
      gap: '16@vs',
    },
    waitingText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
      textAlign: 'center',
    },
  });
};

export default OrderTrackingScreen;
