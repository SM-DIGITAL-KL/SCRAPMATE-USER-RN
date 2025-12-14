import React, { useState, useMemo, useEffect } from 'react';
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
import { useCategories } from '../../hooks/useCategories';
import { Category } from '../../services/api/v2/categories';
import dashboardImage from '../../assets/images/dashbaoard.png';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Category colors that repeat in pattern - light theme
const categoryColorsLight = [
  '#FFE5B4', // Peach/beige
  '#B3E5FC', // Light blue
  '#FFB3BA', // Light pink
  '#FFF9C4', // Pale yellow
  '#B3E5FC', // Light blue (repeat)
];

// Category colors for dark themes - darker muted colors
const categoryColorsDark = [
  '#1B5E20', // Dark green
  '#2E7D32', // Medium green
  '#388E3C', // Lighter green
  '#1B5E20', // Dark green (repeat)
  '#2E7D32', // Medium green (repeat)
];

// Get category card color based on index and theme (repeating pattern)
const getCategoryCardColor = (index: number, isDark?: boolean): string => {
  const colors = isDark ? categoryColorsDark : categoryColorsLight;
  return colors[index % colors.length];
};

// Text color based on theme
const getCategoryTextColor = (isDark?: boolean): string => {
  return isDark ? '#E8F5E9' : '#1B1B1B'; // Light text for dark theme, dark text for light theme
};

