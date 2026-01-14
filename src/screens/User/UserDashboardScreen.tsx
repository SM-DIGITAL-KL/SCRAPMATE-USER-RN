import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  Dimensions,
  ActivityIndicator,
  Platform,
  Animated,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeProvider';
import { SectionCard } from '../../components/SectionCard';
import { GreenButton } from '../../components/GreenButton';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTranslation } from 'react-i18next';
import { useTabBar } from '../../context/TabBarContext';
import LinearGradient from 'react-native-linear-gradient';
import { getUserData } from '../../services/auth/authService';
import { CategoryWithSubcategories, Subcategory, refreshImageUrl } from '../../services/api/v2/categories';
import { useCategoriesWithSubcategories } from '../../hooks/useCategories';
import { queryClient } from '../../services/api/queryClient';
import { queryKeys } from '../../services/api/queryKeys';
import { getCachedCategories, saveCachedCategories } from '../../services/cache/categoriesCache';
import { AddAddressModal } from '../../components/AddAddressModal';
import { getMostRecentLocation } from '../../services/location/locationCacheService';
import { DeviceEventEmitter } from 'react-native';
import { getCustomerAddresses } from '../../services/api/v2/address';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRecyclingStats } from '../../hooks/useRecycling';
import { useMonthlyBreakdown } from '../../hooks/useEarnings';
import { FoodWasteEnquiryModal } from '../../components/FoodWasteEnquiryModal';
import { buildApiUrl, getApiHeaders } from '../../services/api/apiConfig';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Modern gradient color schemes
const categoryGradients = [
  ['#FF6B9D', '#C44569'], // Pink gradient
  ['#4FACFE', '#00F2FE'], // Blue gradient
  ['#43E97B', '#38F9D7'], // Green gradient
  ['#FA709A', '#FEE140'], // Sunset gradient
  ['#A8EDEA', '#FED6E3'], // Pastel gradient
  ['#FFD89B', '#19547B'], // Gold to blue
];

