import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from './ThemeProvider';
import { AutoText } from './AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { LocationHistoryMap } from './LocationHistoryMap';
import { getAddressFromCoordinates } from './NativeMapView';
import { saveLocationToCache } from '../../services/location/locationCacheService';
import { NativeModules } from 'react-native';
import { saveAddress, SaveAddressData } from '../services/api/v2/address';

const { NativeMapViewModule } = NativeModules;

interface AddAddressModalProps {
  visible: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
  userData: any;
  themeName?: string;
}

export const AddAddressModal: React.FC<AddAddressModalProps> = ({
  visible,
  onClose,
  onSaveSuccess,
  userData,
  themeName,
}) => {
  const { theme } = useTheme();
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>('Shop No 15, Katraj');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const locationFetchedRef = useRef(false);
  const [houseName, setHouseName] = useState('');
  const [nearbyLocation, setNearbyLocation] = useState('');
  const [addressType, setAddressType] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [savingAddress, setSavingAddress] = useState(false);
  const locationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setShowAddressForm(false);
      locationFetchedRef.current = false;
      setHouseName('');
      setNearbyLocation('');
      setAddressType('Home');
      setCurrentAddress('Shop No 15, Katraj');
      setCurrentLocation(null);
      if (locationTimeoutRef.current) {
        clearTimeout(locationTimeoutRef.current);
        locationTimeoutRef.current = null;
      }
    }
  }, [visible]);

  const handleClose = () => {
    setShowAddressForm(false);
    locationFetchedRef.current = false;
    setHouseName('');
    setNearbyLocation('');
    setAddressType('Home');
    setCurrentAddress('Shop No 15, Katraj');
    setCurrentLocation(null);
    if (locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
      locationTimeoutRef.current = null;
    }
    onClose();
  };

  const handleSkipToForm = () => {
    if (locationTimeoutRef.current) {
      clearTimeout(locationTimeoutRef.current);
      locationTimeoutRef.current = null;
    }
    setShowAddressForm(true);
  };

  const handleSaveAddress = async () => {
    if (!userData?.id) {
      Alert.alert('Error', 'User not found. Please login again.');
      return;
    }
    if (!currentLocation) {
      Alert.alert('Error', 'Location not found. Please try again.');
      return;
    }

    setSavingAddress(true);
    try {
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
      <TouchableOpacity
        style={styles.locationHistoryModalBackdrop}
        activeOpacity={1}
        onPress={handleClose}
      />
      <View style={styles.locationHistoryModalContent}>
        <View style={styles.locationHistoryModalHeader}>
          <TouchableOpacity onPress={handleClose}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={theme.textPrimary}
            />
          </TouchableOpacity>
          <AutoText style={styles.locationHistoryModalTitle}>Add Address</AutoText>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.locationHistoryModalClose}
          >
            <MaterialCommunityIcons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.body}>
          {!showAddressForm && (
            <View style={styles.mapWrapper}>
              <LocationHistoryMap
                key="map"
                style={styles.locationHistoryMap}
                onMapReady={async () => {
                  console.log('🗺️ Location history map ready in modal');
                
                // Set a timeout fallback to show form after 10 seconds if location fetch fails
                locationTimeoutRef.current = setTimeout(() => {
                  if (!showAddressForm) {
                    console.log('⏰ Location fetch timeout - showing form anyway');
                    setShowAddressForm(true);
                  }
                }, 10000);

                // Fetch location only after map is loaded (native module handles loading UI)
                if (!locationFetchedRef.current) {
                  locationFetchedRef.current = true;
                  try {
                    if (Platform.OS === 'android' && NativeMapViewModule) {
                      const location = await NativeMapViewModule.getCurrentLocation();
                      if (location) {
                        setCurrentLocation({
                          latitude: location.latitude,
                          longitude: location.longitude
                        });
                        
                        // Get address from coordinates
                        try {
                          const address = await getAddressFromCoordinates(location.latitude, location.longitude);
                          const addressText = address.address || address.formattedAddress || 'Shop No 15, Katraj';
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
                          
                          // Clear timeout since we got location successfully
                          if (locationTimeoutRef.current) {
                            clearTimeout(locationTimeoutRef.current);
                            locationTimeoutRef.current = null;
                          }
                          
                          // Close map and show address form after successful location fetch
                          setTimeout(() => {
                            setShowAddressForm(true);
                          }, 500); // Small delay to ensure map is ready
                        } catch (error) {
                          console.warn('Failed to get address:', error);
                          // Keep default address if lookup fails
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
                          
                          // Clear timeout since we got location successfully
                          if (locationTimeoutRef.current) {
                            clearTimeout(locationTimeoutRef.current);
                            locationTimeoutRef.current = null;
                          }
                          
                          // Still show form even if address lookup fails
                          setTimeout(() => {
                            setShowAddressForm(true);
                          }, 500);
                        }
                      } else {
                        // No location received, show form after timeout
                        console.log('⚠️ No location received from native module');
                      }
                    } else {
                      // Not Android or module not available, show form after timeout
                      console.log('⚠️ Location fetch not available on this platform');
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
                  const φ1 = currentLocation.latitude * Math.PI / 180;
                  const φ2 = location.latitude * Math.PI / 180;
                  const Δφ = (location.latitude - currentLocation.latitude) * Math.PI / 180;
                  const Δλ = (location.longitude - currentLocation.longitude) * Math.PI / 180;
                  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                            Math.cos(φ1) * Math.cos(φ2) *
                            Math.sin(Δλ/2) * Math.sin(Δλ/2);
                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                  const distance = R * c;
                  
                  // Only update if moved more than 50 meters
                  if (distance < 50) {
                    return;
                  }
                }
                
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
              }}
              />
              <View style={styles.mapSkipButtonContainer}>
                <TouchableOpacity
                  style={styles.mapSkipButton}
                  onPress={handleSkipToForm}
                  activeOpacity={0.8}
                >
                  <AutoText style={styles.mapSkipButtonText}>Continue</AutoText>
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

            <View style={styles.addressFormActions}>
              <TouchableOpacity
                style={[styles.addressFormButton, styles.addressFormButtonCancel]}
                onPress={handleClose}
                disabled={savingAddress}
              >
                <AutoText style={styles.addressFormButtonCancelText}>Cancel</AutoText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addressFormButton, styles.addressFormButtonSave]}
                onPress={handleSaveAddress}
                disabled={savingAddress}
              >
                {savingAddress ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AutoText style={styles.addressFormButtonSaveText}>Save Address</AutoText>
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
    addressFormButtonSaveText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: '#FFFFFF',
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
    mapSkipButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: '#FFFFFF',
    },
  });