// Fallback category icons
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
  const styles = useMemo(() => getStyles(theme, themeName, isDark), [theme, themeName, isDark]);

  // Fetch categories from API for user type 'U' (b2c)
  const { data: categoriesData, isLoading: loadingCategories, error: categoriesError } = useCategories('b2c', true);

  useFocusEffect(
    React.useCallback(() => {
      setTabBarVisible(true);
      return () => {
        setTabBarVisible(false);
      };
    }, [setTabBarVisible])
  );

  useEffect(() => {
    const loadUserData = async () => {
      const data = await getUserData();
      setUserData(data);
    };
    loadUserData();
  }, []);

  // Get categories from API, shuffle and take 5 random ones
  const allCategories: Category[] = categoriesData?.data || [];
  const [displayedCategories, setDisplayedCategories] = useState<Category[]>([]);

  // Shuffle and select 5 random categories when data loads
  useEffect(() => {
    if (allCategories.length > 0) {
      // Shuffle array using Fisher-Yates algorithm for better randomization
      const shuffled = [...allCategories];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      // Take first 5
      setDisplayedCategories(shuffled.slice(0, 5));
    } else {
      setDisplayedCategories([]);
    }
  }, [allCategories.length, categoriesData?.data]);

  const trendingRates: TrendingRate[] = [
    { id: '1', name: 'Newspaper', price: '₹8/kg' },
    { id: '2', name: 'White Paper', price: '₹8/kg' },
    { id: '3', name: 'Carton', price: '₹4/kg' },
    { id: '4', name: 'Copy', price: '₹10/kg' },
    { id: '5', name: 'Grey Board', price: '₹0/kg' },
    { id: '6', name: 'Other', price: '₹0/kg' },
  ];

  const handleCategorySelect = (categoryId: number) => {
    setSelectedCategories((prev) => {
      if (prev.includes(categoryId)) {
        // Remove if already selected
        return prev.filter((id) => id !== categoryId);
      } else {
        // Add if not selected
        return [...prev, categoryId];
      }
    });
  };

  const handleSellNow = () => {
    // Navigate to sell screen with selected categories
    if (selectedCategories.length > 0) {
      // navigation.navigate('SellScrap', { categories: selectedCategories });
      console.log('Navigate to sell screen with categories:', selectedCategories);
    }
  };

  const getHeaderBackgroundColor = () => {
    // For midnight black theme only, use dark background instead of colored
    if (themeName === 'dark') {
      return theme.background; // Use theme background (black) for midnight black
    }
    if (themeName === 'darkGreen') return '#2E7D32';
    if (themeName === 'whitePurple') return '#7B1FA2';
    return theme.primary;
  };

  const headerBgColor = getHeaderBackgroundColor();
  
  // Determine status bar style based on theme
  const getStatusBarStyle = () => {
    if (themeName === 'dark') return 'light-content';
    if (themeName === 'darkGreen') return 'light-content';
    if (themeName === 'whitePurple') return 'light-content';
    return 'dark-content';
  };
  
  // Use useFocusEffect to ensure StatusBar persists when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      const statusBarStyle = getStatusBarStyle();
      
      // Set StatusBar for this screen
      StatusBar.setBarStyle(statusBarStyle, true);
      
      // On Android, set the background color to match header
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor(headerBgColor, true);
      }
      
      // Cleanup: restore default when screen loses focus (optional)
      return () => {
        // You can optionally restore a default status bar here
        // For now, we'll let other screens set their own
      };
    }, [headerBgColor, themeName])
  );
  
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={getStatusBarStyle()}
        backgroundColor={headerBgColor}
        translucent={false}
      />

      {/* Header Section with Location and Promotional Banner */}
      <View style={[styles.headerSection, { backgroundColor: headerBgColor }]}>
        {/* Location Bar */}
        <View style={styles.locationBar}>
          <MaterialCommunityIcons
            name="map-marker"
            size={20}
            color={themeName === 'dark' ? theme.textPrimary : (isDark ? theme.textPrimary : '#FFFFFF')}
          />
          <AutoText style={styles.locationText} numberOfLines={1}>
            Shop No 15, Katraj, Be...
          </AutoText>
          <MaterialCommunityIcons
            name="chevron-down"
            size={20}
            color={isDark ? theme.textPrimary : '#FFFFFF'}
          />
        </View>

        {/* Promotional Banner */}
        <View style={styles.bannerContainer}>
          <View style={styles.bannerContent}>
            <AutoText style={styles.bannerTitle}>Sell scrap in seconds!</AutoText>
            <TouchableOpacity
              style={styles.sellNowButton}
              onPress={handleSellNow}
              activeOpacity={0.8}
            >
              <AutoText style={styles.sellNowButtonText}>Sell Now →</AutoText>
            </TouchableOpacity>
          </View>
          {/* Dashboard illustration image */}
          <View style={styles.bannerIllustration}>
            <Image
              source={dashboardImage}
              style={styles.bannerImage}
              resizeMode="contain"
            />
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* What do you want to sell? Section */}
        <View style={styles.section}>
          <AutoText style={styles.sectionTitle}>What do you want to sell?</AutoText>
          <AutoText style={styles.sectionSubtitle}>
            Select scrap categories you want to sell
          </AutoText>

          {loadingCategories ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <AutoText style={styles.loadingText}>Loading categories...</AutoText>
            </View>
          ) : categoriesError ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle" size={32} color={theme.textSecondary} />
              <AutoText style={styles.errorText}>Failed to load categories</AutoText>
            </View>
          ) : displayedCategories.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="package-variant" size={32} color={theme.textSecondary} />
              <AutoText style={styles.emptyText}>No categories available</AutoText>
            </View>
          ) : (
            <View style={styles.categoriesGrid}>
              {displayedCategories.map((category, index) => {
                const isSelected = selectedCategories.includes(category.id);
                const categoryColor = getCategoryCardColor(index, themeName === 'dark');
                const categoryIcon = getCategoryIcon(category.name);
                const categoryTextColor = getCategoryTextColor(themeName === 'dark');
                return (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categoryCard,
                      { backgroundColor: categoryColor },
                      isSelected && styles.categoryCardSelected,
                    ]}
                    onPress={() => handleCategorySelect(category.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.categoryIconContainer, { borderColor: 'rgba(0, 0, 0, 0.1)' }]}>
                      {category.image ? (
                        <Image
                          source={{ uri: category.image }}
                          style={styles.categoryImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <MaterialCommunityIcons
                          name={categoryIcon}
                          size={32}
                          color={categoryTextColor}
                        />
                      )}
                    </View>
                    <AutoText style={[styles.categoryName, { color: categoryTextColor }]}>
                      {category.name}
                    </AutoText>
                    <View style={styles.categorySelector}>
                      {isSelected ? (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={20}
                          color={theme.primary}
                        />
                      ) : (
                        <View style={[styles.categorySelectorEmpty, { borderColor: categoryTextColor }]} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Trending Rates Section */}
        <View style={styles.section}>
          <AutoText style={styles.sectionTitle}>Trending rates</AutoText>
          <AutoText style={styles.sectionSubtitle}>
            These rates are provided by Scrapmate in your area
          </AutoText>

          <View style={styles.ratesGrid}>
            {trendingRates.map((rate) => (
              <TouchableOpacity
                key={rate.id}
                style={styles.rateCard}
                activeOpacity={0.7}
              >
                <View style={styles.rateImagePlaceholder}>
                  <MaterialCommunityIcons
                    name="package-variant"
                    size={32}
                    color={theme.textSecondary}
                  />
                </View>
                <AutoText style={styles.rateName} numberOfLines={1}>
                  {rate.name}
                </AutoText>
                <AutoText style={styles.ratePrice}>{rate.price}</AutoText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Vehicle Scrapping Section */}
        <View style={styles.section}>
          <AutoText style={styles.sectionTitle}>Want to scrap your vehicle?</AutoText>
          <AutoText style={styles.sectionSubtitle}>
            Scrap your vehicle in less time with Scrapmate. We offer best rates and compliance
            with transparency
          </AutoText>

          <View style={styles.featureTags}>
            <View style={styles.featureTag}>
              <MaterialCommunityIcons name="currency-inr" size={16} color={theme.primary} />
              <AutoText style={styles.featureTagText}>BEST RATES</AutoText>
            </View>
            <View style={styles.featureTag}>
              <MaterialCommunityIcons name="file-check" size={16} color={theme.primary} />
              <AutoText style={styles.featureTagText}>COMPLIANCE</AutoText>
            </View>
            <View style={styles.featureTag}>
              <MaterialCommunityIcons name="magnify" size={16} color={theme.primary} />
              <AutoText style={styles.featureTagText}>TRANSPARENCY</AutoText>
            </View>
          </View>

          <TouchableOpacity
            style={styles.vehicleCard}
            activeOpacity={0.8}
          >
            <AutoText style={styles.vehicleCardTitle}>Vehicle Scrapping Made Easy!</AutoText>
            <AutoText style={styles.vehicleCardSubtitle}>
              You can scrap any type of vehicle from 2 wheelers to heavy vehicles
            </AutoText>
            <View style={styles.vehicleCardButton}>
              <AutoText style={styles.vehicleCardButtonText}>Scrap your vehicle →</AutoText>
            </View>
          </TouchableOpacity>
        </View>

        {/* Referral Section */}
        <View style={styles.section}>
          <AutoText style={styles.sectionTitle}>Refer your friends & Earn</AutoText>
          <AutoText style={styles.sectionSubtitle}>Earn ₹30 on each successful referral.</AutoText>

          <TouchableOpacity style={styles.referralCard} activeOpacity={0.8}>
            <View style={styles.referralContent}>
              <View style={styles.referralLogo}>
                <AutoText style={styles.referralLogoText}>S</AutoText>
              </View>
              <View style={styles.referralTextContainer}>
                <AutoText style={styles.referralTitle}>Refer & Earn</AutoText>
                <AutoText style={styles.referralAmount}>₹30</AutoText>
              </View>
            </View>
            <TouchableOpacity style={styles.referralButton} activeOpacity={0.8}>
              <AutoText style={styles.referralButtonText}>Refer Now →</AutoText>
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Floating Action Bar (shown when categories are selected) */}
      {selectedCategories.length > 0 && (
        <View style={styles.floatingActionBar}>
          <View style={styles.floatingActionContent}>
            <View style={styles.floatingActionImagesContainer}>
              {selectedCategories.slice(0, 3).map((categoryId, index) => {
                const category = displayedCategories.find((c) => c.id === categoryId);
                if (!category) return null;
                
                return (
                  <View
                    key={categoryId}
                    style={[
                      styles.floatingActionImage,
                      index > 0 && styles.floatingActionImageOverlap,
                      { zIndex: 3 - index },
                    ]}
                  >
                    {category.image ? (
                      <Image
                        source={{ uri: category.image }}
                        style={styles.floatingActionImageContent}
                        resizeMode="cover"
                      />
                    ) : (
                      <MaterialCommunityIcons
                        name={getCategoryIcon(category.name)}
                        size={24}
                        color={themeName === 'dark' ? theme.textPrimary : '#FFFFFF'}
                      />
                    )}
                  </View>
                );
              })}
              {selectedCategories.length > 3 && (
                <View style={[styles.floatingActionImage, styles.floatingActionImageOverlap, styles.floatingActionImageMore, { zIndex: 0 }]}>
                  <AutoText style={styles.floatingActionImageMoreText}>
                    +{selectedCategories.length - 3}
                  </AutoText>
                </View>
              )}
            </View>
            <AutoText style={styles.floatingActionText}>
              {selectedCategories.length === 1
                ? displayedCategories.find((c) => selectedCategories.includes(c.id))?.name
                : `${selectedCategories.length} Categories`}
            </AutoText>
            <TouchableOpacity
              style={styles.floatingActionButton}
              onPress={handleSellNow}
              activeOpacity={0.8}
            >
              <AutoText style={styles.floatingActionButtonText}>Sell Now</AutoText>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.floatingActionClose}
            onPress={() => setSelectedCategories([])}
          >
            <MaterialCommunityIcons 
              name="close" 
              size={20} 
              color={themeName === 'dark' ? theme.textPrimary : '#FFFFFF'} 
            />
          </TouchableOpacity>
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
    headerSection: {
      paddingHorizontal: '18@s',
      paddingBottom: '20@vs',
    },
    locationBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: '12@vs',
      marginBottom: '16@vs',
    },
    locationText: {
      flex: 1,
      marginLeft: '8@s',
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: isDark ? theme.textPrimary : '#FFFFFF',
    },
    bannerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    bannerContent: {
      flex: 1,
    },
    bannerTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '24@s',
      color: themeName === 'dark' ? theme.textPrimary : '#FFFFFF',
      marginBottom: '12@vs',
    },
    sellNowButton: {
      backgroundColor: themeName === 'dark' ? theme.card : '#FFFFFF',
      paddingVertical: '10@vs',
      paddingHorizontal: '20@s',
      borderRadius: '8@ms',
      borderWidth: 1,
      borderColor: themeName === 'dark' ? theme.border : '#FFFFFF',
      alignSelf: 'flex-start',
    },
    sellNowButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: themeName === 'dark' ? theme.textPrimary : theme.primary,
    },
    bannerIllustration: {
      width: '120@s',
      height: '120@vs',
      backgroundColor: themeName === 'dark' 
        ? 'rgba(255, 255, 255, 0.05)' 
        : 'rgba(255, 255, 255, 0.1)',
      borderRadius: '12@ms',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    bannerImage: {
      width: '100%',
      height: '100%',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: '20@vs',
    },
    section: {
      paddingHorizontal: '18@s',
      paddingTop: '24@vs',
    },
    sectionTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '20@s',
      color: theme.textPrimary,
      marginBottom: '8@vs',
    },
    sectionSubtitle: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      marginBottom: '16@vs',
    },
    categoriesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    categoryCard: {
      width: (SCREEN_WIDTH - 54) / 2,
      height: '120@vs',
      borderRadius: '16@ms',
      padding: '16@s',
      marginBottom: '12@vs',
      position: 'relative',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 4,
      borderWidth: 1,
      borderColor: 'rgba(0, 0, 0, 0.05)',
    },
    categoryCardSelected: {
      borderWidth: 2,
      borderColor: theme.primary,
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
    },
    categoryIconContainer: {
      marginBottom: '8@vs',
      width: '56@s',
      height: '56@vs',
      borderRadius: '8@ms',
      overflow: 'hidden',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(0, 0, 0, 0.05)',
    },
    categoryImage: {
      width: '100%',
      height: '100%',
    },
    loadingContainer: {
      paddingVertical: '40@vs',
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
      paddingVertical: '40@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorText: {
      marginTop: '12@vs',
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    emptyContainer: {
      paddingVertical: '40@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      marginTop: '12@vs',
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    categoryName: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      // Color is set dynamically based on theme
    },
    categorySelector: {
      position: 'absolute',
      top: '12@vs',
      right: '12@s',
    },
    categorySelectorEmpty: {
      width: '20@s',
      height: '20@vs',
      borderRadius: '10@s',
      borderWidth: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    ratesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    rateCard: {
      width: (SCREEN_WIDTH - 54) / 3,
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '12@s',
      marginBottom: '12@vs',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    rateImagePlaceholder: {
      width: '48@s',
      height: '48@vs',
      borderRadius: '8@ms',
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '8@vs',
    },
    rateName: {
      fontFamily: 'Poppins-Medium',
      fontSize: '11@s',
      color: theme.textPrimary,
      marginBottom: '4@vs',
      textAlign: 'center',
    },
    ratePrice: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: theme.primary,
    },
    featureTags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: '16@vs',
    },
    featureTag: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: '6@vs',
      paddingHorizontal: '12@s',
      borderRadius: '20@ms',
      borderWidth: 1,
      borderColor: theme.primary,
      marginRight: '8@s',
      marginBottom: '8@vs',
    },
    featureTagText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '11@s',
      color: theme.primary,
      marginLeft: '4@s',
    },
    vehicleCard: {
      backgroundColor: themeName === 'darkGreen' ? '#1B5E20' : theme.card,
      borderRadius: '16@ms',
      padding: '20@s',
      marginTop: '12@vs',
      borderWidth: themeName === 'dark' ? 1 : 0,
      borderColor: themeName === 'dark' ? theme.border : 'transparent',
    },
    vehicleCardTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '18@s',
      color: themeName === 'dark' ? theme.textPrimary : (isDark ? theme.textPrimary : '#FFFFFF'),
      marginBottom: '8@vs',
    },
    vehicleCardSubtitle: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: themeName === 'dark' ? theme.textSecondary : (isDark ? theme.textSecondary : 'rgba(255, 255, 255, 0.8)'),
      marginBottom: '16@vs',
    },
    vehicleCardButton: {
      alignSelf: 'flex-start',
    },
    vehicleCardButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: themeName === 'dark' ? theme.textPrimary : (isDark ? theme.textPrimary : '#FFFFFF'),
    },
    referralCard: {
      backgroundColor: themeName === 'whitePurple' ? '#E1BEE7' : (themeName === 'dark' ? theme.card : theme.primary),
      borderRadius: '16@ms',
      padding: '20@s',
      marginTop: '12@vs',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: themeName === 'dark' ? 1 : 0,
      borderColor: themeName === 'dark' ? theme.border : 'transparent',
    },
    referralContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    referralLogo: {
      width: '48@s',
      height: '48@vs',
      borderRadius: '24@s',
      backgroundColor: themeName === 'dark' ? theme.primary : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: '12@s',
    },
    referralLogoText: {
      fontFamily: 'Poppins-Bold',
      fontSize: '20@s',
      color: themeName === 'dark' ? theme.background : theme.primary,
    },
    referralTextContainer: {
      flex: 1,
    },
    referralTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '16@s',
      color: themeName === 'dark' ? theme.textPrimary : '#FFFFFF',
      marginBottom: '4@vs',
    },
    referralAmount: {
      fontFamily: 'Poppins-Bold',
      fontSize: '28@s',
      color: themeName === 'dark' ? theme.textPrimary : '#FFFFFF',
    },
    referralButton: {
      paddingVertical: '10@vs',
      paddingHorizontal: '16@s',
      borderRadius: '8@ms',
      borderWidth: 1,
      borderColor: themeName === 'dark' ? theme.border : '#FFFFFF',
    },
    referralButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: themeName === 'dark' ? theme.textPrimary : '#FFFFFF',
    },
    floatingActionBar: {
      position: 'absolute',
      bottom: '30@vs',
      left: '18@s',
      right: '18@s',
      backgroundColor: themeName === 'dark' ? theme.card : theme.primary,
      borderRadius: '12@ms',
      padding: '12@s',
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
      borderWidth: themeName === 'dark' ? 1 : 0,
      borderColor: themeName === 'dark' ? theme.border : 'transparent',
    },
    floatingActionContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    floatingActionImagesContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: '12@s',
      height: '32@vs',
    },
    floatingActionImage: {
      width: '32@s',
      height: '32@vs',
      borderRadius: '16@s',
      backgroundColor: themeName === 'dark' 
        ? 'rgba(255, 255, 255, 0.1)' 
        : 'rgba(255, 255, 255, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: themeName === 'dark' ? theme.border : theme.primary,
    },
    floatingActionImageOverlap: {
      marginLeft: '-12@s',
    },
    floatingActionImageContent: {
      width: '100%',
      height: '100%',
    },
    floatingActionImageMore: {
      backgroundColor: themeName === 'dark' 
        ? 'rgba(255, 255, 255, 0.2)' 
        : 'rgba(0, 0, 0, 0.3)',
    },
    floatingActionImageMoreText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '10@s',
      color: themeName === 'dark' ? theme.textPrimary : '#FFFFFF',
    },
    floatingActionText: {
      flex: 1,
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: themeName === 'dark' ? theme.textPrimary : '#FFFFFF',
    },
    floatingActionButton: {
      backgroundColor: themeName === 'dark' ? theme.primary : '#FFFFFF',
      paddingVertical: '6@vs',
      paddingHorizontal: '16@s',
      borderRadius: '6@ms',
    },
    floatingActionButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: themeName === 'dark' ? theme.background : theme.primary,
    },
    floatingActionClose: {
      marginLeft: '12@s',
      padding: '4@s',
    },
  });

export default UserDashboardScreen;