// Helper function to add opacity to hex color
const addOpacityToHex = (hex: string, opacity: number): string => {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  // Convert to RGB
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  // Return rgba
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const getCategoryGradient = (index: number): string[] => {
  return categoryGradients[index % categoryGradients.length];
};

const getCategoryIcon = (categoryName: string): string => {
  const name = categoryName.toLowerCase();
  if (name.includes('paper')) return 'file-document-outline';
  if (name.includes('plastic')) return 'bottle-soda-outline';
  if (name.includes('metal')) return 'wrench-outline';
  if (name.includes('e-waste') || name.includes('ewaste') || name.includes('electronic')) return 'monitor';
  if (name.includes('automobile') || name.includes('vehicle') || name.includes('auto')) return 'car';
  if (name.includes('glass')) return 'glass-wine';
  if (name.includes('wood')) return 'tree';
  if (name.includes('rubber')) return 'circle';
  if (name.includes('organic')) return 'sprout';
  return 'package-variant';
};

interface TrendingRate {
  id: string;
  name: string;
  price: string;
  trend?: 'up' | 'down' | 'stable';
  image?: any;
}

const UserDashboardScreen = () => {
  const { theme, isDark, themeName } = useTheme();
  const { setTabBarVisible } = useTabBar();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [userData, setUserData] = useState<any>(null);
  const [currentBanner, setCurrentBanner] = useState(0); // 0 for Women banner, 1 for Man banner
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [refetchingImages, setRefetchingImages] = useState<Set<number>>(new Set());
  const [imageVersions, setImageVersions] = useState<Map<number, number>>(new Map()); // Track image version for each category to force remount
  const checkedExpiredUrls = useRef<Set<number>>(new Set()); // Track categories that have been checked for expiration
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [showLocationHistory, setShowLocationHistory] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>('Shop No 15, Katraj');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const hasCheckedAddresses = useRef(false); // Track if we've checked for addresses to prevent multiple checks
  const [showFoodWasteEnquiryModal, setShowFoodWasteEnquiryModal] = useState(false);
  const [selectedKgPerWeek, setSelectedKgPerWeek] = useState<string>('');
  const [selectedTimings, setSelectedTimings] = useState<string[]>([]);
  const [isSubmittingEnquiry, setIsSubmittingEnquiry] = useState(false);
  const styles = useMemo(() => getStyles(theme, themeName, isDark), [theme, themeName, isDark]);

  // Debug modal visibility
  useEffect(() => {
    console.log('🔔 Food Waste Enquiry Modal visibility changed:', showFoodWasteEnquiryModal);
  }, [showFoodWasteEnquiryModal]);

  // Fetch all categories with subcategories using the hook with incremental updates
  // This hook:
  // 1. Checks AsyncStorage cache first (365-day persistence)
  // 2. Calls /api/v2/categories/incremental-updates with lastUpdatedOn timestamp
  // 3. Merges incremental updates (new images, prices, categories, subcategories) with cached data
  // 4. Saves updated cache back to AsyncStorage
  // 5. If cache is expired or missing, performs full fetch
  // This ensures data is always up-to-date when images or categories are updated
  const { 
    data: categoriesWithSubcategoriesData, 
    isLoading: loadingCategories, 
    error: categoriesError, 
    refetch: refetchCategories 
  } = useCategoriesWithSubcategories(undefined, true);

  // Memoize to prevent infinite loops - only recreate when data actually changes
  // Use a stable key based on category IDs and names to detect real changes
  const allCategoriesWithSubcategories: CategoryWithSubcategories[] = useMemo(() => {
    const data = categoriesWithSubcategoriesData?.data || [];
    // Reset checked expired URLs when categories data changes (new data loaded)
    checkedExpiredUrls.current.clear();
    // Console log all category images for debugging
    console.log('📸 [UserDashboard] All Categories with Images:');
    data.forEach((category: CategoryWithSubcategories) => {
      console.log(`  - ${category.name} (ID: ${category.id}):`, {
        image: category.image,
        hasImage: !!category.image,
        imageType: category.image ? typeof category.image : 'none',
        isAutomobile: category.name.toLowerCase().includes('automobile') || category.name.toLowerCase().includes('vehicle') || category.name.toLowerCase().includes('auto')
      });
    });
    return data;
  }, [categoriesWithSubcategoriesData?.data]);
  
  // Create a stable key for the useEffect dependency
  const categoriesKey = useMemo(
    () => allCategoriesWithSubcategories.map((c: CategoryWithSubcategories) => `${c.id}:${c.name}`).join(','),
    [allCategoriesWithSubcategories]
  );

  // Track previous image base URLs to detect changes
  const prevImageBaseUrls = useRef<Map<number, string>>(new Map());

  // Track image base URLs to detect changes and force Image component remount
  const imageBaseUrls = useMemo(() => {
    const map = new Map<number, string>();
    allCategoriesWithSubcategories.forEach(category => {
      if (category.image) {
        // Extract base URL (without cache-busting parameter) to detect actual image changes
        const baseUrl = category.image.replace(/[?&]_t=\d+/g, '').split('?')[0];
        map.set(category.id, baseUrl);
      }
    });
    return map;
  }, [allCategoriesWithSubcategories]);

  // Update image versions when image base URLs change to force Image component remount
  useEffect(() => {
    if (imageBaseUrls.size > 0) {
      setImageVersions(prev => {
        const newVersions = new Map(prev);
        imageBaseUrls.forEach((baseUrl, categoryId) => {
          const currentVersion = newVersions.get(categoryId) || 0;
          const prevBaseUrl = prevImageBaseUrls.current.get(categoryId);
          
          // Check if base URL actually changed
          if (prevBaseUrl === undefined || baseUrl !== prevBaseUrl) {
            // Base URL changed (or first time), increment version
            const newVersion = currentVersion + 1;
            newVersions.set(categoryId, newVersion);
            const category = allCategoriesWithSubcategories.find(c => c.id === categoryId);
            if (category) {
              console.log(`🔄 [Image Version] Category ${categoryId} (${category.name}): Version updated to ${newVersion} (base URL changed from "${prevBaseUrl || 'none'}" to "${baseUrl}")`);
            }
          } else {
            // Base URL unchanged, keep current version
            newVersions.set(categoryId, currentVersion);
          }
        });
        
        // Update the ref with current base URLs for next comparison
        prevImageBaseUrls.current = new Map(imageBaseUrls);
        
        return newVersions;
      });
    }
  }, [imageBaseUrls, allCategoriesWithSubcategories]);

  // Use ref to stabilize refetchCategories function
  const refetchCategoriesRef = React.useRef(refetchCategories);
  React.useEffect(() => {
    refetchCategoriesRef.current = refetchCategories;
  }, [refetchCategories]);

  // Check for expired URLs only once when categories data changes
  useEffect(() => {
    if (allCategoriesWithSubcategories.length === 0) return;

    // Check each category for expired URLs
    allCategoriesWithSubcategories.forEach((category: CategoryWithSubcategories) => {
      // Skip if already checked or being refetched
      if (checkedExpiredUrls.current.has(category.id) || refetchingImages.has(category.id)) {
        return;
      }

      const imageUrl = category.image;
      if (!imageUrl || typeof imageUrl !== 'string') return;

      // Check if it's a presigned URL
      const isPresignedUrl = imageUrl.includes('X-Amz-Algorithm') || imageUrl.includes('X-Amz-Signature');
      if (!isPresignedUrl) return;

      // Parse expiration time
      let isUrlExpired = false;
      try {
        const expiresMatch = imageUrl.match(/X-Amz-Date=([^&]+)/);
        const expiresMatch2 = imageUrl.match(/Expires=([^&]+)/);
        const expiresSecondsMatch = imageUrl.match(/X-Amz-Expires=(\d+)/);

        if (expiresMatch || expiresMatch2 || expiresSecondsMatch) {
          let expirationTime: Date | null = null;

          // Try to parse from Expires parameter
          if (expiresMatch2) {
            expirationTime = new Date(expiresMatch2[1]);
          }
          // Try to parse from X-Amz-Date + X-Amz-Expires
          else if (expiresMatch && expiresSecondsMatch) {
            const dateStr = expiresMatch[1];
            const expiresSeconds = parseInt(expiresSecondsMatch[1], 10);
            // Parse YYYYMMDDTHHmmssZ format
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            const hour = dateStr.substring(9, 11);
            const minute = dateStr.substring(11, 13);
            const second = dateStr.substring(13, 15);
            const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
            expirationTime = new Date(date.getTime() + expiresSeconds * 1000);
          }

          if (expirationTime) {
            const now = new Date();
            const timeUntilExpiry = expirationTime.getTime() - now.getTime();
            const expiresInMinutes = timeUntilExpiry / 1000 / 60;
            isUrlExpired = expirationTime < now;
            // Proactively refresh URLs that will expire in less than 5 minutes
            const willExpireSoon = timeUntilExpiry > 0 && timeUntilExpiry < 5 * 60 * 1000;

            if (isUrlExpired || willExpireSoon) {
              // Mark as checked and refetch
              checkedExpiredUrls.current.add(category.id);
              console.log(`${isUrlExpired ? '⏰ [Expired URL]' : '⚠️ [Expiring Soon]'} ${category.name} (ID: ${category.id}):`, {
                expirationTime: expirationTime.toISOString(),
                currentTime: now.toISOString(),
                status: isUrlExpired 
                  ? `Expired ${Math.round((now.getTime() - expirationTime.getTime()) / 1000 / 60)} minutes ago`
                  : `Expires in ${Math.round(expiresInMinutes)} minutes`,
                action: 'Refreshing URL...'
              });

              // Automatically refetch the image for this category (only once)
              refetchCategoryImage(category.id, category.name);
            }
          }
        }
      } catch (e) {
        console.warn(`⚠️ [URL Parse Error] ${category.name}:`, e);
      }
    });
  }, [categoriesKey]); // Only run when categories data actually changes

  // Function to refetch image for a specific category
  const refetchCategoryImage = async (categoryId: number, categoryName: string) => {
    // Prevent duplicate refetches
    if (refetchingImages.has(categoryId)) {
      console.log(`⏸️ [Refetch Image] ${categoryName}: Already refetching, skipping...`);
      return;
    }

    setRefetchingImages((prev: Set<number>) => new Set(prev).add(categoryId));
    console.log(`🔄 [Refetch Image] ${categoryName} (ID: ${categoryId}): Starting refetch for expired URL...`);

    try {
      // Call the new refresh-image API endpoint
      const result = await refreshImageUrl(categoryId, undefined);
      
      if (result.status === 'success' && result.data?.image) {
        const freshImageUrl = result.data.image;
        console.log(`✅ [Refetch Image] ${categoryName}: Got fresh image URL`);
        
        // Get current cached data
        const cachedData = await getCachedCategories();
        
        if (cachedData) {
          // Find and update the category in cached data
          const updatedData = cachedData.map(cat => {
            if (cat.id === categoryId) {
              return {
                ...cat,
                image: freshImageUrl,
                updated_at: new Date().toISOString() // Update timestamp
              };
            }
            return cat;
          });
          
          // Save updated cache (365-day persistence)
          await saveCachedCategories(updatedData, new Date().toISOString());
          
          // Update React Query cache
          const queryKey = [...queryKeys.categories.all, 'withSubcategories', 'all'];
          queryClient.setQueryData(queryKey, {
            status: 'success',
            msg: 'Categories with subcategories retrieved successfully',
            data: updatedData,
            meta: {
              total_categories: updatedData.length,
              total_subcategories: updatedData.reduce((sum, cat) => sum + (cat.subcategory_count || 0), 0),
              b2b_available: updatedData.filter(c => c.available_in?.b2b).length,
              b2c_available: updatedData.filter(c => c.available_in?.b2c).length,
            },
            hitBy: 'Cache+Refresh',
          });
          
          // Remove from error set so image can be displayed
          setImageErrors(prev => {
            const newSet = new Set(prev);
            newSet.delete(categoryId);
            return newSet;
          });
          
          // Keep in checkedExpiredUrls to prevent re-checking immediately after update
          // It will be cleared when categories data changes (new load)
          
          console.log(`✅ [Refetch Image] ${categoryName}: Image URL updated successfully in cache`);
        } else {
          console.log(`⚠️ [Refetch Image] ${categoryName}: No cached data found`);
        }
      } else {
        console.log(`⚠️ [Refetch Image] ${categoryName}: API returned no image URL`);
      }
    } catch (error: any) {
      console.error(`❌ [Refetch Image] ${categoryName}: Error refetching image:`, error.message);
    } finally {
      setRefetchingImages((prev: Set<number>) => {
        const newSet = new Set(prev);
        newSet.delete(categoryId);
        return newSet;
      });
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      setTabBarVisible(true);
      // Refetch categories on focus to check for incremental updates
      // This ensures the dashboard always shows the latest data (including stats)
      console.log('🔄 UserDashboardScreen: Screen focused - refetching categories for incremental updates');
      refetchCategoriesRef.current();
      // Don't fetch location here - only fetch when user clicks location option
      // Don't hide tab bar on cleanup - tab screens should always show tab bar
    }, [setTabBarVisible])
  );

  // Listen for order updates to refresh dashboard stats
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('orderStatusUpdated', () => {
      console.log('📊 UserDashboardScreen: Order status updated - refreshing dashboard stats');
      // Invalidate categories query to force refetch with updated stats
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.categories.all 
      });
      // Also refetch categories to get updated stats
      refetchCategoriesRef.current();
    });

    return () => {
      subscription.remove();
    };
  }, [refetchCategoriesRef]);

  useEffect(() => {
    const loadUserData = async () => {
      const data = await getUserData();
      setUserData(data);
    };
    loadUserData();
    
    // Load cached location on mount to show address immediately (permanent cache)
    (async () => {
      try {
        const cachedLocation = await getMostRecentLocation();
        if (cachedLocation && cachedLocation.address) {
          const addressText = cachedLocation.address.address || cachedLocation.address.formattedAddress;
          if (addressText && addressText !== 'Shop No 15, Katraj') {
            setCurrentAddress(addressText);
            setCurrentLocation({
              latitude: cachedLocation.latitude,
              longitude: cachedLocation.longitude
            });
            console.log('📍 Loaded cached location and address (permanent cache)');
          }
        }
      } catch (error) {
        console.warn('Error loading cached location:', error);
      }
    })();
  }, []);

  // Check for saved addresses in AsyncStorage and open modal if empty (only once)
  useEffect(() => {
    const checkAndOpenAddressModal = async () => {
      // Only check once and if userData is available
      if (hasCheckedAddresses.current || !userData?.id) {
        return;
      }

      try {
        hasCheckedAddresses.current = true;
        
        // First check AsyncStorage for saved addresses
        const savedAddressesKey = `saved_addresses_${userData.id}`;
        const savedAddressesJson = await AsyncStorage.getItem(savedAddressesKey);
        
        // If AsyncStorage is empty or null, open the modal
        if (!savedAddressesJson || savedAddressesJson === '[]' || savedAddressesJson === 'null') {
          console.log('📍 No addresses found in AsyncStorage, opening address modal automatically');
          setShowLocationHistory(true);
          return;
        }

        // Try to parse and check if addresses array is empty
        try {
          const savedAddresses = JSON.parse(savedAddressesJson);
          if (!savedAddresses || (Array.isArray(savedAddresses) && savedAddresses.length === 0)) {
            console.log('📍 Addresses array is empty in AsyncStorage, opening address modal automatically');
            setShowLocationHistory(true);
            return;
          }
          
          // If addresses exist, display the most recent one at the top of dashboard
          if (savedAddresses && savedAddresses.length > 0) {
            const sortedAddresses = [...savedAddresses].sort((a: any, b: any) => {
              const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
              const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
              return dateB - dateA; // Most recent first
            });
            
            const mostRecentAddress = sortedAddresses[0];
            if (mostRecentAddress) {
              setCurrentAddress(mostRecentAddress.address || 'Shop No 15, Katraj');
              if (mostRecentAddress.latitude && mostRecentAddress.longitude) {
                setCurrentLocation({
                  latitude: mostRecentAddress.latitude,
                  longitude: mostRecentAddress.longitude
                });
              }
              console.log('📍 Dashboard address loaded from AsyncStorage on mount:', mostRecentAddress.address);
            }
          }
        } catch (parseError) {
          // If parsing fails, treat as empty and open modal
          console.log('📍 Error parsing saved addresses from AsyncStorage, opening address modal');
          setShowLocationHistory(true);
          return;
        }

        // Also check API as a fallback (but don't open modal if AsyncStorage has addresses)
        // This is just to sync data, not to determine if modal should open
        try {
          const addresses = await getCustomerAddresses(userData.id);
          // Update AsyncStorage with fresh data if we got addresses
          if (addresses && addresses.length > 0) {
            await AsyncStorage.setItem(savedAddressesKey, JSON.stringify(addresses));
            
            // Update the dashboard address display with the most recent address
            const sortedAddresses = [...addresses].sort((a, b) => {
              const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
              const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
              return dateB - dateA; // Most recent first
            });
            
            const mostRecentAddress = sortedAddresses[0];
            if (mostRecentAddress) {
              setCurrentAddress(mostRecentAddress.address || 'Shop No 15, Katraj');
              if (mostRecentAddress.latitude && mostRecentAddress.longitude) {
                setCurrentLocation({
                  latitude: mostRecentAddress.latitude,
                  longitude: mostRecentAddress.longitude
                });
              }
              console.log('📍 Dashboard address loaded from API:', mostRecentAddress.address);
            }
          } else {
            // If AsyncStorage has addresses but API doesn't, use AsyncStorage addresses
            try {
              const savedAddresses = JSON.parse(savedAddressesJson);
              if (savedAddresses && savedAddresses.length > 0) {
                const sortedAddresses = [...savedAddresses].sort((a: any, b: any) => {
                  const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
                  const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
                  return dateB - dateA;
                });
                const mostRecentAddress = sortedAddresses[0];
                if (mostRecentAddress) {
                  setCurrentAddress(mostRecentAddress.address || 'Shop No 15, Katraj');
                  if (mostRecentAddress.latitude && mostRecentAddress.longitude) {
                    setCurrentLocation({
                      latitude: mostRecentAddress.latitude,
                      longitude: mostRecentAddress.longitude
                    });
                  }
                  console.log('📍 Dashboard address loaded from AsyncStorage:', mostRecentAddress.address);
                }
              }
            } catch (parseError) {
              console.error('Error parsing saved addresses:', parseError);
            }
          }
        } catch (error: any) {
          console.error('Error fetching addresses from API:', error);
          // Don't open modal here since AsyncStorage check already passed
          // Try to use AsyncStorage addresses as fallback
          try {
            const savedAddresses = JSON.parse(savedAddressesJson);
            if (savedAddresses && savedAddresses.length > 0) {
              const sortedAddresses = [...savedAddresses].sort((a: any, b: any) => {
                const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
                const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
                return dateB - dateA;
              });
              const mostRecentAddress = sortedAddresses[0];
              if (mostRecentAddress) {
                setCurrentAddress(mostRecentAddress.address || 'Shop No 15, Katraj');
                if (mostRecentAddress.latitude && mostRecentAddress.longitude) {
                  setCurrentLocation({
                    latitude: mostRecentAddress.latitude,
                    longitude: mostRecentAddress.longitude
                  });
                }
                console.log('📍 Dashboard address loaded from AsyncStorage (fallback):', mostRecentAddress.address);
              }
            }
          } catch (parseError) {
            console.error('Error parsing saved addresses (fallback):', parseError);
          }
        }
      } catch (error: any) {
        console.error('Error checking addresses in AsyncStorage:', error);
        // If there's an error checking AsyncStorage, open the modal as fallback
        // This is safer for new users
        console.log('📍 Error checking AsyncStorage, opening address modal as fallback');
        setShowLocationHistory(true);
      }
    };

    if (userData?.id) {
      checkAndOpenAddressModal();
    }
  }, [userData?.id]);

  // Listen for address updates from other screens (e.g., EditProfileScreen)
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('addressesUpdated', async () => {
      console.log('📍 Addresses updated event received, refreshing dashboard address');
      if (userData?.id) {
        try {
          const addresses = await getCustomerAddresses(userData.id);
          if (addresses && addresses.length > 0) {
            // Get the most recently added/updated address
            const sortedAddresses = [...addresses].sort((a, b) => {
              const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
              const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
              return dateB - dateA; // Most recent first
            });
            
            const mostRecentAddress = sortedAddresses[0];
            if (mostRecentAddress) {
              setCurrentAddress(mostRecentAddress.address || 'Shop No 15, Katraj');
              if (mostRecentAddress.latitude && mostRecentAddress.longitude) {
                setCurrentLocation({
                  latitude: mostRecentAddress.latitude,
                  longitude: mostRecentAddress.longitude
                });
              }
              console.log('📍 Dashboard address refreshed from event:', mostRecentAddress.address);
            }
          }
        } catch (error) {
          console.error('Error refreshing dashboard address from event:', error);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [userData?.id]);

  // Banner switching effect
  useEffect(() => {
    const switchBanner = () => {
      // Switch banner instantly without animation
      setCurrentBanner((prev) => (prev === 0 ? 1 : 0));
    };

    // Switch every 10 seconds
    const interval = setInterval(switchBanner, 10000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Extract 9 categories for "Pick Your Category" section
  const [displayedCategories, setDisplayedCategories] = useState<CategoryWithSubcategories[]>([]);

  useEffect(() => {
    if (allCategoriesWithSubcategories.length > 0) {
      // Shuffle and select 9 categories
      const shuffled = [...allCategoriesWithSubcategories];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, 9);
      setDisplayedCategories(selected);
    } else {
      setDisplayedCategories([]);
    }
  }, [categoriesKey]); // Use stable key instead of array reference to prevent infinite loops

  // Get random subcategories from random categories for market rates
  const marketRates = useMemo(() => {
    if (allCategoriesWithSubcategories.length === 0) return [];
    
    // Get random categories (2-3 categories)
    const shuffled = [...allCategoriesWithSubcategories];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const randomCategories = shuffled.slice(0, Math.min(3, shuffled.length));
    
    // Collect subcategories from these random categories
    const allSubcategories: Subcategory[] = [];
    randomCategories.forEach(category => {
      if (category.subcategories && category.subcategories.length > 0) {
        // Take up to 5 subcategories from each category
        const categorySubs = category.subcategories.slice(0, 5);
        allSubcategories.push(...categorySubs);
      }
    });
    
    // Shuffle and limit to 10 subcategories for display
    for (let i = allSubcategories.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allSubcategories[i], allSubcategories[j]] = [allSubcategories[j], allSubcategories[i]];
    }
    
    return allSubcategories.slice(0, 10).map((sub) => ({
      id: sub.id.toString(),
      name: sub.name,
      price: `₹${sub.default_price}/${sub.price_unit}`,
      image: sub.image,
      trend: 'stable' as 'up' | 'down' | 'stable',
    }));
  }, [allCategoriesWithSubcategories]);

  const handleCategorySelect = (categoryId: number) => {
    setSelectedCategories((prev) => {
      if (prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId);
      } else {
        return [...prev, categoryId];
      }
    });
  };

  const handleSellNow = () => {
    // Navigate to Material Selection Screen with selected categories and all data
    (navigation as any).navigate('MaterialSelection', {
      allCategoriesWithSubcategories: allCategoriesWithSubcategories,
      selectedCategories: selectedCategories.length > 0 ? selectedCategories : undefined
    });
  };

  const getHeaderGradient = () => {
    if (themeName === 'darkGreen') return ['#1B5E20', '#2E7D32'];
    if (themeName === 'whitePurple') return ['#6A1B9A', '#8E24AA'];
    return [theme.primary, theme.primary];
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={getHeaderGradient()[0]}
      />

      {/* Modernized Header */}
      <LinearGradient
        colors={getHeaderGradient()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerContainer}
      >
        {/* Top Bar with Location and Profile */}
        <View style={styles.topBar}>
          <TouchableOpacity 
            style={styles.locationContainer}
            onPress={() => setShowLocationHistory(true)}
            activeOpacity={0.7}
          >
            <View style={styles.locationIconWrapper}>
              <MaterialCommunityIcons name="map-marker" size={14} color="#FFFFFF" />
            </View>
            <View style={styles.locationTextWrapper}>
              <AutoText style={styles.locationLabel}>Picking up at</AutoText>
              <AutoText style={styles.locationText} numberOfLines={2}>
                {currentAddress}
              </AutoText>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroContent}>
            <AutoText style={styles.heroSubtitle} numberOfLines={3}>
              Quick pickup{'\n'}Fair pricing{'\n'}Instant payment
            </AutoText>
            <TouchableOpacity
              style={styles.heroButton}
              onPress={handleSellNow}
              activeOpacity={0.9}
            >
              <AutoText style={styles.heroButtonText}>Start Selling</AutoText>
              <MaterialCommunityIcons name="arrow-right" size={14} color={theme.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.heroIllustration}>
            <Image
              source={require('../../assets/images/dashbaoard.png')}
              style={styles.heroImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statIconWrapper}>
              <Image
                source={require('../../assets/images/Totalorders.png')}
                style={styles.statIconImage}
                resizeMode="contain"
              />
            </View>
            <AutoText style={styles.statValue}>
              {categoriesWithSubcategoriesData?.meta?.stats?.totalOrders?.toLocaleString() || '0'}
            </AutoText>
            <AutoText style={styles.statLabel}>Total Orders</AutoText>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconWrapper}>
              <Image
                source={require('../../assets/images/Moneyearned.png')}
                style={styles.statIconImage}
                resizeMode="contain"
              />
            </View>
            <AutoText style={styles.statValue}>
              {categoriesWithSubcategoriesData?.meta?.stats?.totalEarned 
                ? `₹${(categoriesWithSubcategoriesData.meta.stats.totalEarned / 1000).toFixed(1)}K`
                : '₹0'}
            </AutoText>
            <AutoText style={styles.statLabel}>Earned</AutoText>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconWrapper}>
              <Image
                source={require('../../assets/images/Recycled.png')}
                style={styles.statIconImage}
                resizeMode="contain"
              />
            </View>
            <AutoText style={styles.statValue}>
              {categoriesWithSubcategoriesData?.meta?.stats?.totalRecycled 
                ? `${Math.round(categoriesWithSubcategoriesData.meta.stats.totalRecycled)}kg`
                : '0kg'}
            </AutoText>
            <AutoText style={styles.statLabel}>Recycled</AutoText>
          </View>
        </View>


        {/* Banner with Text and Women Image / Man Image */}
        <View style={styles.bannerContainer}>
          {currentBanner === 0 ? (
            // First Banner: Women Image on Right, Text on Left
            <>
              {/* LEFT TEXT */}
              <View style={styles.bannerTextContainer}>
                <AutoText style={styles.bannerRupee}>₹0</AutoText>
                <AutoText style={styles.bannerTitle}>Pickup Charge</AutoText>
                <AutoText style={styles.bannerSubtitle}>
                  No Minimum Quantity
                </AutoText>
                <AutoText style={styles.bannerSubtitle}>
                  For Scraps
                </AutoText>
              </View>
              {/* RIGHT IMAGE */}
              <View style={styles.bannerImageContainer}>
                <Image
                  source={require('../../assets/images/Women.png')}
                  style={styles.bannerImage}
                  resizeMode="cover"
                />
              </View>
            </>
          ) : (
            // Second Banner: Man Image on Left, Text on Right
            <>
              {/* LEFT IMAGE */}
              <View style={styles.bannerImageContainerLeft}>
                <Image
                  source={require('../../assets/images/Man.png')}
                  style={styles.bannerImage}
                  resizeMode="cover"
                />
              </View>
              {/* RIGHT TEXT */}
              <View style={styles.bannerTextContainerRight}>
                <AutoText style={styles.bannerRupee}>Pay ₹50 Per Kg</AutoText>
                <AutoText style={styles.bannerSubtitle} numberOfLines={3}>
                  Food Waste Today,{'\n'}
                  Green Compost Tomorrow{'\n'}
                  Picked From Your Doorstep
                </AutoText>

              </View>
            </>
          )}
        </View>

        {/* Food Waste Notice */}
        <View style={styles.foodWasteNoticeContainer}>
          <View style={styles.foodWasteNoticeContent}>
            <MaterialCommunityIcons 
              name="information-outline" 
              size={20} 
              color={theme.primary} 
              style={styles.foodWasteIcon}
            />
            <View style={styles.foodWasteTextContainer}>
              <AutoText style={styles.foodWasteText} numberOfLines={0}>
                Food waste collection partners are not yet available in your area. We're actively expanding our network and will be bringing this service to you very soon. Thank you for your patience and support.
              </AutoText>
              <TouchableOpacity
                style={styles.enquireNowButton}
                onPress={() => {
                  console.log('🔔 Enquire Now button pressed');
                  setShowFoodWasteEnquiryModal(true);
                }}
                activeOpacity={0.7}
              >
                <AutoText style={styles.enquireNowButtonText}>Enquire Now</AutoText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Categories Section with Modern Cards */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <AutoText style={styles.sectionTitle}>Pick Your Category</AutoText>
              <AutoText style={styles.sectionSubtitle}>
                Choose what you'd like to recycle today
              </AutoText>
            </View>
            <TouchableOpacity
              style={styles.seeAllButton}
              onPress={() => (navigation as any).navigate('MaterialSelection', {
                allCategoriesWithSubcategories: allCategoriesWithSubcategories,
                selectedCategories: selectedCategories,
              })}
              activeOpacity={0.7}
            >
              <AutoText style={styles.seeAllText}>View All</AutoText>
              <MaterialCommunityIcons name="chevron-right" size={16} color={theme.primary} />
            </TouchableOpacity>
          </View>

          {loadingCategories ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <AutoText style={styles.loadingText}>Fetching categories...</AutoText>
            </View>
          ) : categoriesError ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.textSecondary} />
              <AutoText style={styles.errorText}>Unable to load categories</AutoText>
              <AutoText style={styles.errorDetailText}>
                {categoriesError?.message || 'Please check your connection and try again'}
              </AutoText>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  console.log('Retrying category fetch...');
                  refetchCategories();
                }}
              >
                <AutoText style={styles.retryText}>Try Again</AutoText>
              </TouchableOpacity>
            </View>
          ) : displayedCategories.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="package-variant-closed" size={48} color={theme.textSecondary} />
              <AutoText style={styles.emptyText}>No categories found</AutoText>
            </View>
          ) : (
            <View style={styles.categoriesGrid}>
              {displayedCategories.map((category, index) => {
                const isSelected = selectedCategories.includes(category.id);
                const gradient = getCategoryGradient(index);
                const categoryIcon = getCategoryIcon(category.name);
                const selectedIndex = selectedCategories.indexOf(category.id);
                const hasImageError = imageErrors.has(category.id);

                // Console log for automobile/vehicle categories
                const isAutoCategory = category.name.toLowerCase().includes('automobile') || 
                                      category.name.toLowerCase().includes('vehicle') || 
                                      category.name.toLowerCase().includes('auto');
                
                if (isAutoCategory) {
                  console.log(`🚗 [Category Card] ${category.name}:`, {
                    id: category.id,
                    image: category.image,
                    hasImage: !!category.image,
                    hasImageError,
                    willShowIcon: !category.image || hasImageError,
                    iconName: categoryIcon,
                    imageUrl: category.image || 'NO IMAGE'
                  });
                }

                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[styles.categoryCard, isSelected && styles.categoryCardSelected]}
                    onPress={() => handleCategorySelect(category.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.categoryCardBackground} />
                    <View style={styles.categoryContent}>
                      <View style={styles.categoryIconWrapper}>
                        {category.image && !hasImageError ? (() => {
                          // Clean and validate the image URL
                          let imageUri = category.image.trim();
                          
                          // Check if this is a presigned S3 URL and if it's expired
                          const isPresignedUrl = imageUri.includes('X-Amz-Expires') || imageUri.includes('X-Amz-Date');
                          let isUrlExpired = false;
                          
                          if (isPresignedUrl) {
                            // Extract expiration time from URL
                            const expiresMatch = imageUri.match(/X-Amz-Date=(\d{8}T\d{6}Z)/);
                            const expiresMatch2 = imageUri.match(/Expires=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
                            const expiresSecondsMatch = imageUri.match(/X-Amz-Expires=(\d+)/);
                            
                            if (expiresMatch || expiresMatch2 || expiresSecondsMatch) {
                              try {
                                let expirationTime: Date | null = null;
                                
                                // Try to parse from Expires parameter
                                if (expiresMatch2) {
                                  expirationTime = new Date(expiresMatch2[1]);
                                } 
                                // Try to parse from X-Amz-Date + X-Amz-Expires
                                else if (expiresMatch && expiresSecondsMatch) {
                                  const dateStr = expiresMatch[1];
                                  const expiresSeconds = parseInt(expiresSecondsMatch[1], 10);
                                  // Parse YYYYMMDDTHHmmssZ format
                                  const year = dateStr.substring(0, 4);
                                  const month = dateStr.substring(4, 6);
                                  const day = dateStr.substring(6, 8);
                                  const hour = dateStr.substring(9, 11);
                                  const minute = dateStr.substring(11, 13);
                                  const second = dateStr.substring(13, 15);
                                  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
                                  expirationTime = new Date(date.getTime() + expiresSeconds * 1000);
                                }
                                
                                if (expirationTime) {
                                  const now = new Date();
                                  isUrlExpired = expirationTime < now;
                                  
                                  // Don't trigger refetch here - it's handled in useEffect
                                  // Just mark it as expired for display purposes
                                }
                              } catch (e) {
                                console.warn(`⚠️ [URL Parse Error] ${category.name}:`, e);
                              }
                            }
                          }
                          
                          // Log URL details for debugging
                          if (isAutoCategory) {
                            console.log(`🔗 [URL Processing] ${category.name}:`, {
                              originalLength: category.image.length,
                              cleanedLength: imageUri.length,
                              startsWithHttp: imageUri.startsWith('http'),
                              isPresignedUrl,
                              isUrlExpired,
                              urlPreview: imageUri.substring(0, 100) + '...'
                            });
                          }
                          
                          // If URL is expired or invalid, fall back to icon
                          if (isUrlExpired || (!imageUri.startsWith('http://') && !imageUri.startsWith('https://'))) {
                            if (isUrlExpired) {
                              console.log(`⚠️ [Using Icon] ${category.name}: Presigned URL expired, showing icon instead`);
                            } else {
                              console.log(`⚠️ [Invalid URL] ${category.name}: URL doesn't start with http/https`);
                            }
                            return (
                              <MaterialCommunityIcons
                                name={categoryIcon}
                                size={24}
                                color={theme.primary}
                              />
                            );
                          }
                          
                          // Get image version to force remount when image changes
                          const imageVersion = imageVersions.get(category.id) || 0;
                          // Extract base URL (without cache-busting) for key comparison
                          const baseUrl = imageUri.replace(/[?&]_t=\d+/g, '').split('?')[0];
                          // Include category ID, base URL, and version in key to ensure remount on any change
                          // Using base URL ensures we detect actual image file changes, not just cache-busting parameter changes
                          const imageKey = `category-${category.id}-${baseUrl}-v${imageVersion}`;
                          
                          return (
                            <Image
                              key={imageKey}
                              source={{ uri: imageUri }}
                              style={styles.categoryIconImage}
                              resizeMode="cover"
                              onError={(error: any) => {
                                const errorDetails = {
                                  categoryName: category.name,
                                  categoryId: category.id,
                                  imageUrl: imageUri,
                                  urlLength: imageUri.length,
                                  errorMessage: error?.nativeEvent?.error || error?.message || 'Unknown error',
                                  errorCode: error?.nativeEvent?.errorCode,
                                  isPresignedUrl,
                                  isUrlExpired,
                                  fullError: error
                                };
                                console.log(`❌ [Image Error] ${category.name} (ID: ${category.id}):`, errorDetails);
                                
                                // Check if error is due to expired presigned URL
                                const errorMessage = error?.nativeEvent?.error || error?.message || '';
                                const isExpiredError = errorMessage.includes('expired') || 
                                                      errorMessage.includes('AccessDenied') ||
                                                      errorMessage.includes('Request has expired');
                                
                                if (isExpiredError && isPresignedUrl && !refetchingImages.has(category.id)) {
                                  console.log(`🔄 [Auto Refresh] ${category.name}: Detected expired URL, automatically refreshing...`);
                                  // Automatically refresh the expired URL
                                  refetchCategoryImage(category.id, category.name);
                                } else {
                                  // Mark as error for other types of errors
                                  setImageErrors(prev => new Set(prev).add(category.id));
                                }
                              }}
                              onLoadStart={() => {
                                if (isAutoCategory) {
                                  console.log(`⏳ [Image Loading Start] ${category.name}:`, {
                                    url: imageUri.substring(0, 150) + '...',
                                    fullLength: imageUri.length
                                  });
                                }
                              }}
                              onLoad={(event: any) => {
                                if (isAutoCategory) {
                                  console.log(`✅ [Image Loaded Success] ${category.name}:`, {
                                    url: imageUri.substring(0, 150) + '...',
                                    width: event?.nativeEvent?.width,
                                    height: event?.nativeEvent?.height
                                  });
                                }
                              }}
                            />
                          );
                        })() : (
                          <MaterialCommunityIcons
                            name={categoryIcon}
                            size={24}
                            color={theme.primary}
                          />
                        )}
                      </View>
                      <AutoText
                        style={[
                          styles.categoryName,
                          (category.name.toLowerCase().includes('construction') ||
                            category.name.toLowerCase().includes('demolition') ||
                            category.name.toLowerCase().includes('automotive') ||
                            category.name.toLowerCase().includes('vehicle')) && styles.categoryNameSmall
                        ]}
                        numberOfLines={2}
                      >
                        {category.name}
                      </AutoText>
                      <View style={styles.categorySelector}>
                        {isSelected && (
                          <MaterialCommunityIcons
                            name="check-circle"
                            size={18}
                            color={theme.primary}
                          />
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Market Rates Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <AutoText style={styles.sectionTitle}>Today's Market Rates</AutoText>
              <AutoText style={styles.sectionSubtitle}>
                Live pricing in your locality
              </AutoText>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveIndicator} />
              <AutoText style={styles.liveText}>LIVE</AutoText>
            </View>
          </View>

          {loadingCategories ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
              <AutoText style={styles.loadingText}>Loading market rates...</AutoText>
            </View>
          ) : categoriesError ? (
            <View style={styles.errorContainer}>
              <AutoText style={styles.errorText}>Unable to load market rates</AutoText>
            </View>
          ) : marketRates.length === 0 ? (
            <View style={styles.emptyContainer}>
              <AutoText style={styles.emptyText}>No market rates available</AutoText>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.ratesScrollContent}
            >
              {marketRates.map((rate, index) => (
                <TouchableOpacity
                  key={rate.id}
                  style={[styles.rateCard, index === 0 && styles.rateCardFirst]}
                  activeOpacity={0.9}
                  onPress={() => (navigation as any).navigate('MaterialSelection', {
                    allCategoriesWithSubcategories: allCategoriesWithSubcategories,
                    selectedCategories: selectedCategories,
                  })}
                >
                  <View style={styles.rateHeader}>
                    <View style={styles.rateIconPlaceholder}>
                      {rate.image ? (
                        <Image
                          source={{ uri: rate.image }}
                          style={styles.rateIconImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <MaterialCommunityIcons
                          name="package-variant"
                          size={28}
                          color={theme.primary}
                        />
                      )}
                    </View>
                    {rate.trend && (
                      <View style={[
                        styles.trendBadge,
                        rate.trend === 'up' && styles.trendUp,
                        rate.trend === 'down' && styles.trendDown,
                      ]}>
                        <MaterialCommunityIcons
                          name={rate.trend === 'up' ? 'arrow-up' : rate.trend === 'down' ? 'arrow-down' : 'minus'}
                          size={14}
                          color={rate.trend === 'up' ? theme.secondary || theme.primary : rate.trend === 'down' ? '#EF5350' : theme.textSecondary}
                        />
                      </View>
                    )}
                  </View>
                  <AutoText style={styles.rateName} numberOfLines={2}>
                    {rate.name}
                  </AutoText>
                  <AutoText style={styles.ratePrice}>{rate.price}</AutoText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Vehicle Scrapping - Modern Card */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.featureCard}
            activeOpacity={0.9}
            onPress={() => (navigation as any).navigate('VehicleService')}
          >
            <View style={styles.featureCardContent}>
              <View style={styles.featureIconLarge}>
                <Image
                  source={require('../../assets/images/Scrapvehicle.png')}
                  style={{ width: 56, height: 56 }}
                  resizeMode="contain"
                />
              </View>
              <AutoText style={styles.featureTitle}>Vehicle Scrapping Service</AutoText>
              <AutoText style={styles.featureDescription} numberOfLines={2}>
                Get top value for your old vehicle{'\n'}with our certified scrapping process
              </AutoText>
              <View style={styles.featureBenefits}>
                <View style={styles.benefitItem}>
                  <MaterialCommunityIcons name="cash" size={14} color={theme.primary} />
                  <AutoText style={styles.benefitText}>Best Price</AutoText>
                </View>
                <View style={styles.benefitItem}>
                  <MaterialCommunityIcons name="shield-check" size={14} color={theme.primary} />
                  <AutoText style={styles.benefitText}>Certified</AutoText>
                </View>
                <View style={styles.benefitItem}>
                  <MaterialCommunityIcons name="clock-fast" size={14} color={theme.primary} />
                  <AutoText style={styles.benefitText}>Quick Process</AutoText>
                </View>
              </View>
              <View style={styles.featureAction}>
                <AutoText style={styles.featureActionText}>Learn More</AutoText>
                <MaterialCommunityIcons name="arrow-right" size={16} color={theme.primary} />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Referral Program - Redesigned */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.referralCard} activeOpacity={0.9}>
            <View style={styles.referralBackground}>
              <View style={styles.referralPattern} />
            </View>
            <View style={styles.referralContent}>
              <View style={styles.referralLeft}>
                <View style={styles.referralIconWrapper}>
                  <MaterialCommunityIcons name="trophy" size={28} color="#FFFFFF" />
                </View>
                <View style={styles.referralTextSection}>
                  <AutoText style={styles.referralTitle} numberOfLines={2}>
                    10 Complete{'\n'}Orders
                  </AutoText>
                  <AutoText style={styles.referralSubtitle}>Get ₹100 reward</AutoText>
                </View>
              </View>
              <View style={styles.referralRight}>
                <AutoText style={styles.referralReward}>₹100</AutoText>
                <AutoText style={styles.referralRewardLabel}>reward</AutoText>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Floating Action Button */}
      {selectedCategories.length > 0 && (
        <View style={styles.floatingBar}>
          <LinearGradient
            colors={getHeaderGradient()}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.floatingBarContainer}
          >
            <View style={styles.floatingBarContent}>
              <View style={styles.floatingBarLeft}>
                <View style={[
                  styles.floatingCategoryIconsContainer,
                  selectedCategories.length >= 4 && styles.floatingCategoryIconsContainerLarge
                ]}>
                  {selectedCategories.slice(0, 3).map((categoryId, index) => {
                    const selectedCat = displayedCategories.find((c) => c.id === categoryId);
                    return (
                      <View
                        key={categoryId}
                        style={[
                          styles.floatingCategoryIcon,
                          index > 0 && styles.floatingCategoryIconOverlap,
                          { zIndex: selectedCategories.length - index }
                        ]}
                      >
                        {selectedCat?.image ? (
                          <Image
                            source={{ uri: selectedCat.image }}
                            style={styles.floatingCategoryImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <MaterialCommunityIcons
                            name={selectedCat ? getCategoryIcon(selectedCat.name) : 'package-variant'}
                            size={24}
                            color={themeName === 'dark' ? theme.textPrimary : '#FFFFFF'}
                          />
                        )}
                      </View>
                    );
                  })}
                  {selectedCategories.length > 3 && (
                    <View style={[styles.floatingCategoryIcon, styles.floatingCategoryIconOverlap, styles.floatingActionImageMore, { zIndex: 0 }]}>
                      <AutoText style={styles.floatingCategoryCount}>+{selectedCategories.length - 3}</AutoText>
                    </View>
                  )}
                </View>
                <AutoText style={[
                  styles.floatingActionText,
                  selectedCategories.length >= 4 && styles.floatingActionTextLarge
                ]}>
                  {selectedCategories.length === 1
                    ? displayedCategories.find((c) => selectedCategories.includes(c.id))?.name
                    : `${selectedCategories.length} Categories`}
                </AutoText>
              </View>
              <TouchableOpacity
                style={styles.floatingActionButton}
                onPress={handleSellNow}
                activeOpacity={0.8}
              >
                <AutoText style={styles.floatingActionButtonText}>Sell Now</AutoText>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.floatingClose}
              onPress={() => setSelectedCategories([])}
            >
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={themeName === 'dark' ? theme.textPrimary : '#FFFFFF'}
              />
            </TouchableOpacity>
          </LinearGradient>
        </View>
      )}

      {/* Add Address Modal */}
      <AddAddressModal
        visible={showLocationHistory}
        onClose={() => {
          setShowLocationHistory(false);
          // Reset the check flag when modal is closed so we can check again if needed
          // (This allows re-checking if user navigates away and comes back)
        }}
        onSaveSuccess={async () => {
          // Emit event to notify other screens (like EditProfileScreen) that addresses have been updated
          DeviceEventEmitter.emit('addressesUpdated');
          // Reset the check flag since user now has an address
          hasCheckedAddresses.current = false;
          
          // Update AsyncStorage and dashboard address display with the new address
          if (userData?.id) {
            try {
              const addresses = await getCustomerAddresses(userData.id);
              const savedAddressesKey = `saved_addresses_${userData.id}`;
              await AsyncStorage.setItem(savedAddressesKey, JSON.stringify(addresses));
              console.log('💾 Saved addresses updated in AsyncStorage');
              
              // Update the dashboard address display with the most recent address
              if (addresses && addresses.length > 0) {
                // Get the most recently added/updated address (sort by updated_at or created_at)
                const sortedAddresses = [...addresses].sort((a, b) => {
                  const dateA = new Date(a.updated_at || a.created_at || 0).getTime();
                  const dateB = new Date(b.updated_at || b.created_at || 0).getTime();
                  return dateB - dateA; // Most recent first
                });
                
                const mostRecentAddress = sortedAddresses[0];
                if (mostRecentAddress) {
                  // Update the displayed address
                  setCurrentAddress(mostRecentAddress.address || 'Shop No 15, Katraj');
                  
                  // Update location if available
                  if (mostRecentAddress.latitude && mostRecentAddress.longitude) {
                    setCurrentLocation({
                      latitude: mostRecentAddress.latitude,
                      longitude: mostRecentAddress.longitude
                    });
                  }
                  
                  console.log('📍 Dashboard address updated to:', mostRecentAddress.address);
                }
              }
            } catch (error) {
              console.error('Error updating AsyncStorage with new address:', error);
            }
          }
        }}
        userData={userData}
        themeName={themeName}
      />

      {/* Food Waste Enquiry Modal */}
      <FoodWasteEnquiryModal
        visible={showFoodWasteEnquiryModal}
          onClose={() => {
            setShowFoodWasteEnquiryModal(false);
            setSelectedKgPerWeek('');
            setSelectedTimings([]);
          }}
          onSubmit={async (kgPerWeek: string, timings: string[]) => {
            setIsSubmittingEnquiry(true);
            try {
              const url = buildApiUrl('/v2/food-waste/enquiry');
              const requestBody = {
                user_id: userData?.id,
                kg_per_week: kgPerWeek,
                preferred_timings: timings,
                address: currentAddress,
                latitude: currentLocation?.latitude,
                longitude: currentLocation?.longitude,
              };

              console.log('🔔 Submitting food waste enquiry:', {
                url,
                body: requestBody,
              });

              const headers = getApiHeaders();
              console.log('📡 Request headers:', headers);

              const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
              });

              console.log('📡 Food waste enquiry response status:', response.status);
              console.log('📡 Food waste enquiry response ok:', response.ok);

              if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Food waste enquiry HTTP error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
              }

              const result = await response.json();
              console.log('📡 Food waste enquiry response data:', result);

              if (result.status === 'success') {
                Alert.alert('Success', 'Your enquiry has been submitted successfully. We will contact you soon!');
                setShowFoodWasteEnquiryModal(false);
                setSelectedKgPerWeek('');
                setSelectedTimings([]);
              } else {
                console.error('❌ Food waste enquiry failed:', result);
                Alert.alert('Error', result.msg || 'Failed to submit enquiry. Please try again.');
              }
            } catch (error: any) {
              console.error('❌ Error submitting food waste enquiry:', error);
              console.error('❌ Error message:', error?.message);
              console.error('❌ Error stack:', error?.stack);
              console.error('❌ Error name:', error?.name);
              Alert.alert('Error', `Failed to submit enquiry: ${error?.message || 'Unknown error'}`);
            } finally {
              setIsSubmittingEnquiry(false);
            }
          }}
          selectedKgPerWeek={selectedKgPerWeek}
          setSelectedKgPerWeek={setSelectedKgPerWeek}
          selectedTimings={selectedTimings}
          setSelectedTimings={setSelectedTimings}
          isSubmitting={isSubmittingEnquiry}
          theme={theme}
      />
    </View>
  );
};

const getStyles = (theme: any, themeName?: string, isDark?: boolean) =>
  ScaledSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerContainer: {
      paddingHorizontal: '20@s',
      paddingBottom: '16@vs',
      borderBottomLeftRadius: '28@ms',
      borderBottomRightRadius: '28@ms',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: '10@vs',
      marginBottom: '4@vs',
    },
    locationContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    locationIconWrapper: {
      width: '28@s',
      height: '28@vs',
      borderRadius: '14@ms',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    locationTextWrapper: {
      marginLeft: '8@s',
      flex: 1,
    },
    locationLabel: {
      fontFamily: 'Poppins-Regular',
      fontSize: '10@s',
      color: 'rgba(255, 255, 255, 0.8)',
    },
    locationText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: '#FFFFFF',
      flexShrink: 1,
    },
    profileButton: {
      marginLeft: '10@s',
    },
    heroSection: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: '0@vs',
    },
    heroContent: {
      flex: 1,
      paddingRight: '10@s',
    },
    heroTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '28@s',
      color: '#FFFFFF',
      lineHeight: '36@vs',
      marginBottom: '6@vs',
    },
    heroSubtitle: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: 'rgba(255, 255, 255, 0.9)',
      marginBottom: '10@vs',
      lineHeight: '16@vs',
      textAlign: 'left',
    },
    heroButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      paddingVertical: '8@vs',
      paddingHorizontal: '18@s',
      borderRadius: '8@ms',
      alignSelf: 'flex-start',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 5,
      marginBottom: '10@vs',
    },
    heroButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: theme.primary,
      marginRight: '4@s',
    },
    heroIllustration: {
      width: '90@s',
      height: '90@vs',
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      borderRadius: '14@ms',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    heroImage: {
      width: '90@s',
      height: '90@vs',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: '14@s',
      paddingTop: '32@vs',
      paddingBottom: '24@vs',
    },
    bannerContainer: {
      width: '100%',
      overflow: "hidden",
      marginBottom: '20@vs',
      borderRadius: '14@ms',
      backgroundColor: '#258832',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
      height: '115@vs',
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: '16@s',
      paddingRight: '8@s',
    },
    bannerTextContainer: {
      flex: 1,
      paddingLeft: '16@s',
      paddingRight: '0@s',
      justifyContent: 'center',
    },
    bannerRupee: {
      fontFamily: 'Poppins-Bold',
      fontSize: '28@s',
      color: '#FFFFFF',
      lineHeight: '32@vs',
    },
    bannerTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: '#FFFFFF',
      marginTop: '-2@vs',
    },
    bannerSubtitle: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: '#E6F4EA',
      marginTop: '2@vs',
      lineHeight: '14@vs',
    },
    bannerImageContainer: {
      width: '115@vs',
      height: '115@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    bannerImageContainerLeft: {
      width: '115@vs',
      height: '115@vs',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: '10@s',
    },
    bannerImage: {
      width: '130@vs',
      height: '125@vs',
      resizeMode: 'contain',
    },
    bannerTextContainerRight: {
      flex: 1,
      paddingLeft: '10@s',
      paddingRight: '16@s',
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    statsContainer: {
      flexDirection: 'row',
      marginTop: '0@vs',
      marginBottom: '20@vs',
      gap: '10@s',
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: '14@ms',
      padding: '12@s',
      alignItems: 'center',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
      borderWidth: 1,
      borderColor: theme.border,
    },
    statIconWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '6@vs',
    },
    statIconImage: {
      width: '36@s',
      height: '36@vs',
    },
    statValue: {
      fontFamily: 'Poppins-Bold',
      fontSize: '16@s',
      color: theme.textPrimary,
      marginBottom: '2@vs',
    },
    statLabel: {
      fontFamily: 'Poppins-Regular',
      fontSize: '10@s',
      color: theme.textSecondary,
    },
    foodWasteNoticeContainer: {
      marginTop: '10@vs',
      marginBottom: '16@vs',
      paddingHorizontal: '4@s',
      width: '100%',
    },
    foodWasteNoticeContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderRadius: '12@ms',
      padding: '14@s',
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: theme.primary + '60',
      width: '100%',
    },
    foodWasteIcon: {
      marginRight: '12@s',
      marginTop: '2@vs',
      flexShrink: 0,
    },
    foodWasteTextContainer: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    foodWasteText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '10@s',
      color: theme.textPrimary,
      lineHeight: '18@vs',
      marginBottom: '12@vs',
      textAlign: 'left',
    },
    enquireNowButton: {
      alignSelf: 'flex-start',
      backgroundColor: theme.primary,
      paddingVertical: '8@vs',
      paddingHorizontal: '16@s',
      borderRadius: '8@ms',
      marginTop: '4@vs',
    },
    enquireNowButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: '#FFFFFF',
    },
    section: {
      marginTop: '10@vs',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: '10@vs',
      gap: '10@s',
    },
    sectionTitleContainer: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      marginRight: '10@s',
    },
    sectionTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '15@s',
      color: theme.textPrimary,
      marginBottom: '4@vs',
    },
    sectionSubtitle: {
      fontFamily: 'Poppins-Regular',
      fontSize: '13@s',
      color: theme.textSecondary,
    },
    seeAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: '6@vs',
      paddingHorizontal: '12@s',
      borderRadius: '8@ms',
      backgroundColor: 'transparent',
    },
    seeAllText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: theme.primary,
      marginRight: '4@s',
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: '6@vs',
      paddingHorizontal: '12@s',
      borderRadius: '20@ms',
      backgroundColor: '#FFF3E0',
    },
    liveIndicator: {
      width: '6@s',
      height: '6@vs',
      borderRadius: '3@s',
      backgroundColor: '#FF6B6B',
      marginRight: '6@s',
    },
    liveText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '10@s',
      color: '#FF6B6B',
    },
    loadingContainer: {
      paddingVertical: '48@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      marginTop: '12@vs',
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    errorContainer: {
      paddingVertical: '48@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorText: {
      marginTop: '12@vs',
      marginBottom: '6@vs',
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    errorDetailText: {
      marginBottom: '16@vs',
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      textAlign: 'center',
      paddingHorizontal: '20@s',
    },
    retryButton: {
      paddingVertical: '10@vs',
      paddingHorizontal: '20@s',
      borderRadius: '8@ms',
      backgroundColor: theme.primary,
    },
    retryText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '13@s',
      color: '#FFFFFF',
    },
    emptyContainer: {
      paddingVertical: '48@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      marginTop: '12@vs',
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    categoriesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: '8@s',
    },
    categoryCard: {
      width: (SCREEN_WIDTH - 50) / 3,
      height: '110@vs',
      marginBottom: '12@vs',
      borderRadius: '18@ms',
      overflow: 'hidden',
      backgroundColor: theme.card,
      borderWidth: 1.5,
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
      position: 'relative',
    },
    categoryCardBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: addOpacityToHex(theme.primary, 0.02),
      borderRadius: '24@ms',
    },
    categoryCardSelected: {
      borderWidth: 2,
      borderColor: theme.primary,
      shadowColor: theme.primary,
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 10,
      transform: [{ scale: 0.98 }],
    },
    categoryContent: {
      flex: 1,
      paddingTop: '10@vs',
      paddingHorizontal: '8@s',
      paddingBottom: '8@vs',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'transparent',
      position: 'relative',
      zIndex: 1,
    },
    categorySelector: {
      position: 'absolute',
      top: '10@vs',
      right: '10@s',
      zIndex: 10,
    },
    categoryIconWrapper: {
      width: '50@s',
      height: '50@vs',
      borderRadius: '12@ms',
      backgroundColor: theme.accent || addOpacityToHex(theme.primary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginBottom: '6@vs',
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    categoryIconImage: {
      width: '100%',
      height: '100%',
    },
    categoryIconOverlapContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      height: '100%',
    },
    categoryIconImageOverlap: {
      width: '72@s',
      height: '72@vs',
      borderRadius: '16@ms',
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },
    categoryName: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: theme.textPrimary,
      lineHeight: '16@vs',
      textAlign: 'center',
      width: '100%',
      paddingHorizontal: '2@s',
      letterSpacing: 0.1,
    },
    categoryNameSmall: {
      fontSize: '10@s',
      lineHeight: '14@vs',
      letterSpacing: 0,
    },
    ratesScrollContent: {
      paddingRight: '14@s',
    },
    rateCard: {
      width: '140@s',
      backgroundColor: theme.card,
      borderRadius: '16@ms',
      padding: '16@s',
      marginLeft: '12@s',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    rateCardFirst: {
      marginLeft: 0,
    },
    rateHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '12@vs',
    },
    rateIconPlaceholder: {
      width: '52@s',
      height: '52@vs',
      borderRadius: '14@ms',
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    rateIconImage: {
      width: '100%',
      height: '100%',
    },
    trendBadge: {
      width: '28@s',
      height: '28@vs',
      borderRadius: '14@ms',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    trendUp: {
      backgroundColor: theme.accent || (theme.secondary ? addOpacityToHex(theme.secondary, 0.2) : addOpacityToHex(theme.primary, 0.2)),
      borderColor: theme.secondary || theme.primary,
    } as any,
    trendDown: {
      backgroundColor: '#FFEBEE',
      borderColor: '#EF5350',
    },
    rateName: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '13@s',
      color: theme.textPrimary,
      marginBottom: '6@vs',
      lineHeight: '16@vs',
    },
    ratePrice: {
      fontFamily: 'Poppins-Bold',
      fontSize: '16@s',
      color: theme.primary,
    },
    featureCard: {
      borderRadius: '20@ms',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      padding: '18@s',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    featureCardContent: {
      alignItems: 'flex-start',
    },
    featureIconLarge: {
      width: '56@s',
      height: '56@vs',
      borderRadius: '16@ms',
      backgroundColor: theme.accent || theme.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '12@vs',
    },
    featureTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '18@s',
      color: theme.textPrimary,
      marginBottom: '6@vs',
    },
    featureDescription: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      marginBottom: '12@vs',
      lineHeight: '18@vs',
    },
    featureBenefits: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: '14@vs',
      gap: '10@s',
    },
    benefitItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: '5@vs',
      paddingHorizontal: '10@s',
      borderRadius: '16@ms',
      backgroundColor: theme.accent || theme.primary + '15',
      borderWidth: 1,
      borderColor: theme.border,
    },
    benefitText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '11@s',
      color: theme.textPrimary,
      marginLeft: '5@s',
    },
    featureAction: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    featureActionText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '13@s',
      color: theme.primary,
      marginRight: '5@s',
    },
    referralCard: {
      borderRadius: '20@ms',
      overflow: 'hidden',
      backgroundColor: themeName === 'whitePurple' ? '#E1BEE7' : theme.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 5,
    },
    referralBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    referralPattern: {
      position: 'absolute',
      top: -50,
      right: -50,
      width: '200@s',
      height: '200@vs',
      borderRadius: '100@ms',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    referralContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '20@s',
    },
    referralLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    referralIconWrapper: {
      width: '56@s',
      height: '56@vs',
      borderRadius: '28@ms',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: '16@s',
    },
    referralTextSection: {
      flex: 1,
    },
    referralTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '18@s',
      color: '#FFFFFF',
      marginBottom: '2@vs',
    },
    referralSubtitle: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: 'rgba(255, 255, 255, 0.85)',
    },
    referralRight: {
      alignItems: 'center',
    },
    referralReward: {
      fontFamily: 'Poppins-Bold',
      fontSize: '32@s',
      color: '#FFFFFF',
    },
    referralRewardLabel: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: 'rgba(255, 255, 255, 0.85)',
      marginBottom: '6@vs',
    },
    referralShareButton: {
      width: '40@s',
      height: '40@vs',
      borderRadius: '20@ms',
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    floatingBar: {
      position: 'absolute',
      bottom: '30@vs',
      left: '18@s',
      right: '18@s',
      borderRadius: '12@ms',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    floatingBarContainer: {
      padding: '12@s',
      flexDirection: 'row',
      alignItems: 'center',
    },
    floatingBarContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    floatingBarLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    floatingCategoryIconsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      height: '32@vs',
      marginRight: '12@s',
    },
    floatingCategoryIconsContainerLarge: {
      marginRight: '6@s',
    },
    floatingCategoryIcon: {
      width: '32@s',
      height: '32@vs',
      borderRadius: '16@s',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: theme.primary,
    },
    floatingCategoryIconOverlap: {
      marginLeft: '-12@s',
    },
    floatingCategoryCount: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '10@s',
      color: themeName === 'dark' ? theme.textPrimary : '#FFFFFF',
    },
    floatingActionImageMore: {
      backgroundColor: themeName === 'dark'
        ? 'rgba(255, 255, 255, 0.2)'
        : 'rgba(0, 0, 0, 0.3)',
    },
    floatingCategoryImage: {
      width: '100%',
      height: '100%',
    },
    floatingActionText: {
      flex: 1,
      fontFamily: 'Poppins-SemiBold',
      fontSize: '20@s',
      color: themeName === 'dark' ? theme.textPrimary : '#FFFFFF',
    },
    floatingActionTextLarge: {
      fontSize: '26@s',
      marginLeft: '1@s',
    },
    floatingActionButton: {
      backgroundColor: '#FFFFFF',
      paddingVertical: '6@vs',
      paddingHorizontal: '16@s',
      borderRadius: '6@ms',
    },
    floatingActionButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.primary,
    },
    floatingClose: {
      marginLeft: '12@s',
      padding: '4@s',
    },
  });



export default UserDashboardScreen;