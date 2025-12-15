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
import { useCategories, useSubcategories } from '../../hooks/useCategories';
import { Category, Subcategory } from '../../services/api/v2/categories';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../services/api/queryKeys';

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
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const styles = useMemo(() => getStyles(theme, themeName, isDark), [theme, themeName, isDark]);

  const queryClient = useQueryClient();
  const { data: categoriesData, isLoading: loadingCategories, error: categoriesError, refetch: refetchCategories } = useCategories('b2c', true);

  // Debug logging for category API
  useEffect(() => {
    console.log('=== Category API Debug ===');
    console.log('Loading:', loadingCategories);
    console.log('Error:', categoriesError);
    console.log('Data:', categoriesData);
    console.log('Categories Data Array:', categoriesData?.data);
    console.log('Categories Count:', categoriesData?.data?.length || 0);
  }, [loadingCategories, categoriesError, categoriesData]);

  useFocusEffect(
    React.useCallback(() => {
      setTabBarVisible(true);
      // Don't hide tab bar on cleanup - tab screens should always show tab bar
    }, [setTabBarVisible])
  );

  useEffect(() => {
    const loadUserData = async () => {
      const data = await getUserData();
      setUserData(data);
    };
    loadUserData();
  }, []);

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

  const allCategories: Category[] = categoriesData?.data || [];
  const [displayedCategories, setDisplayedCategories] = useState<Category[]>([]);

  // Find paper category
  const paperCategory = allCategories.find(
    (cat) => cat.name.toLowerCase().includes('paper')
  );
  const paperCategoryId = paperCategory?.id;

  // Fetch paper subcategories for market rates
  const {
    data: subcategoriesData,
    isLoading: loadingSubcategories,
    error: subcategoriesError
  } = useSubcategories(paperCategoryId, 'b2c', !!paperCategoryId);

  useEffect(() => {
    console.log('All Categories:', allCategories);
    console.log('All Categories Length:', allCategories.length);
    if (allCategories.length > 0) {
      const shuffled = [...allCategories];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, 9);
      console.log('Displayed Categories:', selected);
      setDisplayedCategories(selected);
    } else {
      console.log('No categories available, setting empty array');
      setDisplayedCategories([]);
    }
  }, [allCategories.length, categoriesData?.data]);

  // Transform subcategories to market rates format
  const marketRates = useMemo(() => {
    const subcategories: Subcategory[] = subcategoriesData?.data || [];
    return subcategories.map((sub) => ({
      id: sub.id.toString(),
      name: sub.name,
      price: `₹${sub.default_price}/${sub.price_unit}`,
      image: sub.image,
      trend: 'stable' as 'up' | 'down' | 'stable',
    }));
  }, [subcategoriesData]);

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
    // Navigate to Material Selection Screen with selected categories
    (navigation as any).navigate('MaterialSelection', {
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
          <View style={styles.locationContainer}>
            <View style={styles.locationIconWrapper}>
              <MaterialCommunityIcons name="map-marker" size={14} color="#FFFFFF" />
            </View>
            <View style={styles.locationTextWrapper}>
              <AutoText style={styles.locationLabel}>Delivery at</AutoText>
              <AutoText style={styles.locationText} numberOfLines={1}>
                Shop No 15, Katraj
              </AutoText>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={16} color="#FFFFFF" />
          </View>
          <TouchableOpacity style={styles.profileButton}>
            <MaterialCommunityIcons name="account-circle" size={26} color="#FFFFFF" />
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
            <AutoText style={styles.statValue}>24</AutoText>
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
            <AutoText style={styles.statValue}>₹2.4K</AutoText>
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
            <AutoText style={styles.statValue}>48kg</AutoText>
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
              onPress={() => (navigation as any).navigate('MaterialSelection')}
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
                  // Invalidate and refetch categories
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.categories.byUserType('b2c')
                  });
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
                        {category.image ? (
                          <Image
                            source={{ uri: category.image }}
                            style={styles.categoryIconImage}
                            resizeMode="cover"
                          />
                        ) : (
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

          {loadingSubcategories ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
              <AutoText style={styles.loadingText}>Loading market rates...</AutoText>
            </View>
          ) : subcategoriesError ? (
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
                  onPress={() => (navigation as any).navigate('MaterialSelection')}
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
                  <MaterialCommunityIcons name="gift" size={28} color="#FFFFFF" />
                </View>
                <View style={styles.referralTextSection}>
                  <AutoText style={styles.referralTitle}>Invite Friends</AutoText>
                  <AutoText style={styles.referralSubtitle}>Earn rewards together</AutoText>
                </View>
              </View>
              <View style={styles.referralRight}>
                <AutoText style={styles.referralReward}>₹30</AutoText>
                <AutoText style={styles.referralRewardLabel}>per referral</AutoText>
                <TouchableOpacity style={styles.referralShareButton}>
                  <MaterialCommunityIcons name="share-variant" size={16} color={theme.primary} />
                </TouchableOpacity>
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