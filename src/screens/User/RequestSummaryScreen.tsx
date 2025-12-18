import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { Calendar } from 'react-native-calendars';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTabBar } from '../../context/TabBarContext';
import { CategoryWithSubcategories, Subcategory } from '../../services/api/v2/categories';
import { useCategoriesWithSubcategories } from '../../hooks/useCategories';
import type { UserRootStackParamList } from '../../navigation/UserTabNavigator';
import { getUserData } from '../../services/auth/authService';
import { useProfile, useUpdateProfile } from '../../hooks/useProfile';

interface UploadedImage {
  uri: string;
  type?: string;
  fileName?: string;
}

const RequestSummaryScreen = () => {
  const { theme, isDark, themeName } = useTheme();
  const { setTabBarVisible } = useTabBar();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = route.params as UserRootStackParamList['RequestSummary'];
  
  const selectedMaterialIds = routeParams?.selectedMaterials || [];
  const [uploadedImages] = useState<UploadedImage[]>(routeParams?.uploadedImages || []);
  const [note] = useState(routeParams?.note || '');
  const [pickupLocation] = useState(routeParams?.pickupLocation || 'Your Location');
  const [pickupAddress] = useState(routeParams?.pickupAddress || 'Shop No 15, Katraj, Bengaluru');
  
  // Get today's date as default
  const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return {
      dayName,
      fullDate: `${dayName}, ${day} ${month} ${year}`,
    };
  };

  const [selectedDate, setSelectedDate] = useState<string>(
    routeParams?.pickupDate ? 
      (() => {
        // If pickupDate is provided as a formatted string, try to parse it
        // Otherwise use today
        try {
          const date = new Date(routeParams.pickupDate);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        } catch (e) {
          // If parsing fails, use today
        }
        return getTodayDateString();
      })() 
      : getTodayDateString()
  );
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>(
    (routeParams as any)?.pickupTimeSlot || '9:00 AM - 12:00 PM'
  );
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showTimeSlotSelection, setShowTimeSlotSelection] = useState(false);
  const [showNameEmailModal, setShowNameEmailModal] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailError, setEmailError] = useState('');
  const [userData, setUserData] = useState<any>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  
  // Available time slots
  const timeSlots = [
    '9:00 AM - 12:00 PM',
    '12:00 PM - 3:00 PM',
    '3:00 PM - 6:00 PM',
    '6:00 PM - 9:00 PM',
  ];
  
  const formattedDate = useMemo(() => formatDate(selectedDate), [selectedDate]);
  
  // Load user data
  useEffect(() => {
    const loadUserData = async () => {
      const data = await getUserData();
      setUserData(data);
    };
    loadUserData();
  }, []);

  // Get user profile
  const { data: profile } = useProfile(userData?.id, !!userData?.id);
  const updateProfileMutation = useUpdateProfile(userData?.id || 0);

  // Initialize name, email, and phone from profile or user data
  useEffect(() => {
    if (profile) {
      const profileName = profile.name || '';
      const profileEmail = profile.email || '';
      const profilePhone = profile.phone || userData?.phone_number || '';
      
      setName(profileName);
      setEmail(profileEmail);
      setPhoneNumber(profilePhone);
    } else if (userData) {
      // Fallback to userData if profile not loaded yet
      const userPhone = userData.phone_number || '';
      setName(userData.name || '');
      setEmail(userData.email || '');
      setPhoneNumber(userPhone);
    }
  }, [profile, userData]);

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle schedule pickup button click - directly show calendar
  const handleSchedulePickup = () => {
    setShowCalendarModal(true);
  };

  // Handle time slot selection - show name/email modal after selection
  const handleTimeSlotSelect = (slot: string) => {
    setSelectedTimeSlot(slot);
    setShowTimeSlotSelection(false);
    // Show name/email modal after time slot is selected
    setShowNameEmailModal(true);
  };

  // Handle save profile and complete scheduling
  const handleSaveProfileAndSchedule = async () => {
    // Validate email
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }
    
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setEmailError('');
    setSavingProfile(true);

    try {
      // Prepare update data
      const updateData: any = {};
      if (name.trim()) {
        updateData.name = name.trim();
      }
      if (email.trim()) {
        updateData.email = email.trim();
      }

      // Save to profile - only name and email
      if (userData?.id && Object.keys(updateData).length > 0) {
        await updateProfileMutation.mutateAsync(updateData);
        // Update local state with saved values
        if (updateData.name) {
          setName(updateData.name);
        }
        if (updateData.email) {
          setEmail(updateData.email);
        }
      }

      // Close modal - profile saved
      setShowNameEmailModal(false);
      Alert.alert('Success', 'Contact information saved successfully!');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to save profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };
  
  // Use the hook with incremental updates - same as UserDashboardScreen
  // This hook automatically:
  // 1. Checks AsyncStorage cache (365-day persistence)
  // 2. Calls /api/v2/categories/incremental-updates with lastUpdatedOn
  // 3. Merges updates (images, prices, new categories/subcategories) with cached data
  // 4. Saves updated cache back to AsyncStorage
  // Only fetch if there are selected materials
  const { data: categoriesWithSubcategoriesData, isLoading: loadingMaterials } = useCategoriesWithSubcategories(undefined, selectedMaterialIds.length > 0);

  // Extract all subcategories from all categories
  const allSubcategories: Subcategory[] = useMemo(() => {
    const categories: CategoryWithSubcategories[] = categoriesWithSubcategoriesData?.data || [];
    const flattened: Subcategory[] = [];
    
    categories.forEach(category => {
      if (category.subcategories && category.subcategories.length > 0) {
        const subcategoriesWithCategory = category.subcategories.map(sub => ({
          ...sub,
          main_category_id: category.id,
          main_category: {
            id: category.id,
            name: category.name,
            image: category.image,
          },
        }));
        flattened.push(...subcategoriesWithCategory);
      }
    });
    
    return flattened;
  }, [categoriesWithSubcategoriesData]);

  // Filter to get only selected materials
  const selectedMaterials = useMemo(() => {
    if (allSubcategories.length === 0 || selectedMaterialIds.length === 0) {
      return [];
    }
    return allSubcategories.filter((sub: Subcategory) => 
      selectedMaterialIds.includes(sub.id)
    );
  }, [allSubcategories, selectedMaterialIds]);
  
  // Expected kg for each material
  const [expectedKg, setExpectedKg] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    selectedMaterialIds.forEach((id) => {
      initial[id] = 1; // Default to 1 kg
    });
    return initial;
  });
  
  // Update expectedKg when selectedMaterials change
  useEffect(() => {
    const updated: Record<number, number> = { ...expectedKg };
    selectedMaterials.forEach((material: Subcategory) => {
      if (!(material.id in updated)) {
        updated[material.id] = 1;
      }
    });
    setExpectedKg(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMaterials]);
  
  const handleIncrement = (materialId: number) => {
    setExpectedKg(prev => ({
      ...prev,
      [materialId]: (prev[materialId] || 0) + 1,
    }));
  };
  
  const handleDecrement = (materialId: number) => {
    setExpectedKg(prev => ({
      ...prev,
      [materialId]: Math.max(0, (prev[materialId] || 0) - 1),
    }));
  };
  
  // Calculate expected total receiving
  const expectedTotalReceiving = useMemo(() => {
    return selectedMaterials.reduce((total, material: Subcategory) => {
      const weight = expectedKg[material.id] || 0;
      const price = parseFloat(material.default_price?.toString() || '0');
      return total + (weight * price);
    }, 0);
  }, [selectedMaterials, expectedKg]);
  
  const styles = useMemo(() => getStyles(theme, themeName, isDark), [theme, themeName, isDark]);

  useFocusEffect(
    React.useCallback(() => {
      setTabBarVisible(false);
      return () => {
        setTabBarVisible(true);
      };
    }, [setTabBarVisible])
  );




  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? theme.background : '#FFFFFF'}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <AutoText style={styles.headerTitle} numberOfLines={1}>
          Review Request
        </AutoText>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Selected Materials Section */}
        <View style={styles.section}>
          <AutoText style={styles.sectionTitleSmall}>Selected Materials</AutoText>
          {loadingMaterials ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
              <AutoText style={styles.loadingText}>Loading materials...</AutoText>
            </View>
          ) : selectedMaterials.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.materialsScroll}>
              {selectedMaterials.map((material: Subcategory) => (
                <View key={material.id} style={styles.materialCard}>
                  {material.image ? (
                    <Image source={{ uri: material.image }} style={styles.materialImage} />
                  ) : (
                    <View style={styles.materialImagePlaceholder}>
                      <MaterialCommunityIcons name="package-variant" size={24} color={theme.textSecondary} />
                    </View>
                  )}
                  <AutoText style={styles.materialName} numberOfLines={1}>
                    {material.name || 'Material'}
                  </AutoText>
                  <AutoText style={styles.materialPrice}>
                    ₹{material.default_price || 0}/{material.price_unit || 'kg'}
                  </AutoText>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyMaterialsContainer}>
              <MaterialCommunityIcons name="package-variant" size={48} color={theme.textSecondary} />
              <AutoText style={styles.emptyMaterialsText}>No materials selected</AutoText>
            </View>
          )}
        </View>

        {/* Uploaded Images Section */}
        {uploadedImages.length > 0 && (
          <View style={styles.section}>
            <AutoText style={styles.sectionTitleSmall}>Uploaded Images</AutoText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesScroll}>
              {uploadedImages.map((image, index) => (
                <View key={index} style={styles.imageCard}>
                  <Image source={{ uri: image.uri }} style={styles.uploadedImageThumbnail} />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Note Section */}
        {note && (
          <View style={styles.section}>
            <AutoText style={styles.sectionTitle}>Additional Notes</AutoText>
            <View style={styles.noteCard}>
              <MaterialCommunityIcons name="note-text-outline" size={20} color={theme.primary} />
              <AutoText style={styles.noteText}>{note}</AutoText>
            </View>
          </View>
        )}

        {/* Pickup Location & Details Section */}
        <View style={styles.section}>
          <AutoText style={styles.sectionLabel}>Pickup Location & Details</AutoText>
          <TouchableOpacity style={styles.locationCard} activeOpacity={0.7}>
            <View style={styles.locationTopRow}>
            <MaterialCommunityIcons name="map-marker" size={24} color={theme.primary} />
              <AutoText style={styles.locationAddress} numberOfLines={1}>{pickupAddress}</AutoText>
            <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textSecondary} />
            </View>
            {(name.trim() || phoneNumber.trim() || email.trim()) && (
              <View style={styles.locationDetailsContainer}>
                {(name.trim() || phoneNumber.trim()) && (
                  <View style={styles.detailRow}>
                    <MaterialCommunityIcons name="account" size={24} color={theme.primary} />
                    <AutoText style={styles.detailText}>
                      {name.trim() ? `${name.trim()}${phoneNumber.trim() ? ` • ${phoneNumber.trim()}` : ''}` : phoneNumber.trim()}
                    </AutoText>
                  </View>
                )}
                {email.trim() && (
                  <View style={styles.detailRow}>
                    <MaterialCommunityIcons name="email" size={24} color={theme.primary} />
                    <AutoText style={styles.detailText}>{email}</AutoText>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Expected Weight Section */}
        {selectedMaterials.length > 0 && (
          <View style={styles.section}>
            <AutoText style={styles.sectionLabel}>Expected Weight (kg)</AutoText>
            <View style={styles.expectedWeightContainer}>
              {selectedMaterials.map((material: Subcategory) => (
                <View key={material.id} style={styles.expectedWeightCard}>
                  <View style={styles.expectedWeightRow}>
                    {/* Material Info */}
                    <View style={styles.expectedWeightInfo}>
                      {material.image ? (
                        <Image source={{ uri: material.image }} style={styles.expectedWeightImage} />
                      ) : (
                        <View style={styles.expectedWeightImagePlaceholder}>
                          <MaterialCommunityIcons name="package-variant" size={16} color={theme.textSecondary} />
                        </View>
                      )}
                      <View style={styles.expectedWeightTextContainer}>
                        <AutoText style={styles.expectedWeightMaterialName} numberOfLines={1}>
                          {material.name || 'Material'}
                        </AutoText>
                        <AutoText style={styles.expectedWeightPrice}>
                          ₹{material.default_price || 0}/{material.price_unit || 'kg'}
                        </AutoText>
                      </View>
                    </View>
                    
                    {/* Increment/Decrement Controls */}
                    <View style={styles.expectedWeightControls}>
                      <TouchableOpacity
                        style={[styles.expectedWeightButton, styles.decrementButton]}
                        onPress={() => handleDecrement(material.id)}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name="minus" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                      <View style={styles.expectedWeightValue}>
                        <AutoText style={styles.expectedWeightValueText}>
                          {expectedKg[material.id] || 0}
                        </AutoText>
                        <AutoText style={styles.expectedWeightUnit}>kg</AutoText>
                      </View>
                      <TouchableOpacity
                        style={[styles.expectedWeightButton, styles.incrementButton]}
                        onPress={() => handleIncrement(material.id)}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
            
            {/* Expected Total Receiving */}
            <View style={styles.expectedTotalCard}>
              <View style={styles.expectedTotalContent}>
                <View style={styles.expectedTotalIconContainer}>
                  <MaterialCommunityIcons name="currency-inr" size={18} color={theme.primary} />
                </View>
                <View style={styles.expectedTotalTextContainer}>
                  <AutoText style={styles.expectedTotalLabel}>Expected Total Receiving</AutoText>
                </View>
                <AutoText style={styles.expectedTotalAmount}>
                  ₹{expectedTotalReceiving.toFixed(2)}
                </AutoText>
              </View>
            </View>
            
            {/* Disclaimer Note */}
            <View style={styles.disclaimerCard}>
              <MaterialCommunityIcons name="information" size={24} color={theme.primary} />
              <View style={styles.disclaimerTextContainer}>
                <AutoText style={styles.disclaimerText} numberOfLines={0}>
                  Scrapmate and the pricing calculation of partners have no connection.{'\n'}
                  Final pricing will be determined by the partner during pickup based on actual weight and quality assessment.
                </AutoText>
              </View>
            </View>
          </View>
        )}

        {/* Pickup Date Section */}
        <View style={styles.section}>
          <AutoText style={styles.sectionLabel}>Scheduled Pickup</AutoText>
          <View style={styles.dateCard}>
            <View style={styles.dateContent}>
              <AutoText style={styles.dateDay}>{formattedDate.dayName}</AutoText>
              <AutoText style={styles.dateFull}>{formattedDate.fullDate}</AutoText>
              <AutoText style={styles.timeSlot}>{selectedTimeSlot}</AutoText>
            </View>
            <TouchableOpacity 
              style={styles.changeButton} 
              activeOpacity={0.7}
              onPress={() => setShowCalendarModal(true)}
            >
              <MaterialCommunityIcons name="calendar-clock" size={18} color="#FFFFFF" />
              <AutoText style={styles.changeButtonText}>Change</AutoText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Schedule Pickup Button */}
        <TouchableOpacity
          style={styles.schedulePickupButton}
          onPress={handleSchedulePickup}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="calendar-clock" size={22} color="#FFFFFF" />
          <AutoText style={styles.schedulePickupButtonText}>Schedule Pickup</AutoText>
        </TouchableOpacity>

        {/* Name and Email Modal */}
        <Modal
          visible={showNameEmailModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowNameEmailModal(false)}
        >
          <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={styles.nameEmailModalContent}>
              <View style={styles.nameEmailModalHeader}>
                <AutoText style={styles.nameEmailModalTitle}>Contact Information</AutoText>
                <TouchableOpacity
                  onPress={() => setShowNameEmailModal(false)}
                  style={styles.modalCloseButton}
                >
                  <MaterialCommunityIcons name="close" size={24} color={theme.textPrimary} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.nameEmailModalBody}>
                <View style={styles.inputContainer}>
                  <AutoText style={styles.inputLabel}>Name</AutoText>
                  <TextInput
                    style={[styles.textInput, emailError && styles.inputError]}
                    placeholder="Enter your name"
                    placeholderTextColor={theme.textSecondary}
                    value={name}
                    onChangeText={(text: string) => {
                      setName(text);
                      setEmailError('');
                    }}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <AutoText style={styles.inputLabel}>Email</AutoText>
                  <TextInput
                    style={[styles.textInput, emailError && styles.inputError]}
                    placeholder="Enter your email"
                    placeholderTextColor={theme.textSecondary}
                    value={email}
                    onChangeText={(text: string) => {
                      setEmail(text);
                      setEmailError('');
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {emailError ? (
                    <AutoText style={styles.errorText}>{emailError}</AutoText>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, savingProfile && styles.saveButtonDisabled]}
                  onPress={handleSaveProfileAndSchedule}
                  disabled={savingProfile}
                  activeOpacity={0.8}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <AutoText style={styles.saveButtonText}>Save & Continue</AutoText>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Calendar Modal */}
        <Modal
          visible={showCalendarModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowCalendarModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <AutoText style={styles.modalTitle}>
                  {showTimeSlotSelection ? 'Select Time Slot' : 'Select Pickup Date'}
                </AutoText>
                <TouchableOpacity
                  onPress={() => {
                    if (showTimeSlotSelection) {
                      setShowTimeSlotSelection(false);
                    } else {
                      setShowCalendarModal(false);
                    }
                  }}
                  style={styles.modalCloseButton}
                >
                  <MaterialCommunityIcons name="close" size={24} color={theme.textPrimary} />
                </TouchableOpacity>
              </View>
              
              {!showTimeSlotSelection ? (
                <>
                  <Calendar
                    current={selectedDate}
                    onDayPress={(day) => {
                      setSelectedDate(day.dateString);
                      setShowTimeSlotSelection(true);
                    }}
                    markedDates={{
                      [selectedDate]: {
                        selected: true,
                        selectedColor: theme.primary,
                        selectedTextColor: '#FFFFFF',
                      },
                    }}
                    minDate={getTodayDateString()}
                    theme={{
                      backgroundColor: theme.background,
                      calendarBackground: theme.card,
                      textSectionTitleColor: theme.textPrimary,
                      selectedDayBackgroundColor: theme.primary,
                      selectedDayTextColor: '#FFFFFF',
                      todayTextColor: theme.primary,
                      dayTextColor: theme.textPrimary,
                      textDisabledColor: theme.textSecondary,
                      dotColor: theme.primary,
                      selectedDotColor: '#FFFFFF',
                      arrowColor: theme.primary,
                      monthTextColor: theme.textPrimary,
                      indicatorColor: theme.primary,
                      textDayFontFamily: 'Poppins-Regular',
                      textMonthFontFamily: 'Poppins-SemiBold',
                      textDayHeaderFontFamily: 'Poppins-Medium',
                      textDayFontSize: 14,
                      textMonthFontSize: 16,
                      textDayHeaderFontSize: 12,
                    }}
                    style={styles.calendar}
                  />
                  <View style={styles.calendarFooter}>
                    <AutoText style={styles.calendarFooterText}>
                      Select a date to choose time slot
                    </AutoText>
                  </View>
                </>
              ) : (
                <ScrollView style={styles.timeSlotContainer} showsVerticalScrollIndicator={false}>
                  <AutoText style={styles.timeSlotTitle}>
                    Available Time Slots for {formattedDate.fullDate}
                  </AutoText>
                  <View style={styles.timeSlotsGrid}>
                    {timeSlots.map((slot, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.timeSlotButton,
                          selectedTimeSlot === slot && styles.timeSlotButtonSelected,
                        ]}
                        onPress={() => handleTimeSlotSelect(slot)}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons
                          name={selectedTimeSlot === slot ? 'clock-check' : 'clock-outline'}
                          size={20}
                          color={selectedTimeSlot === slot ? '#FFFFFF' : theme.primary}
                        />
                        <AutoText
                          style={[
                            styles.timeSlotButtonText,
                            selectedTimeSlot === slot && styles.timeSlotButtonTextSelected,
                          ]}
                        >
                          {slot}
                        </AutoText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Bottom Spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const getStyles = (theme: any, themeName?: string, isDark?: boolean) =>
  ScaledSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: '16@s',
      paddingVertical: '12@vs',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.card,
    },
    backButton: {
      width: '40@s',
      height: '40@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      fontFamily: 'Poppins-Bold',
      fontSize: '20@s',
      color: theme.textPrimary,
      textAlign: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: '16@s',
      paddingTop: '20@vs',
      paddingBottom: '24@vs',
    },
    section: {
      marginBottom: '20@vs',
    },
    sectionTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '18@s',
      color: theme.textPrimary,
      marginBottom: '12@vs',
    },
    sectionTitleSmall: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: theme.textPrimary,
      marginBottom: '8@vs',
    },
    sectionLabel: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.textSecondary,
      marginBottom: '8@vs',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '6@s',
      marginBottom: '8@vs',
    },
    materialsScroll: {
      marginHorizontal: '-16@s',
      paddingHorizontal: '16@s',
    },
    materialCard: {
      width: '90@s',
      marginRight: '10@s',
      backgroundColor: theme.card,
      borderRadius: '10@ms',
      padding: '8@s',
      alignItems: 'center',
    },
    materialImage: {
      width: '70@s',
      height: '70@vs',
      borderRadius: '6@ms',
      marginBottom: '6@vs',
    },
    materialImagePlaceholder: {
      width: '70@s',
      height: '70@vs',
      borderRadius: '6@ms',
      backgroundColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '6@vs',
    },
    materialName: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: theme.textPrimary,
      marginBottom: '3@vs',
    },
    materialPrice: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.primary,
    },
    addMaterialCard: {
      width: '120@s',
      height: '140@vs',
      marginRight: '12@s',
      borderWidth: 2,
      borderColor: theme.border,
      borderStyle: 'dashed',
      borderRadius: '12@ms',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
    },
    addMaterialText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      marginTop: '8@vs',
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20@vs',
      gap: '12@s',
    },
    loadingText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    emptyMaterialsContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40@vs',
    },
    emptyMaterialsText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
      marginTop: '12@vs',
    },
    imagesScroll: {
      marginHorizontal: '-16@s',
      paddingHorizontal: '16@s',
    },
    imageCard: {
      width: '80@s',
      height: '80@vs',
      marginRight: '10@s',
      borderRadius: '10@ms',
      overflow: 'hidden',
    },
    uploadedImageThumbnail: {
      width: '100%',
      height: '100%',
    },
    noteCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      gap: '12@s',
    },
    noteText: {
      flex: 1,
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
      lineHeight: '20@vs',
    },
    locationCard: {
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
    },
    locationTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '12@s',
    },
    locationAddress: {
      flex: 1,
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
    },
    locationDetailsContainer: {
      marginTop: '12@vs',
      gap: '8@vs',
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '12@s',
    },
    detailText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
      flex: 1,
    },
    dateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.accent || `${theme.primary}15`,
      borderRadius: '12@ms',
      padding: '16@s',
    },
    dateContent: {
      flex: 1,
    },
    dateDay: {
      fontFamily: 'Poppins-Bold',
      fontSize: '16@s',
      color: theme.textPrimary,
      marginBottom: '4@vs',
    },
    dateFull: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
      marginBottom: '4@vs',
    },
    timeSlot: {
      fontFamily: 'Poppins-Medium',
      fontSize: '13@s',
      color: '#FFFFFF',
      marginTop: '2@vs',
    },
    changeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '4@s',
      paddingHorizontal: '12@s',
      paddingVertical: '6@vs',
      backgroundColor: theme.primary,
      borderRadius: '8@ms',
    },
    changeButtonText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: '#FFFFFF',
    },
    expectedWeightContainer: {
      gap: '12@vs',
    },
    expectedWeightCard: {
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '12@s',
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: '10@vs',
    },
    expectedWeightRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12@s',
    },
    expectedWeightInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: '10@s',
    },
    expectedWeightImage: {
      width: '40@s',
      height: '40@vs',
      borderRadius: '8@ms',
    },
    expectedWeightImagePlaceholder: {
      width: '40@s',
      height: '40@vs',
      borderRadius: '8@ms',
      backgroundColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    expectedWeightTextContainer: {
      flex: 1,
    },
    expectedWeightMaterialName: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '2@vs',
    },
    expectedWeightPrice: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.primary,
    },
    expectedWeightControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '8@s',
    },
    expectedWeightButton: {
      width: '32@s',
      height: '32@vs',
      borderRadius: '6@ms',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    incrementButton: {
      backgroundColor: theme.primary,
    },
    decrementButton: {
      backgroundColor: theme.textSecondary,
    },
    expectedWeightValue: {
      minWidth: '50@s',
      alignItems: 'center',
      justifyContent: 'center',
    },
    expectedWeightValueText: {
      fontFamily: 'Poppins-Bold',
      fontSize: '16@s',
      color: theme.textPrimary,
    },
    expectedWeightUnit: {
      fontFamily: 'Poppins-Regular',
      fontSize: '10@s',
      color: theme.textSecondary,
      marginTop: '1@vs',
    },
    expectedTotalCard: {
      backgroundColor: theme.card,
      borderRadius: '10@ms',
      padding: '12@s',
      marginTop: '10@vs',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    expectedTotalContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10@s',
    },
    expectedTotalIconContainer: {
      width: '32@s',
      height: '32@vs',
      borderRadius: '8@ms',
      backgroundColor: theme.accent || `${theme.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    expectedTotalTextContainer: {
      flex: 1,
    },
    expectedTotalLabel: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
    },
    expectedTotalAmount: {
      fontFamily: 'Poppins-Bold',
      fontSize: '18@s',
      color: theme.primary,
      letterSpacing: 0.5,
    },
    disclaimerCard: {
      flexDirection: 'row',
      backgroundColor: theme.accent || `${theme.primary}15`,
      borderRadius: '12@ms',
      padding: '16@s',
      marginTop: '16@vs',
      marginBottom: '12@vs',
      alignItems: 'flex-start',
    },
    disclaimerTextContainer: {
      flex: 1,
      marginLeft: '12@s',
    },
    disclaimerText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textPrimary,
      lineHeight: '18@vs',
      flexWrap: 'wrap',
      flexShrink: 1,
    },
    schedulePickupButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10@s',
      backgroundColor: theme.primary,
      borderRadius: '12@ms',
      paddingVertical: '16@vs',
      paddingHorizontal: '24@s',
      marginBottom: '20@vs',
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    schedulePickupButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: '#FFFFFF',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.card,
      borderTopLeftRadius: '20@ms',
      borderTopRightRadius: '20@ms',
      paddingTop: '20@vs',
      paddingBottom: '40@vs',
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: '20@s',
      paddingBottom: '16@vs',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '18@s',
      color: theme.textPrimary,
    },
    modalCloseButton: {
      width: '32@s',
      height: '32@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    calendar: {
      borderRadius: '12@ms',
      marginHorizontal: '16@s',
      marginTop: '16@vs',
    },
    calendarFooter: {
      paddingHorizontal: '16@s',
      paddingTop: '12@vs',
      paddingBottom: '8@vs',
      alignItems: 'center',
    },
    calendarFooterText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
    },
    timeSlotContainer: {
      maxHeight: '400@vs',
      paddingHorizontal: '16@s',
      paddingTop: '16@vs',
    },
    timeSlotTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: theme.textPrimary,
      marginBottom: '16@vs',
      textAlign: 'center',
    },
    timeSlotsGrid: {
      gap: '12@vs',
      paddingBottom: '20@vs',
    },
    timeSlotButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8@s',
      paddingVertical: '14@vs',
      paddingHorizontal: '16@s',
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      borderWidth: 2,
      borderColor: theme.border,
    },
    timeSlotButtonSelected: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    timeSlotButtonText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
    },
    timeSlotButtonTextSelected: {
      color: '#FFFFFF',
    },
    nameEmailModalContent: {
      backgroundColor: theme.card,
      borderRadius: '20@ms',
      padding: '24@s',
      width: '90%',
      maxWidth: '400@s',
      maxHeight: '80%',
      alignSelf: 'center',
      marginTop: 'auto',
      marginBottom: 'auto',
    },
    nameEmailModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '24@vs',
    },
    nameEmailModalTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '20@s',
      color: theme.textPrimary,
    },
    nameEmailModalBody: {
      gap: '20@vs',
    },
    inputContainer: {
      marginBottom: '16@vs',
    },
    inputLabel: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '8@vs',
    },
    textInput: {
      backgroundColor: theme.background,
      borderRadius: '12@ms',
      padding: '14@s',
      borderWidth: 1,
      borderColor: theme.border,
      fontFamily: 'Poppins-Regular',
      fontSize: '15@s',
      color: theme.textPrimary,
    },
    inputError: {
      borderColor: '#EF5350',
    },
    errorText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: '#EF5350',
      marginTop: '4@vs',
    },
    saveButton: {
      backgroundColor: theme.primary,
      borderRadius: '12@ms',
      paddingVertical: '16@vs',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: '8@vs',
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: '#FFFFFF',
    },
  });

export default RequestSummaryScreen;
