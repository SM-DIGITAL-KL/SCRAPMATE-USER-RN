import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  PermissionsAndroid,
  AppState,
  InteractionManager,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import { useTheme } from './ThemeProvider';
import { AutoText } from './AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { LocationHistoryMap } from './LocationHistoryMap';
import { getAddressFromCoordinates } from './NativeMapView';
import { saveLocationToCache } from '../services/location/locationCacheService';
import { NativeModules } from 'react-native';
import { saveAddress, SaveAddressData, getCustomerAddresses } from '../services/api/v2/address';
import { updateProfile } from '../services/api/v2/profile';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { NativeMapViewModule } = NativeModules;

interface AddAddressModalProps {
  visible: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
  userData: any;
  themeName?: string;
  required?: boolean; // If true, modal cannot be closed until address and email are added
}

export const AddAddressModal: React.FC<AddAddressModalProps> = ({
  visible,
  onClose,
  onSaveSuccess,
  userData,
  themeName,
  required = false,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>('Shop No 15, Katraj');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const locationFetchedRef = useRef(false);
  const needsRefreshRef = useRef(false); // Track if we need to refresh when modal becomes visible
  const [mapRefreshKey, setMapRefreshKey] = useState(0); // Key to force map remount
  const [houseName, setHouseName] = useState('');
  const [nearbyLocation, setNearbyLocation] = useState('');
  const [addressType, setAddressType] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [savingAddress, setSavingAddress] = useState(false);
  const locationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  // Helper function to check if we have valid location coordinates (without requiring address)
  const hasValidLocation = (): boolean => {
    return !!(
      currentLocation &&
      typeof currentLocation.latitude === 'number' &&
      typeof currentLocation.longitude === 'number' &&
      !isNaN(currentLocation.latitude) &&
      !isNaN(currentLocation.longitude) &&
      currentLocation.latitude >= -90 &&
      currentLocation.latitude <= 90 &&
      currentLocation.longitude >= -180 &&
      currentLocation.longitude <= 180
    );
  };

  // Helper function to check if we have valid coordinates (location + address)
  const hasValidCoordinates = (): boolean => {
    return !!(
      hasValidLocation() &&
      currentAddress &&
      currentAddress !== 'Shop No 15, Katraj' &&
      currentAddress.trim() !== ''
    );
  };

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setShowAddressForm(false);
      locationFetchedRef.current = false;
      setMapRefreshKey(0); // Reset map refresh key
      setHouseName('');
      setNearbyLocation('');
      setAddressType('Home');
      setCurrentAddress('Shop No 15, Katraj');
      setCurrentLocation(null);
      // Set email from userData if available
      const userEmail = userData?.email || userData?.customer?.email || '';
      setEmail(userEmail);
      // Set name from userData if available
      const userName = userData?.name || '';
      setName(userName);
      if (locationTimeoutRef.current) {
        clearTimeout(locationTimeoutRef.current);
        locationTimeoutRef.current = null;
      }
    }
  }, [visible, userData]);

  const handleClose = () => {
    // If required, don't allow closing
    if (required) {
      Alert.alert(
        'Required Information',
        'Please add your address and email to continue.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setShowAddressForm(false);
    locationFetchedRef.current = false;
    setHouseName('');
    setNearbyLocation('');
    setAddressType('Home');
    setCurrentAddress('Shop No 15, Katraj');
    setCurrentLocation(null);
    setEmail('');
    setName('');
    if (locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
      locationTimeoutRef.current = null;
    }
    onClose();
  };

  // Check location permission and services when app comes back to foreground
  useEffect(() => {
    if (!visible) return;

    let previousAppState = AppState.currentState;
    console.log('📱 AppState listener initialized, current state:', previousAppState);

    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      console.log('📱 AppState changed:', previousAppState, '->', nextAppState);
      
      // Only trigger when app comes back to active from background/inactive
      if (previousAppState.match(/inactive|background/) && nextAppState === 'active' && visible) {
        console.log('🔄 App returned from background, checking permissions and location services...');
        
        // Wait a moment for the app to fully resume
        setTimeout(async () => {
          if (!visible) {
            console.log('Modal no longer visible, skipping refresh');
            return;
          }

          if (NativeMapViewModule) {
            try {
              // Check location services
              const isEnabled = await NativeMapViewModule.isLocationEnabled();
              console.log('📍 Location services enabled:', isEnabled);
              
              // Check permissions (Android only)
              let granted = false;
              if (Platform.OS === 'android') {
                granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
                console.log('🔐 Location permission granted:', granted);
              } else {
                // For iOS, assume granted if we can check location services
                granted = isEnabled;
                console.log('🔐 iOS location permission (assumed from services):', granted);
              }
              
              // If both are enabled, refresh location
              if (isEnabled && granted) {
                console.log('✅ Both permissions and location services are enabled');
                
                // Reset location fetch flag to allow fresh fetch
                locationFetchedRef.current = false;
                
                // If form was shown, go back to map view to show location
                if (showAddressForm) {
                  console.log('🔄 Resetting to map view to show location...');
                  setShowAddressForm(false);
                }
                
                // Force map to remount by changing the key
                // This will trigger onMapReady again and fetch location
                console.log('🔄 Forcing map refresh to trigger location fetch...');
                // Reset location state to show loading
                setCurrentLocation(null);
                setCurrentAddress('Shop No 15, Katraj');
                // Increment key to force map remount - this will trigger onMapReady
                setMapRefreshKey(prev => prev + 1);
              } else {
                console.log('⚠️ Permissions or location not fully enabled yet');
                if (!isEnabled) {
                  console.log('   - Location services: disabled');
                }
                if (!granted) {
                  console.log('   - Permissions: not granted');
                }
              }
            } catch (error) {
              console.warn('❌ Error checking location after app state change:', error);
            }
          } else {
            console.warn('⚠️ NativeMapViewModule not available');
          }
        }, 800); // Increased delay to ensure app is fully active
      }
      
      previousAppState = nextAppState;
    });

    return () => {
      console.log('📱 AppState listener removed');
      subscription.remove();
    };
  }, [visible, currentLocation, showAddressForm]);

  // Helper function to safely open app settings
  const openAppSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await Linking.openSettings();
      } else {
        await Linking.openURL('app-settings:');
      }
    } catch (error) {
      console.warn('Failed to open settings:', error);
      // If opening settings fails, try opening general settings as fallback
      try {
        if (Platform.OS === 'android') {
          await Linking.openSettings();
        } else {
          await Linking.openURL('app-settings:');
        }
      } catch (fallbackError) {
        console.error('Failed to open settings even with fallback:', fallbackError);
      }
    }
  };

  // Function to check permissions and refresh location if needed
  const checkAndRefreshLocation = async () => {
    if (!NativeMapViewModule) {
      console.warn('NativeMapViewModule not available');
      return;
    }

    try {
      console.log('🔍 Checking permissions and location services...');
      
      // Check location services
      const isEnabled = await NativeMapViewModule.isLocationEnabled();
      console.log('📍 Location services enabled:', isEnabled);
      
      // Check permissions (Android only)
      let granted = false;
      if (Platform.OS === 'android') {
        granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        console.log('🔐 Location permission granted:', granted);
      } else {
        granted = isEnabled;
        console.log('🔐 iOS location permission (assumed from services):', granted);
      }
      
      // If both are enabled and we don't have location, refresh
      if (isEnabled && granted) {
        if (!currentLocation || !hasValidLocation()) {
          console.log('✅ Permissions enabled, refreshing location...');
          
          // Reset location fetch flag
          locationFetchedRef.current = false;
          
          // If form was shown, go back to map view
          if (showAddressForm) {
            console.log('🔄 Resetting to map view...');
            setShowAddressForm(false);
          }
          
          // Reset location state
          setCurrentLocation(null);
          setCurrentAddress('Shop No 15, Katraj');
          
          // Force map remount
          console.log('🔄 Forcing map refresh...');
          setMapRefreshKey(prev => prev + 1);
          
          // Wait for map to be ready, then fetch location
          InteractionManager.runAfterInteractions(() => {
            setTimeout(async () => {
              await fetchLocation(true);
            }, 1000);
          });
        } else {
          console.log('✅ Location already available');
        }
      } else {
        console.log('⚠️ Permissions or location not enabled');
      }
    } catch (error) {
      console.warn('❌ Error checking and refreshing location:', error);
    }
  };

  // Helper function to fetch location
  const fetchLocation = async (force = false) => {
    if (!NativeMapViewModule) {
      console.warn('NativeMapViewModule not available');
      return;
    }

    // If already fetched and not forcing, skip
    if (locationFetchedRef.current && !force) {
      console.log('Location already fetched, skipping...');
      return;
    }

    try {
      console.log('📍 Fetching location...');
      locationFetchedRef.current = true;
      const location = await NativeMapViewModule.getCurrentLocation();
      
      if (location) {
        setCurrentLocation({
          latitude: location.latitude,
          longitude: location.longitude
        });
        
        // Clear timeout since we got location successfully
        if (locationTimeoutRef.current) {
          clearTimeout(locationTimeoutRef.current);
          locationTimeoutRef.current = null;
        }
        
        // Show form immediately when location is received
        console.log('✅ Location received, showing form...');
        setShowAddressForm(true);
        
        // Get address from coordinates in background (non-blocking)
        getAddressFromCoordinates(location.latitude, location.longitude)
          .then((address) => {
            const addressText = address.address || address.formattedAddress || 'Shop No 15, Katraj';
            setCurrentAddress(addressText);
            
            // Save location to cache
            saveLocationToCache({
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy,
              timestamp: location.timestamp || Date.now(),
              address: address,
            })
              .then(() => {
                console.log('✅ Location cached for 365 days');
              })
              .catch((cacheError) => {
                console.warn('Failed to cache location:', cacheError);
              });
          })
          .catch((error) => {
            console.warn('Failed to get address:', error);
            // Still save location without address
            saveLocationToCache({
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy,
              timestamp: location.timestamp || Date.now(),
            })
              .then(() => {
                console.log('✅ Location cached (without address) for 365 days');
              })
              .catch((cacheError) => {
                console.warn('Failed to cache location:', cacheError);
              });
          });
      }
    } catch (error) {
      console.error('Error fetching location:', error);
      locationFetchedRef.current = false; // Reset on error so we can retry
    }
  };

  const handleSkipToForm = async () => {
    if (locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
      locationTimeoutRef.current = null;
    }
    
    // If we already have valid location, proceed directly to form
    if (hasValidLocation()) {
      setShowAddressForm(true);
      return;
    }
    
    // Check permissions and location services
    if (NativeMapViewModule) {
      try {
        // First check permissions (Android only)
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          if (!granted) {
            // Permission not granted - try to request first
            try {
              const results = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
              ]);
              
              const fineGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
              const coarseGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
              
              if (!fineGranted && !coarseGranted) {
                // Permission denied - open app settings for permissions
                console.log('❌ Permission denied, opening app settings...');
                await openAppSettings();
                return;
              }
              // Permission granted, continue to check location services
            } catch (permissionError) {
              console.warn('Permission request failed:', permissionError);
              // If request fails, open settings
              await openAppSettings();
              return;
            }
          }
        }
        
        // Check if location services are enabled
        const isEnabled = await NativeMapViewModule.isLocationEnabled();
        if (!isEnabled) {
          // Location services disabled - open location settings
          console.log('📍 Location services disabled, opening location settings...');
          if (Platform.OS === 'android') {
            // Open location settings on Android
            Linking.openSettings();
          } else {
            // Open app settings on iOS (location settings are in app settings)
            Linking.openURL('app-settings:');
          }
          return;
        }
        
        // Both permissions and location services are enabled - proceed to form
        console.log('✅ Permissions and location services enabled, showing form...');
        setShowAddressForm(true);
        
      } catch (error) {
        console.warn('Error checking location status:', error);
        // If we can't check, try to open settings as fallback
        await openAppSettings();
      }
    } else {
      // Native module not available - proceed to form anyway (user can enter manually)
      console.log('📍 Native module not available, showing form...');
      setShowAddressForm(true);
    }
    
    // Not required - but still check for valid coordinates and show helpful alerts
    // No valid location data - check permissions and open settings if disabled
    if (NativeMapViewModule) {
      try {
        // Check if location services are enabled
        const isEnabled = await NativeMapViewModule.isLocationEnabled();
        if (!isEnabled) {
          // Location services disabled - directly open settings
          console.log('📍 Location services disabled, opening settings...');
          if (Platform.OS === 'android') {
            Linking.openSettings();
          } else {
            Linking.openURL('app-settings:');
          }
          return;
        }
        
        // Location services enabled, check permissions (Android only)
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
          if (!granted) {
            // Permission not granted - try to request first, if denied then open settings
            try {
              const results = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
              ]);
              
              const fineGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
              const coarseGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
              
              if (fineGranted || coarseGranted) {
                // Permission granted
                console.log('✅ Permission granted, waiting for location...');
                return;
              } else {
                // Permission denied - directly open settings
                console.log('❌ Permission denied, opening settings...');
                Linking.openSettings();
                return;
              }
            } catch (permissionError) {
              console.warn('Permission request failed:', permissionError);
              // If request fails, open settings
              Linking.openSettings();
              return;
            }
          }
        }
        
        // Location services enabled and permissions granted, but no location received
        Alert.alert(
          'Location Not Detected',
          `We couldn't detect your current location. This might be due to:\n\n� Poor GPS signal\n� Being indoors\n� Temporary network issues\n\nYou can manually enter your address on the next screen.`,
          [
            { text: 'Enter Address Manually', onPress: () => setShowAddressForm(true) }
          ]
        );
        
      } catch (error) {
        console.warn('Error checking location status:', error);
        // If we can't check location status, open settings as fallback
        console.log('📍 Error checking location, opening settings as fallback...');
        await openAppSettings();
      }
    } else {
      // Native module not available - try to open settings, then show form
      console.log('📍 Native module not available, opening settings...');
      try {
        await openAppSettings();
      } catch (error) {
        console.warn('Failed to open settings:', error);
      }
      // Also show option to enter address manually
      Alert.alert(
        'Location Service Unavailable',
        'Location services are not supported on this device. Please manually enter your address on the next screen.',
        [
          { text: 'Enter Address', onPress: () => setShowAddressForm(true) }
        ]
      );
    }
  };

  // Validate email format
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Validate name - should not be default "User_xx" format
  const isValidName = (name: string): boolean => {
    const trimmedName = name.trim();
    if (!trimmedName) return false;
    // Check if name matches pattern "User_" followed by digits (default format)
    const defaultNamePattern = /^User_\d+$/i;
    return !defaultNamePattern.test(trimmedName);
  };

  const handleSaveAddress = async () => {
    if (!userData?.id) {
      Alert.alert('Error', 'User not found. Please login again.');
      return;
    }
    
    // Validate location/address if required
    if (!currentLocation) {
      Alert.alert('Location Required', 'Please select your location on the map to continue.');
      return;
    }
    
    if (!currentAddress || currentAddress.trim() === '' || currentAddress === 'Shop No 15, Katraj') {
      Alert.alert('Address Required', 'Please enter a valid address to continue.');
      return;
    }
    
    // Validate name and email if required
    if (required) {
      const trimmedName = name.trim();
      if (!trimmedName) {
        Alert.alert('Name Required', 'Please enter your full name to continue.');
        return;
      }
      if (!isValidName(trimmedName)) {
        Alert.alert('Invalid Name', 'Please enter your real name. The default name format cannot be used.');
        return;
      }
      
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        Alert.alert('Email Required', 'Please enter your email address to continue.');
        return;
      }
      if (!validateEmail(trimmedEmail)) {
        Alert.alert('Invalid Email', 'Please enter a valid email address.');
        return;
      }
    }

    setSavingAddress(true);
    try {
      // Save address
      const addressData: SaveAddressData = {
        customer_id: userData.id,
        address: currentAddress,
        addres_type: addressType,
        building_no: houseName.trim() || undefined,
        landmark: nearbyLocation.trim() || undefined,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        lat_log: `${currentLocation.latitude},${currentLocation.longitude}`,
      };

      await saveAddress(addressData);
      
      // Save addresses to AsyncStorage after saving
      try {
        const addresses = await getCustomerAddresses(userData.id);
        const savedAddressesKey = `saved_addresses_${userData.id}`;
        await AsyncStorage.setItem(savedAddressesKey, JSON.stringify(addresses));
        console.log('?? Saved addresses to AsyncStorage:', addresses.length, 'address(es)');
      } catch (storageError: any) {
        console.error('Error saving addresses to AsyncStorage:', storageError);
        // Don't fail the whole process if AsyncStorage save fails
      }
      
      // Update name and email if provided and required
      if (required) {
        try {
          const updateData: any = {};
          if (name.trim() && isValidName(name.trim())) {
            updateData.name = name.trim();
          }
          if (email.trim()) {
            updateData.email = email.trim();
          }
          
          if (Object.keys(updateData).length > 0) {
            await updateProfile(userData.id, updateData);
            console.log('? Profile updated successfully:', updateData);
          }
        } catch (profileError: any) {
          console.error('Error updating profile:', profileError);
          // Don't fail the whole process if profile update fails
          // Address is more critical
        }
      }
      
      if (required) {
        // If required, don't show success alert, just call onSaveSuccess
        // The parent component will handle navigation
        if (onSaveSuccess) {
          onSaveSuccess();
        }
      } else {
        Alert.alert('Success', 'Address saved successfully!', [
          {
            text: 'OK',
            onPress: () => {
              handleClose();
              if (onSaveSuccess) {
                onSaveSuccess();
              }
            },
          },
        ]);
      }
    } catch (error: any) {
      console.error('Error saving address:', error);
      Alert.alert('Error', error.message || 'Failed to save address. Please try again.');
    } finally {
      setSavingAddress(false);
    }
  };

  if (!visible) {
    return null;
  }

  const styles = getStyles(theme, themeName);

  return (
    <View style={styles.locationHistoryModal}>
      {!required && (
        <TouchableOpacity
          style={styles.locationHistoryModalBackdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
      )}
      {required && (
        <View style={styles.locationHistoryModalBackdrop} />
      )}
      <View style={[styles.locationHistoryModalContent, { paddingTop: insets.top }]}>
        <View style={styles.locationHistoryModalHeader}>
          {!required && (
            <TouchableOpacity onPress={handleClose}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={theme.textPrimary}
              />
            </TouchableOpacity>
          )}
          {required && <View style={{ width: 24 }} />}
          <AutoText style={styles.locationHistoryModalTitle}>
            {required ? 'Complete Your Profile' : 'Add Address'}
          </AutoText>
          {!required && (
            <TouchableOpacity
              onPress={handleClose}
              style={styles.locationHistoryModalClose}
            >
              <MaterialCommunityIcons name="close" size={24} color={theme.textPrimary} />
            </TouchableOpacity>
          )}
          {required && <View style={{ width: 24 }} />}
        </View>
        <View style={styles.body}>
          {!showAddressForm && (
            <View style={styles.mapWrapper}>
              <LocationHistoryMap
                key={`map-${mapRefreshKey}`}
                style={styles.locationHistoryMap}
                onMapReady={async () => {
                  console.log('??? Location history map ready in modal');
                
                // Set a timeout fallback to show form after 10 seconds if location fetch fails
                locationTimeoutRef.current = setTimeout(async () => {
                  if (!showAddressForm && !locationFetchedRef.current) {
                    console.log('⏰ Location fetch timeout - checking permission status');
                    
                    // If required, don't allow skipping - force permission setup
                    if (required) {
                      // Check if location services are enabled and permissions are granted
                      if (NativeMapViewModule) {
                        try {
                          const isEnabled = await NativeMapViewModule.isLocationEnabled();
                          if (!isEnabled) {
                            // Location services are disabled - force enable
                            Alert.alert(
                              'Location Services Required',
                              'Location services must be enabled to complete your signup. Please enable Location Services in Settings.',
                              [
                                { 
                                  text: 'Go to Settings', 
                                  onPress: () => {
                                    if (Platform.OS === 'android') {
                                      Linking.openSettings();
                                    } else {
                                      Linking.openURL('app-settings:');
                                    }
                                  }
                                }
                              ],
                              { cancelable: false }
                            );
                            return;
                          }
                          
                          // Location services enabled, check permissions (Android only)
                          if (Platform.OS === 'android') {
                            const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
                            if (!granted) {
                              // Permission not granted - force request
                              Alert.alert(
                                'Location Permission Required',
                                'Location permission is required to complete your signup. Please grant permission to continue.',
                                [
                                  { 
                                    text: 'Grant Permission', 
                                    onPress: async () => {
                                      try {
                                        const results = await PermissionsAndroid.requestMultiple([
                                          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                                          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
                                        ]);
                                        
                                        const fineGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
                                        const coarseGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
                                        
                                        if (fineGranted || coarseGranted) {
                                          // Permission granted, try to get location again
                                          locationFetchedRef.current = false;
                                        } else {
                                          // Permission denied - force to settings
                                          Alert.alert(
                                            'Permission Required',
                                            'Location permission is required. Please enable it in Settings.',
                                            [
                                              { 
                                                text: 'Open Settings', 
                                                onPress: () => {
                                                  Linking.openSettings();
                                                }
                                              }
                                            ],
                                            { cancelable: false }
                                          );
                                        }
                                      } catch (permissionError) {
                                        console.warn('Permission request failed:', permissionError);
                                        Alert.alert(
                                          'Permission Required',
                                          'Location permission is required. Please enable it in Settings.',
                                          [
                                            { 
                                              text: 'Open Settings', 
                                              onPress: () => {
                                                Linking.openSettings();
                                              }
                                            }
                                          ],
                                          { cancelable: false }
                                        );
                                      }
                                    }
                                  }
                                ],
                                { cancelable: false }
                              );
                              return;
                            }
                          }
                          
                          // Permissions granted but location not received - wait longer
                          Alert.alert(
                            'Detecting Location',
                            'Please wait while we detect your location. Make sure you are in an area with good GPS signal.',
                            [
                              { text: 'OK' }
                            ]
                          );
                          // Reset timeout to wait longer
                          locationFetchedRef.current = false;
                          return;
                        } catch (error) {
                          console.warn('Error checking location status:', error);
                          // If we can't check location status, open settings as fallback
                          console.log('📍 Error checking location, opening settings as fallback...');
                          await openAppSettings();
                          return;
                        }
                      }
                      return; // Don't show form if required
                    }
                    
                    // Not required - allow showing form after timeout
                    // Check if location services are enabled and permissions are granted
                    if (NativeMapViewModule) {
                      try {
                        NativeMapViewModule.isLocationEnabled().then((isEnabled: boolean) => {
                          if (!isEnabled) {
                            // Location services are disabled
                            Alert.alert(
                              'Location Services Disabled',
                              'Please enable location services in your device settings to continue.',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { 
                                  text: 'Go to Settings', 
                                  onPress: () => {
                                    if (Platform.OS === 'android') {
                                      Linking.openSettings();
                                    } else {
                                      Linking.openURL('app-settings:');
                                    }
                                  }
                                }
                              ]
                            );
                          } else {
                            // Location services are enabled but we couldn't get location
                            // Check if we have permission
                            if (Platform.OS === 'android') {
                              PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
                                .then(granted => {
                                  if (!granted) {
                                    // Permission not granted, request it
                                    Alert.alert(
                                      'Location Permission Required',
                                      'Location permission is needed to select your address. Would you like to grant permission?',
                                      [
                                        { text: 'Cancel', style: 'cancel' },
                                        { 
                                          text: 'Allow', 
                                          onPress: () => {
                                            PermissionsAndroid.requestMultiple([
                                              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                                              PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
                                            ]).then(results => {
                                              const fineGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
                                              const coarseGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
                                              
                                              if (fineGranted || coarseGranted) {
                                                // Permission granted, try to get location again
                                                locationFetchedRef.current = false;
                                              } else {
                                                // Permission still not granted, show form
                                                setShowAddressForm(true);
                                              }
                                            });
                                          }
                                        }
                                      ]
                                    );
                                  } else {
                                    // Permission granted but location still not obtained, show form
                                    setShowAddressForm(true);
                                  }
                                });
                            } else {
                              // For iOS, we can't programmatically check permissions without requesting them
                              // Show form as fallback
                              setShowAddressForm(true);
                            }
                          }
                        }).catch(() => {
                          // If checking location status fails, show form
                          setShowAddressForm(true);
                        });
                      } catch (error) {
                        console.warn('Error checking location status:', error);
                        // If anything goes wrong, show form
                        setShowAddressForm(true);
                      }
                    } else {
                      // NativeMapViewModule not available, show form
                      setShowAddressForm(true);
                    }
                  }
                }, 10000);

                // Fetch location only after map is loaded (native module handles loading UI)
                if (!locationFetchedRef.current) {
                  locationFetchedRef.current = true;
                  try {
                    if (NativeMapViewModule) {
                      const location = await NativeMapViewModule.getCurrentLocation();
                      if (location) {
                        setCurrentLocation({
                          latitude: location.latitude,
                          longitude: location.longitude
                        });
                        
                        // Clear timeout since we got location successfully
                        if (locationTimeoutRef.current) {
                          clearTimeout(locationTimeoutRef.current);
                          locationTimeoutRef.current = null;
                        }
                        
                        // Show form immediately when location is received
                        // Don't wait for address lookup - user can proceed with location
                        console.log('✅ Location received, showing form...');
                        setShowAddressForm(true);
                        
                        // Get address from coordinates in background (non-blocking)
                        getAddressFromCoordinates(location.latitude, location.longitude)
                          .then((address) => {
                            const addressText = address.address || address.formattedAddress || 'Shop No 15, Katraj';
                            setCurrentAddress(addressText);
                            
                            // Save location to cache (365 days) - similar to categories cache
                            saveLocationToCache({
                              latitude: location.latitude,
                              longitude: location.longitude,
                              accuracy: location.accuracy,
                              timestamp: location.timestamp || Date.now(),
                              address: address,
                            })
                              .then(() => {
                                console.log('✅ Location cached for 365 days');
                              })
                              .catch((cacheError) => {
                                console.warn('Failed to cache location:', cacheError);
                              });
                          })
                          .catch((error) => {
                            console.warn('Failed to get address:', error);
                            // Keep default address if lookup fails
                            // Still save location without address
                            saveLocationToCache({
                              latitude: location.latitude,
                              longitude: location.longitude,
                              accuracy: location.accuracy,
                              timestamp: location.timestamp || Date.now(),
                            })
                              .then(() => {
                                console.log('✅ Location cached (without address) for 365 days');
                              })
                              .catch((cacheError) => {
                                console.warn('Failed to cache location:', cacheError);
                              });
                          });
                      } else {
                        // No location received, show form after timeout
                        console.log('?? No location received from native module');
                      }
                    } else {
                      // Not Android or module not available, show form after timeout
                      console.log('?? Location fetch not available on this platform');
                    }
                  } catch (error) {
                    console.error('Error loading location:', error);
                    locationFetchedRef.current = false; // Reset on error so we can retry
                    // Form will show via timeout fallback
                  }
                }
              }}
              onLocationUpdate={async (location: {
                latitude: number;
                longitude: number;
                accuracy: number;
                timestamp: number;
              }) => {
                // Only update if location actually changed significantly
                if (currentLocation) {
                  const R = 6371e3; // Earth radius in meters
                  const phi1 = currentLocation.latitude * Math.PI / 180;
                  const phi2 = location.latitude * Math.PI / 180;
                  const deltaPhi = (location.latitude - currentLocation.latitude) * Math.PI / 180;
                  const deltaLambda = (location.longitude - currentLocation.longitude) * Math.PI / 180;
                  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
                            Math.cos(phi1) * Math.cos(phi2) *
                            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                  const distance = R * c;
                  
                  // Only update if moved more than 50 meters
                  if (distance < 50) {
                    return;
                  }
                }
                
                // Validate coordinates before setting
                if (
                  typeof location.latitude === 'number' &&
                  typeof location.longitude === 'number' &&
                  !isNaN(location.latitude) &&
                  !isNaN(location.longitude) &&
                  location.latitude >= -90 &&
                  location.latitude <= 90 &&
                  location.longitude >= -180 &&
                  location.longitude <= 180
                ) {
                  setCurrentLocation({
                    latitude: location.latitude,
                    longitude: location.longitude
                  });
                  
                  // Update address when location updates - throttle to prevent excessive calls
                  // Only update address if we don't have one or if location changed significantly
                  if (!currentAddress || currentAddress === 'Shop No 15, Katraj') {
                    try {
                      const address = await getAddressFromCoordinates(location.latitude, location.longitude);
                      const addressText = address.address || address.formattedAddress || currentAddress;
                      setCurrentAddress(addressText);
                      
                      // Save location to cache (365 days) - similar to categories cache
                      try {
                        await saveLocationToCache({
                          latitude: location.latitude,
                          longitude: location.longitude,
                          accuracy: location.accuracy,
                          timestamp: location.timestamp || Date.now(),
                          address: address,
                        });
                        console.log('💾 Location cached for 365 days');
                      } catch (cacheError) {
                        console.warn('Failed to cache location:', cacheError);
                      }
                    } catch (error) {
                      console.warn('Failed to get address:', error);
                      // Still save location without address
                      try {
                        await saveLocationToCache({
                          latitude: location.latitude,
                          longitude: location.longitude,
                          accuracy: location.accuracy,
                          timestamp: location.timestamp || Date.now(),
                        });
                        console.log('💾 Location cached (without address) for 365 days');
                      } catch (cacheError) {
                        console.warn('Failed to cache location:', cacheError);
                      }
                    }
                  }
                } else {
                  console.warn('Invalid location coordinates received:', location);
                }
              }}
              />
              <View style={styles.mapSkipButtonContainer}>
                <TouchableOpacity
                  style={styles.mapSkipButton}
                  onPress={handleSkipToForm}
                  activeOpacity={0.8}
                >
                  <AutoText style={styles.mapSkipButtonText}>
                    Continue
                  </AutoText>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {showAddressForm && (
            <ScrollView
              style={styles.addressFormContainer}
              contentContainerStyle={styles.addressFormContent}
              keyboardShouldPersistTaps="handled"
            >
            <View style={styles.addressFormSection}>
              <AutoText style={styles.addressFormLabel}>Address</AutoText>
              <View style={styles.addressDisplayContainer}>
                <AutoText style={styles.addressDisplayText} numberOfLines={3}>
                  {currentAddress}
                </AutoText>
              </View>
            </View>

            <View style={styles.addressFormSection}>
              <AutoText style={styles.addressFormLabel}>House Name / Building No</AutoText>
              <TextInput
                style={styles.addressFormInput}
                placeholder="Enter house name or building number"
                placeholderTextColor={theme.textSecondary}
                value={houseName}
                onChangeText={setHouseName}
                autoCapitalize="words"
                editable={true}
                underlineColorAndroid="transparent"
              />
            </View>

            <View style={styles.addressFormSection}>
              <AutoText style={styles.addressFormLabel}>Nearby Location / Landmark</AutoText>
              <TextInput
                style={styles.addressFormInput}
                placeholder="Enter nearby location or landmark"
                placeholderTextColor={theme.textSecondary}
                value={nearbyLocation}
                onChangeText={setNearbyLocation}
                autoCapitalize="words"
                editable={true}
                underlineColorAndroid="transparent"
              />
            </View>

            <View style={styles.addressFormSection}>
              <AutoText style={styles.addressFormLabel}>Address Type</AutoText>
              <View style={styles.addressTypeContainer}>
                {(['Home', 'Work', 'Other'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.addressTypeButton,
                      addressType === type && styles.addressTypeButtonActive,
                    ]}
                    onPress={() => setAddressType(type)}
                  >
                    <AutoText
                      style={[
                        styles.addressTypeButtonText,
                        addressType === type && styles.addressTypeButtonTextActive,
                      ]}
                    >
                      {type}
                    </AutoText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {required && (
              <>
                <View style={styles.addressFormSection}>
                  <AutoText style={styles.addressFormLabel}>
                    Full Name <AutoText style={{ color: theme.error || '#FF0000' }}>*</AutoText>
                  </AutoText>
                  <TextInput
                    style={styles.addressFormInput}
                    placeholder="Enter your full name"
                    placeholderTextColor={theme.textSecondary}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    editable={true}
                    underlineColorAndroid="transparent"
                  />
                </View>

                <View style={styles.addressFormSection}>
                  <AutoText style={styles.addressFormLabel}>
                    Email Address <AutoText style={{ color: theme.error || '#FF0000' }}>*</AutoText>
                  </AutoText>
                  <TextInput
                    style={styles.addressFormInput}
                    placeholder="Enter your email address"
                    placeholderTextColor={theme.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={true}
                    underlineColorAndroid="transparent"
                  />
                </View>
              </>
            )}

            <View style={styles.addressFormActions}>
              {!required && (
                <TouchableOpacity
                  style={[styles.addressFormButton, styles.addressFormButtonCancel]}
                  onPress={handleClose}
                  disabled={savingAddress}
                >
                  <AutoText style={styles.addressFormButtonCancelText}>Cancel</AutoText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.addressFormButton,
                  styles.addressFormButtonSave,
                  required && styles.addressFormButtonSaveFullWidth,
                ]}
                onPress={handleSaveAddress}
                disabled={savingAddress}
              >
                {savingAddress ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AutoText style={styles.addressFormButtonSaveText}>
                    {required ? 'Save & Continue' : 'Save Address'}
                  </AutoText>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
};

const getStyles = (theme: any, themeName?: string) =>
  ScaledSheet.create({
    locationHistoryModal: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
    },
    locationHistoryModalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    locationHistoryModalContent: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
      height: '100%',
      backgroundColor: theme.background,
      borderTopLeftRadius: '20@ms',
      borderTopRightRadius: '20@ms',
      overflow: 'hidden',
      // Safe area padding will be applied via inline style
    },
    locationHistoryModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16@s',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: themeName === 'whitePurple' ? '#FFFFFF' : theme.card,
    },
    locationHistoryModalTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '18@s',
      color: theme.textPrimary,
    },
    locationHistoryModalClose: {
      padding: '4@s',
    },
    body: {
      flex: 1,
      position: 'relative',
    },
    mapWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1,
    },
    locationHistoryMapContainer: {
      flex: 1,
      position: 'relative',
      backgroundColor: theme.background,
    },
    locationHistoryMap: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    addressFormContainer: {
      flex: 1,
      zIndex: 10,
      backgroundColor: theme.background,
      position: 'relative',
    },
    addressFormContent: {
      padding: '16@s',
      paddingBottom: '32@vs',
    },
    addressFormSection: {
      marginBottom: '20@vs',
    },
    addressFormLabel: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '8@vs',
    },
    addressDisplayContainer: {
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '12@s',
      borderWidth: 1,
      borderColor: theme.border,
    },
    addressDisplayText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
      lineHeight: '20@vs',
    },
    addressFormInput: {
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '12@s',
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
      borderWidth: 1,
      borderColor: theme.border,
      minHeight: '48@vs',
      height: '48@vs',
    },
    addressTypeContainer: {
      flexDirection: 'row',
      gap: '12@s',
    },
    addressTypeButton: {
      flex: 1,
      paddingVertical: '12@vs',
      paddingHorizontal: '16@s',
      borderRadius: '12@ms',
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addressTypeButtonActive: {
      borderColor: theme.primary,
      backgroundColor: theme.primary + '20',
    },
    addressTypeButtonText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    addressTypeButtonTextActive: {
      fontFamily: 'Poppins-SemiBold',
      color: theme.primary,
    },
    addressFormActions: {
      flexDirection: 'row',
      gap: '12@s',
      marginTop: '24@vs',
    },
    addressFormButton: {
      flex: 1,
      paddingVertical: '14@vs',
      borderRadius: '12@ms',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addressFormButtonCancel: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    addressFormButtonCancelText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.textPrimary,
    },
    addressFormButtonSave: {
      backgroundColor: theme.primary,
    },
    addressFormButtonSaveFullWidth: {
      flex: 1,
    },
    addressFormButtonSaveText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: '#FFFFFF',
    },
    errorText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      marginTop: '4@vs',
    },
    mapSkipButtonContainer: {
      position: 'absolute',
      bottom: '20@vs',
      left: '16@s',
      right: '16@s',
      alignItems: 'center',
      zIndex: 10,
    },
    mapSkipButton: {
      backgroundColor: theme.primary,
      paddingVertical: '12@vs',
      paddingHorizontal: '24@s',
      borderRadius: '12@ms',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    mapSkipButtonDisabled: {
      backgroundColor: theme.textSecondary + '80', // Semi-transparent to indicate disabled state
      opacity: 0.6,
    },
    mapSkipButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: '#FFFFFF',
    },
    mapSkipButtonTextDisabled: {
      color: theme.textSecondary,
      opacity: 0.7,
    },
  });

