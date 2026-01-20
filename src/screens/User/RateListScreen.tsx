import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTabBar } from '../../context/TabBarContext';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { SearchInput } from '../../components/SearchInput';
import { CategoryWithSubcategories, Subcategory } from '../../services/api/v2/categories';
import { useCategoriesWithSubcategories } from '../../hooks/useCategories';

const RateListScreen = () => {
  const { t } = useTranslation();
  const { theme, isDark, themeName } = useTheme();
  const { setTabBarVisible } = useTabBar();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState<number[]>([]);

  // Track if data is being processed/initialized
  const [isInitializing, setIsInitializing] = useState(true);

  const styles = useMemo(() => getStyles(theme, themeName, isDark), [theme, themeName, isDark]);

  // Use the hook with 365-day persisted data - same as UserDashboardScreen
  // This hook automatically:
  // 1. Uses React Query cache (365-day persistence) - shared with UserDashboardScreen
  // 2. If cache exists, uses it immediately without refetching (refetchOnMount: false)
  // 3. Only refetches if cache is missing or expired (after 365 days)
  // 4. When dashboard refetches and gets incremental updates, this screen automatically gets the updated data
  // All screens using this hook share the same React Query cache key and AsyncStorage cache
  // The dashboard handles refetching for incremental updates, RateListScreen just uses the cached data
  // Setting refetchOnMount: false ensures we use cached data without making API calls
  const {
    data: categoriesWithSubcategoriesData,
    isLoading: loadingMaterials
  } = useCategoriesWithSubcategories(undefined, true, false);

  // Ensure tab bar is always visible for this tab screen
  // Note: We don't refetch here - we rely on the 365-day cached data from React Query
  // The dashboard's refetch will update the shared cache, and this screen will automatically see the updates
  useFocusEffect(
    useCallback(() => {
      setTabBarVisible(true);

      // Set status bar using native module configuration
      const statusBarStyle = isDark ? 'light-content' : 'dark-content';
      const statusBarBackground = theme.background;

      StatusBar.setBarStyle(statusBarStyle, true);
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor(statusBarBackground, true);
      }

      // Don't hide on cleanup - tab screens should always show tab bar
    }, [setTabBarVisible, isDark, theme.background])
  );

  // Extract all subcategories from all categories
  const allSubcategories: Subcategory[] = useMemo(() => {
    const categories: CategoryWithSubcategories[] = categoriesWithSubcategoriesData?.data || [];
    const flattened: Subcategory[] = [];

    categories.forEach(category => {
      if (category.subcategories && category.subcategories.length > 0) {
        // Add main_category info to each subcategory
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

  // Set initializing to false once data is ready and processed
  useEffect(() => {
    if (allSubcategories.length > 0) {
      // Data is available, wait for processing to complete (flattening subcategories, etc.)
      const timer = setTimeout(() => {
        setIsInitializing(false);
      }, 100); // Small delay to allow data processing
      return () => clearTimeout(timer);
    } else if (!loadingMaterials && allSubcategories.length === 0) {
      // No data and not loading - set to false
      setIsInitializing(false);
    }
  }, [allSubcategories.length, loadingMaterials]);

  // Filter subcategories based on search
  const filteredSubcategories = useMemo(() => {
    if (searchQuery === '') return allSubcategories;
    return allSubcategories.filter((sub) =>
      sub.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.main_category?.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allSubcategories, searchQuery]);

  const handleMaterialToggle = (materialId: number) => {
    setSelectedMaterials((prev) => {
      if (prev.includes(materialId)) {
        return prev.filter((id) => id !== materialId);
      } else {
        return [...prev, materialId];
      }
    });
  };

  const handleSellNow = () => {
    if (selectedMaterials.length === 0) {
      return;
    }
    // Navigate directly to Upload Images Screen with selected materials
    (navigation as any).navigate('UploadImages', {
      selectedSubcategories: selectedMaterials,
    });
  };

  // Get selected materials details for bottom bar
  const selectedMaterialsDetails = useMemo(() => {
    return allSubcategories.filter((sub) => selectedMaterials.includes(sub.id));
  }, [allSubcategories, selectedMaterials]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <AutoText style={styles.headerTitle}>{t('rateList.title')}</AutoText>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <SearchInput
          placeholder={t('rateList.searchPlaceholder')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
      </View>

      {/* Materials List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {(loadingMaterials || isInitializing) ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AutoText style={styles.loadingText}>{t('rateList.loading')}</AutoText>
          </View>
        ) : filteredSubcategories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="package-variant" size={48} color={theme.textSecondary} />
            <AutoText style={styles.emptyText}>{t('rateList.noMaterialsFound')}</AutoText>
          </View>
        ) : (
          <View style={styles.materialsList}>
            {filteredSubcategories.map((material: Subcategory) => {
              const isSelected = selectedMaterials.includes(material.id);
              return (
                <TouchableOpacity
                  key={material.id}
                  style={[styles.materialCard, isSelected && styles.materialCardSelected]}
                  onPress={() => handleMaterialToggle(material.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.materialCardContent}>
                    <View style={styles.materialImageContainer}>
                      {material.image ? (
                        <Image
                          source={{ uri: material.image }}
                          style={styles.materialImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.materialImagePlaceholder}>
                          <MaterialCommunityIcons
                            name="package-variant"
                            size={24}
                            color={theme.textSecondary}
                          />
                        </View>
                      )}
                    </View>
                    <View style={styles.materialInfo}>
                      <AutoText style={styles.materialName} numberOfLines={1}>
                        {material.name}
                      </AutoText>
                      <View style={styles.materialCategoryRow}>
                        <AutoText style={styles.materialCategory}>
                          {material.main_category?.name || t('rateList.uncategorized')}
                        </AutoText>
                        <AutoText style={styles.materialPrice}>
                          ₹{material.default_price || 0}/{material.price_unit || 'kg'}
                        </AutoText>
                      </View>
                    </View>
                  </View>
                  {isSelected && (
                    <View style={styles.selectedBadge}>
                      <MaterialCommunityIcons name="check-circle" size={20} color={theme.primary} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Bottom Spacing */}
        <View style={{ height: selectedMaterials.length > 0 ? 100 : 20 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      {selectedMaterials.length > 0 && (
        <View style={[styles.bottomActionBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.selectedMaterialsPreview}>
            <View style={styles.previewIconsContainer}>
              {selectedMaterialsDetails.slice(0, 3).map((material, index) => (
                <View
                  key={material.id}
                  style={[
                    styles.previewImageContainer,
                    index > 0 && styles.previewImageOverlap,
                    { zIndex: selectedMaterials.length - index }
                  ]}
                >
                  {material.image ? (
                    <Image
                      source={{ uri: material.image }}
                      style={styles.previewImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <MaterialCommunityIcons
                      name="package-variant"
                      size={20}
                      color={theme.textSecondary}
                    />
                  )}
                </View>
              ))}
              {selectedMaterials.length > 3 && (
                <View style={[styles.previewImageContainer, styles.previewImageOverlap, styles.previewImageMore, { zIndex: 0 }]}>
                  <AutoText style={styles.previewCountText}>+{selectedMaterials.length - 3}</AutoText>
                </View>
              )}
            </View>
            <AutoText style={styles.selectedMaterialsText} numberOfLines={1}>
              {selectedMaterials.length === 1
                ? selectedMaterialsDetails[0]?.name
                : `${selectedMaterials.length} ${t('rateList.materials')}`}
            </AutoText>
          </View>
          <TouchableOpacity
            style={styles.sellNowButton}
            onPress={handleSellNow}
            activeOpacity={0.8}
          >
            <AutoText style={styles.sellNowButtonText}>{t('rateList.sellNow')}</AutoText>
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
    header: {
      paddingHorizontal: '16@s',
      paddingVertical: '16@vs',
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '24@s',
      color: theme.textPrimary,
      textAlign: 'center',
    },
    searchContainer: {
      paddingHorizontal: '16@s',
      paddingVertical: '12@vs',
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    searchInput: {
      backgroundColor: theme.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: '16@s',
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: '60@vs',
      gap: '12@s',
    },
    loadingText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: '60@vs',
      gap: '12@s',
    },
    emptyText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    materialsList: {
      gap: '12@vs',
    },
    materialCard: {
      backgroundColor: theme.card,
      borderRadius: '10@ms',
      padding: '12@s',
      marginBottom: '10@vs',
      borderWidth: 1,
      borderColor: theme.border,
    },
    materialCardSelected: {
      borderWidth: 3,
      borderColor: theme.primary,
    },
    materialCardContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '12@s',
    },
    materialImageContainer: {
      width: '50@s',
      height: '50@vs',
      borderRadius: '8@ms',
      overflow: 'hidden',
    },
    materialImage: {
      width: '100%',
      height: '100%',
    },
    materialImagePlaceholder: {
      width: '100%',
      height: '100%',
      backgroundColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    materialInfo: {
      flex: 1,
    },
    materialName: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '4@vs',
    },
    materialCategoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    materialCategory: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      flex: 1,
    },
    materialPrice: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.primary,
      marginLeft: '8@s',
    },
    selectedBadge: {
      position: 'absolute',
      top: '8@vs',
      right: '8@s',
    },
    bottomActionBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.primary,
      paddingHorizontal: '16@s',
      paddingTop: '12@vs',
      flexDirection: 'row',
      alignItems: 'center',
      gap: '12@s',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 8,
    },
    selectedMaterialsPreview: {
      flex: 1,
      gap: '4@vs',
    },
    previewIconsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      height: '32@vs',
    },
    previewImageContainer: {
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
    previewImageOverlap: {
      marginLeft: '-12@s',
    },
    previewImageMore: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewCountText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '10@s',
      color: '#FFFFFF',
    },
    selectedMaterialsText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: '#FFFFFF',
    },
    sellNowButton: {
      backgroundColor: '#FFFFFF',
      paddingVertical: '6@vs',
      paddingHorizontal: '16@s',
      borderRadius: '6@ms',
    },
    sellNowButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.primary,
    },
  });

export default RateListScreen;
