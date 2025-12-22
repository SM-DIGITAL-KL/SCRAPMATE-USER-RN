import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  ActivityIndicator,
  Image,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary, ImagePickerResponse, MediaType } from 'react-native-image-picker';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTranslation } from 'react-i18next';
import { getUserData } from '../../services/auth/authService';
import { UpdateProfileData } from '../../services/api/v2/profile';
import { useProfile, useUpdateProfile, useUploadProfileImage } from '../../hooks/useProfile';
import { getCustomerAddresses, Address, deleteAddress } from '../../services/api/v2/address';
import { useFocusEffect } from '@react-navigation/native';
import { AddAddressModal } from '../../components/AddAddressModal';

const EditProfileScreen = ({ navigation }: any) => {
  const { theme, isDark, themeName } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const styles = useMemo(() => getStyles(theme, isDark, themeName), [theme, isDark, themeName]);

  const [userData, setUserData] = useState<any>(null);
  
  useEffect(() => {
    const loadUserData = async () => {
      const data = await getUserData();
      setUserData(data);
    };
    loadUserData();
  }, []);

  const { data: profile, isLoading: loading, refetch: refetchProfile } = useProfile(
    userData?.id,
    !!userData?.id
  );

  // Safety check: Remove vendor data if it exists for customer_app users
  const safeProfile = useMemo(() => {
    if (!profile) return profile;
    const appType = profile.app_type || 'vendor_app';
    if (appType !== 'vendor_app') {
      // Remove vendor-specific data
      const { shop, delivery, delivery_boy, ...rest } = profile;
      return rest;
    }
    return profile;
  }, [profile]);
  const updateProfileMutation = useUpdateProfile(userData?.id || 0);
  const uploadImageMutation = useUploadProfileImage(userData?.id || 0);
  
  const saving = updateProfileMutation.isPending;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [showAddAddressModal, setShowAddAddressModal] = useState(false);

  useEffect(() => {
    if (safeProfile) {
      setName(safeProfile.name || '');
      setEmail(safeProfile.email || '');
      setPhone(safeProfile.phone || '');
      setProfileImage(safeProfile.profile_image || null);
      
      // Only access shop/delivery data if app_type is vendor_app
      // Backend should not return this data for customer_app, but adding extra safety check
      const isVendorApp = (safeProfile.app_type || 'vendor_app') === 'vendor_app';
      if (isVendorApp && (safeProfile as any).shop) {
        const profileWithShop = safeProfile as any;
        if (profileWithShop.shop?.address) {
          setAddress(profileWithShop.shop.address);
        } else if (profileWithShop.delivery?.address) {
          setAddress(profileWithShop.delivery.address);
        } else {
          setAddress('');
        }
      } else {
        // For customer_app users, don't access vendor data
        setAddress('');
      }
    }
  }, [safeProfile]);

  // Function to load addresses
  const loadAddresses = React.useCallback(async () => {
    if (!userData?.id) return;
    
    setLoadingAddresses(true);
    try {
      const addresses = await getCustomerAddresses(userData.id);
      setSavedAddresses(addresses);
    } catch (error: any) {
      console.error('Error loading addresses:', error);
      // Don't show error alert - just log it, addresses might not exist yet
    } finally {
      setLoadingAddresses(false);
    }
  }, [userData?.id]);

  // Fetch saved addresses on screen focus
  useFocusEffect(
    React.useCallback(() => {
      loadAddresses();
    }, [loadAddresses])
  );

  // Listen for address updates from other screens (e.g., UserDashboardScreen)
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('addressesUpdated', () => {
      console.log('📍 Addresses updated event received, refreshing addresses list');
      loadAddresses();
    });

    return () => {
      subscription.remove();
    };
  }, [loadAddresses]);

  const handleDeleteAddress = async (addressId: number) => {
    Alert.alert(
      'Delete Address',
      'Are you sure you want to delete this address?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAddress(addressId);
              // Refresh addresses list from server to ensure consistency
              if (userData?.id) {
                const addresses = await getCustomerAddresses(userData.id);
                setSavedAddresses(addresses);
              } else {
                // Fallback: filter locally if userData is not available
                setSavedAddresses(prev => prev.filter(addr => addr.id !== addressId));
              }
              Alert.alert('Success', 'Address deleted successfully');
            } catch (error: any) {
              console.error('Error deleting address:', error);
              Alert.alert('Error', error.message || 'Failed to delete address');
            }
          },
        },
      ]
    );
  };

  const handleImagePicker = () => {
    const options = {
      mediaType: 'photo' as MediaType,
      quality: 0.8,
      maxWidth: 1920,
      maxHeight: 1920,
    };

    launchImageLibrary(options, async (response: ImagePickerResponse) => {
      if (response.didCancel) return;
      if (response.errorMessage) {
        Alert.alert('Error', response.errorMessage);
        return;
      }

      const asset = response.assets?.[0];
      if (!asset?.uri || !userData?.id) {
        return;
      }

      setUploadingImage(true);
      uploadImageMutation.mutate(asset.uri, {
        onSuccess: (result) => {
          setProfileImage(result.image_url);
          setUploadingImage(false);
          Alert.alert('Success', 'Profile image uploaded successfully');
        },
        onError: (error: any) => {
          console.error('Error uploading image:', error);
          setUploadingImage(false);
          Alert.alert('Error', error.message || 'Failed to upload profile image');
        },
      });
    });
  };


  const handleSave = async () => {
    if (!userData?.id || !profile) {
      Alert.alert('Error', 'User not found');
      return;
    }

    const updateData: UpdateProfileData = {
      name: name.trim() || undefined,
      email: email.trim() || undefined,
    };

    // For common users, store address in user data if needed
    if (address.trim()) {
      updateData.address = address.trim();
    }

    updateProfileMutation.mutate(updateData, {
      onSuccess: () => {
        if (userData?.id) {
          refetchProfile();
        }
        Alert.alert('Success', 'Profile updated successfully', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      },
      onError: (error: any) => {
        console.error('Error updating profile:', error);
        Alert.alert('Error', error.message || 'Failed to update profile');
      },
    });
  };

  if (loading || !safeProfile) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={isDark ? theme.background : '#FFFFFF'}
        />
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? theme.background : '#FFFFFF'}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <AutoText style={styles.headerTitle}>Edit Profile</AutoText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <AutoText style={styles.sectionTitle}>Profile Picture</AutoText>
          <View style={styles.imageContainer}>
            <TouchableOpacity
              style={styles.imagePicker}
              onPress={handleImagePicker}
              disabled={uploadingImage || saving}
              activeOpacity={0.7}
            >
              {uploadingImage ? (
                <ActivityIndicator size="large" color={theme.primary} />
              ) : profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profileImage} />
              ) : (
                <View style={styles.placeholderImage}>
                  <MaterialCommunityIcons name="camera" size={40} color={theme.textSecondary} />
                </View>
              )}
              <View style={styles.imageOverlay}>
                <MaterialCommunityIcons name="camera-plus" size={14} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <AutoText style={styles.imageHint}>Tap to change profile picture</AutoText>
          </View>
        </View>

        <View style={styles.section}>
          <AutoText style={styles.sectionTitle}>Personal Information</AutoText>

          <View style={styles.inputWrapper}>
            <AutoText style={styles.label}>Name</AutoText>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter your name"
              placeholderTextColor={theme.textSecondary}
              editable={!saving}
            />
          </View>

          <View style={styles.inputWrapper}>
            <AutoText style={styles.label}>Email</AutoText>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!saving}
            />
          </View>

          <View style={styles.inputWrapper}>
            <AutoText style={styles.label}>Phone</AutoText>
            <TextInput
              style={[styles.input, styles.disabledInput]}
              value={phone}
              placeholder="Phone number"
              placeholderTextColor={theme.textSecondary}
              editable={false}
            />
            <AutoText style={styles.disabledNote}>Phone number cannot be changed</AutoText>
          </View>

          <View style={styles.inputWrapper}>
            <View style={styles.addressHeader}>
              <AutoText style={styles.label}>Saved Addresses</AutoText>
              <TouchableOpacity
                onPress={() => {
                  setShowAddAddressModal(true);
                }}
                style={styles.addAddressButton}
              >
                <MaterialCommunityIcons name="plus-circle" size={20} color={theme.primary} />
                <AutoText style={styles.addAddressText}>Add Address</AutoText>
              </TouchableOpacity>
            </View>
            
            {loadingAddresses ? (
              <View style={styles.addressLoadingContainer}>
                <ActivityIndicator size="small" color={theme.primary} />
                <AutoText style={styles.addressLoadingText}>Loading addresses...</AutoText>
              </View>
            ) : savedAddresses.length === 0 ? (
              <View style={styles.noAddressContainer}>
                <MaterialCommunityIcons name="map-marker-off" size={32} color={theme.textSecondary} />
                <AutoText style={styles.noAddressText}>No saved addresses</AutoText>
                <AutoText style={styles.noAddressSubtext}>Add an address to get started</AutoText>
              </View>
            ) : (
              savedAddresses.map((addr) => (
                <View key={addr.id} style={styles.addressCard}>
                  <View style={styles.addressCardHeader}>
                    <View style={styles.addressTypeBadge}>
                      <MaterialCommunityIcons 
                        name={addr.addres_type === 'Home' ? 'home' : addr.addres_type === 'Work' ? 'briefcase' : 'map-marker'} 
                        size={16} 
                        color={theme.primary} 
                      />
                      <AutoText style={styles.addressTypeText}>{addr.addres_type}</AutoText>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteAddress(addr.id)}
                      style={styles.deleteAddressButton}
                    >
                      <MaterialCommunityIcons name="delete-outline" size={20} color="#FF4444" />
                    </TouchableOpacity>
                  </View>
                  <AutoText style={styles.addressCardText}>{addr.address}</AutoText>
                  {addr.building_no && (
                    <AutoText style={styles.addressCardSubtext}>Building: {addr.building_no}</AutoText>
                  )}
                  {addr.landmark && (
                    <AutoText style={styles.addressCardSubtext}>Landmark: {addr.landmark}</AutoText>
                  )}
                  {(addr.latitude && addr.longitude) && (
                    <AutoText style={styles.addressCardSubtext}>
                      Location: {addr.latitude.toFixed(6)}, {addr.longitude.toFixed(6)}
                    </AutoText>
                  )}
                </View>
              ))
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <AutoText style={styles.saveButtonText}>Save Changes</AutoText>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Add Address Modal */}
      <AddAddressModal
        visible={showAddAddressModal}
        onClose={() => setShowAddAddressModal(false)}
        onSaveSuccess={async () => {
          // Refresh addresses list after successful save
          if (userData?.id) {
            try {
              const addresses = await getCustomerAddresses(userData.id);
              setSavedAddresses(addresses);
            } catch (error: any) {
              console.error('Error refreshing addresses:', error);
            }
          }
          // Emit event to notify other screens (like UserDashboardScreen) that addresses have been updated
          DeviceEventEmitter.emit('addressesUpdated');
        }}
        userData={userData}
        themeName={themeName}
      />
    </View>
  );
};

const getStyles = (theme: any, isDark: boolean, themeName?: string) =>
  ScaledSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    loadingContainer: {
      justifyContent: 'center',
      alignItems: 'center',
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
      paddingHorizontal: '18@s',
      paddingTop: '18@vs',
      paddingBottom: '32@vs',
    },
    section: {
      backgroundColor: theme.card,
      borderRadius: '18@ms',
      padding: '18@s',
      marginBottom: '18@vs',
      borderWidth: 1,
      borderColor: theme.border,
    },
    sectionTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: theme.textPrimary,
      marginBottom: '18@vs',
    },
    inputWrapper: {
      marginBottom: '18@vs',
    },
    label: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '8@vs',
    },
    input: {
      height: '52@vs',
      borderWidth: 1,
      borderRadius: '12@ms',
      borderColor: theme.border,
      paddingHorizontal: '16@s',
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
      backgroundColor: theme.background,
    },
    textArea: {
      height: '100@vs',
      paddingTop: '14@vs',
      textAlignVertical: 'top',
    },
    disabledInput: {
      backgroundColor: theme.disabled,
      opacity: 0.6,
    },
    disabledNote: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.textSecondary,
      marginTop: '4@vs',
      fontStyle: 'italic',
    },
    saveButton: {
      backgroundColor: theme.primary,
      borderRadius: '12@ms',
      paddingVertical: '16@vs',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: '8@vs',
      marginBottom: '18@vs',
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: '#FFFFFF',
    },
    imageContainer: {
      alignItems: 'center',
      marginBottom: '18@vs',
    },
    imagePicker: {
      width: '120@s',
      height: '120@s',
      borderRadius: '60@s',
      backgroundColor: theme.background,
      borderWidth: 2,
      borderColor: theme.border,
      overflow: 'visible',
      justifyContent: 'center',
      alignItems: 'center',
    },
    profileImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
      borderRadius: '60@s',
    },
    placeholderImage: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.disabled,
      borderRadius: '60@s',
    },
    imageOverlay: {
      position: 'absolute',
      bottom: '-2@s',
      right: '-2@s',
      width: '30@s',
      height: '30@s',
      borderRadius: '20@s',
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: theme.card || theme.background,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    imageHint: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      marginTop: '8@vs',
      textAlign: 'center',
    },
    documentUploadButton: {
      width: '100%',
      minHeight: '120@vs',
      borderRadius: '12@ms',
      borderWidth: 2,
      borderColor: theme.border,
      borderStyle: 'dashed',
      backgroundColor: theme.background,
      overflow: 'hidden',
    },
    documentPreview: {
      width: '100%',
      height: '120@vs',
      position: 'relative',
    },
    documentOverlay: {
      position: 'absolute',
      top: '8@vs',
      right: '8@s',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderRadius: '12@ms',
      padding: '4@s',
    },
    documentPlaceholder: {
      width: '100%',
      height: '120@vs',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: '20@vs',
    },
    documentPlaceholderText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textSecondary,
      marginTop: '8@vs',
    },
    documentIconContainer: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.background,
    },
    documentFileName: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: theme.textPrimary,
      marginTop: '8@vs',
    },
    addressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '12@vs',
    },
    addAddressButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: '12@s',
      paddingVertical: '6@vs',
      borderRadius: '8@ms',
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    addAddressText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: theme.primary,
      marginLeft: '4@s',
    },
    addressLoadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: '20@vs',
    },
    addressLoadingText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
      marginLeft: '8@s',
    },
    noAddressContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: '32@vs',
      paddingHorizontal: '16@s',
    },
    noAddressText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginTop: '12@vs',
    },
    noAddressSubtext: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      marginTop: '4@vs',
    },
    addressCard: {
      backgroundColor: theme.background,
      borderRadius: '12@ms',
      padding: '14@s',
      marginBottom: '12@vs',
      borderWidth: 1,
      borderColor: theme.border,
    },
    addressCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8@vs',
    },
    addressTypeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: '10@s',
      paddingVertical: '4@vs',
      borderRadius: '6@ms',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    addressTypeText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '11@s',
      color: theme.primary,
      marginLeft: '4@s',
    },
    deleteAddressButton: {
      padding: '4@s',
    },
    addressCardText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '4@vs',
      lineHeight: '20@vs',
    },
    addressCardSubtext: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      marginTop: '2@vs',
    },
  });

export default EditProfileScreen;
