import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { UserRootStackParamList } from '../../navigation/UserTabNavigator';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTabBar } from '../../context/TabBarContext';
import { getCategoriesWithSubcategories, CategoryWithSubcategories } from '../../services/api/v2/categories';
import { SearchInput } from '../../components/SearchInput';
import { useApiQuery } from '../../hooks';

// Helper function to add opacity to hex color
const addOpacityToHex = (hex: string, opacity: number): string => {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const getCategoryIcon = (categoryName: string): string => {
  const name = categoryName.toLowerCase();
  if (name.includes('paper')) return 'file-document-outline';
  if (name.includes('plastic')) return 'bottle-soda-outline';
  if (name.includes('metal')) return 'wrench-outline';
  if (name.includes('e-waste') || name.includes('ewaste') || name.includes('electronic')) return 'monitor';
  return 'package-variant';
};

const MaterialSelectionScreen = () => {
  const { theme, isDark, themeName } = useTheme();
  const { setTabBarVisible } = useTabBar();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = route.params as UserRootStackParamList['MaterialSelection'] & {
    allCategoriesWithSubcategories?: CategoryWithSubcategories[];
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState<number[]>([]); // Array to support multi-selection (for UI)
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<number | undefined>(undefined); // The category whose subcategories are currently displayed (last selected)
  const [selectedSubcategories, setSelectedSubcategories] = useState<number[]>([]);
  
  // Ref for horizontal ScrollView to scroll to selected categories
  const categoryFiltersScrollViewRef = useRef<ScrollView>(null);
  // Store positions of category buttons for scrolling
  const categoryButtonPositions = useRef<Map<number, number>>(new Map());
  // Track which route params we've already scrolled for
  const scrolledRouteParams = useRef<number[] | null>(null);
  
  const styles = useMemo(() => getStyles(theme, themeName, isDark), [theme, themeName, isDark]);

  // Use data from route params if available, otherwise fetch (fallback)
  const hasRouteData = routeParams?.allCategoriesWithSubcategories && routeParams.allCategoriesWithSubcategories.length > 0;
  
  const { 
    data: categoriesWithSubcategoriesData, 
    isLoading: loadingSubcategoriesFallback,
    error: subcategoriesErrorFallback,
  } = useApiQuery({
    queryKey: ['categories-with-subcategories', 'b2c', 'fallback'],
    queryFn: () => getCategoriesWithSubcategories('b2c'),
    enabled: !hasRouteData, // Only fetch if no route data
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const allCategoriesWithSubcategories = hasRouteData 
    ? (routeParams.allCategoriesWithSubcategories as CategoryWithSubcategories[])
    : (categoriesWithSubcategoriesData?.data || []);
  const loadingSubcategories = hasRouteData ? false : loadingSubcategoriesFallback;
  const subcategoriesError = hasRouteData ? null : subcategoriesErrorFallback;
  
  // Track if data is being processed/initialized
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Set initializing to false once data is ready and processed
  useEffect(() => {
    if (allCategoriesWithSubcategories.length > 0) {
      // Data is available, wait for processing to complete (flattening subcategories, etc.)
      const timer = setTimeout(() => {
        setIsInitializing(false);
      }, 100); // Small delay to allow data processing
      return () => clearTimeout(timer);
    } else if (!loadingSubcategories && allCategoriesWithSubcategories.length === 0) {
      // No data and not loading - set to false
      setIsInitializing(false);
    }
  }, [allCategoriesWithSubcategories.length, loadingSubcategories]);
  
  // Memoize categories list to avoid recreating on every render
  const allCategories = useMemo(() => 
    allCategoriesWithSubcategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      image: cat.image,
      available_in: cat.available_in,
    })),
    [allCategoriesWithSubcategories]
  );

  // Flatten all subcategories from all categories - optimized for performance
  const allSubcategories = useMemo(() => {
    const flattened: Array<{
      id: number;
      name: string;
      image: string;
      default_price: string;
      price_unit: string;
      main_category_id: number;
      main_category?: { id: number; name: string; image: string };
      available_in: { b2b: boolean; b2c: boolean };
    }> = [];
    
    // Optimize: Pre-create main_category objects once per category to avoid repeated object creation
    allCategoriesWithSubcategories.forEach(category => {
      const categoryId = Number(category.id);
      const subcategories = category.subcategories || [];
      
      if (subcategories.length === 0) return;
      
      // Pre-create main_category object once per category (shared reference)
      const mainCategoryInfo = {
        id: categoryId,
        name: category.name,
        image: category.image,
      };
      
      // Use for loop instead of forEach for slightly better performance
      for (let i = 0; i < subcategories.length; i++) {
        const sub = subcategories[i];
        flattened.push({
          ...sub,
          main_category_id: categoryId,
          main_category: mainCategoryInfo,
        });
      }
    });
    
    return flattened;
  }, [allCategoriesWithSubcategories]);

  // Set category filters based on route params
  useEffect(() => {
    if (routeParams?.selectedCategories && routeParams.selectedCategories.length > 0) {
      const routeCategories = routeParams.selectedCategories;
      const routeCategoriesKey = JSON.stringify(routeCategories.sort());
      const scrolledKey = scrolledRouteParams.current ? JSON.stringify(scrolledRouteParams.current.sort()) : null;
      
      const isNewRouteParams = routeCategoriesKey !== scrolledKey;
      
      setSelectedCategoryFilters(routeCategories);
      
      if (isNewRouteParams) {
        scrolledRouteParams.current = routeCategories;
        
        setTimeout(() => {
          const firstSelectedCategoryId = routeCategories[0];
          if (!firstSelectedCategoryId) return;
          const buttonX = categoryButtonPositions.current.get(firstSelectedCategoryId);
          if (buttonX !== undefined && categoryFiltersScrollViewRef.current) {
            categoryFiltersScrollViewRef.current.scrollTo({
              x: Math.max(0, buttonX - 20),
              animated: true,
            });
          } else {
            setTimeout(() => {
              const retryX = categoryButtonPositions.current.get(firstSelectedCategoryId);
              if (retryX !== undefined && categoryFiltersScrollViewRef.current) {
                categoryFiltersScrollViewRef.current.scrollTo({
                  x: Math.max(0, retryX - 20),
                  animated: true,
                });
              }
            }, 500);
          }
        }, 300);
      }
    }
  }, [routeParams?.selectedCategories]);

  // Update active category when selection changes - use the last selected category
  useEffect(() => {
    if (selectedCategoryFilters.length > 0) {
      // Use the last selected category as the active one
      const lastSelected = selectedCategoryFilters[selectedCategoryFilters.length - 1];
      setActiveCategoryFilter(lastSelected);
    } else {
      setActiveCategoryFilter(undefined);
    }
  }, [selectedCategoryFilters]);

  // Auto-scroll to active category button when it changes
  useEffect(() => {
    if (activeCategoryFilter !== undefined && categoryFiltersScrollViewRef.current) {
      // Wait a bit for layout to complete
      setTimeout(() => {
        const buttonX = categoryButtonPositions.current.get(activeCategoryFilter);
        if (buttonX !== undefined && categoryFiltersScrollViewRef.current) {
          // Scroll to show the button with some padding
          const scrollPosition = Math.max(0, buttonX - 20); // 20px padding from left
          categoryFiltersScrollViewRef.current.scrollTo({
            x: scrollPosition,
            animated: true,
          });
        } else {
          // Retry after a longer delay if position not found yet
          setTimeout(() => {
            const retryX = categoryButtonPositions.current.get(activeCategoryFilter);
            if (retryX !== undefined && categoryFiltersScrollViewRef.current) {
              const scrollPosition = Math.max(0, retryX - 20);
              categoryFiltersScrollViewRef.current.scrollTo({
                x: scrollPosition,
                animated: true,
              });
            }
          }, 300);
        }
      }, 100);
    }
  }, [activeCategoryFilter]);

  // Filter subcategories based on active category and search query
  const filteredSubcategories = useMemo(() => {
    let filtered = allSubcategories;

    // Filter by active category (last selected category)
    if (activeCategoryFilter !== undefined) {
      const activeCategoryId = Number(activeCategoryFilter);
      // Use filter with early return for better performance
      filtered = filtered.filter(sub => Number(sub.main_category_id) === activeCategoryId);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(sub => 
        sub.name.toLowerCase().includes(query) ||
        sub.main_category?.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [allSubcategories, activeCategoryFilter, searchQuery]);

  const handleSubcategoryToggle = (subcategoryId: number) => {
    setSelectedSubcategories((prev) => {
      if (prev.includes(subcategoryId)) {
        return prev.filter((id) => id !== subcategoryId);
      } else {
        return [...prev, subcategoryId];
      }
    });
  };

  const handleContinue = () => {
    (navigation as any).navigate('UploadImages', {
      selectedSubcategories: selectedSubcategories
    });
  };

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
          Choose Materials
        </AutoText>
        <View style={styles.backButton} />
      </View>

      {/* Search Bar - Fixed at top, outside ScrollView */}
        <View style={styles.searchContainer}>
          <SearchInput
            placeholder="Search materials"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Category Filters */}
        <ScrollView
          ref={categoryFiltersScrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryFiltersContainer}
        >
          <TouchableOpacity
            style={[
              styles.categoryFilterChip,
              selectedCategoryFilters.length === 0 && styles.categoryFilterChipActive
            ]}
            onPress={() => {
              setSelectedCategoryFilters([]);
            }}
            activeOpacity={0.7}
          >
            <AutoText style={[
              styles.categoryFilterText,
              selectedCategoryFilters.length === 0 && styles.categoryFilterTextActive
            ]}>
              All
            </AutoText>
          </TouchableOpacity>
          {allCategories.map((category) => {
            const categoryId = Number(category.id); // Normalize to number
            const isSelected = selectedCategoryFilters.some(id => Number(id) === categoryId);
            return (
              <TouchableOpacity
                key={category.id}
                onLayout={(event: any) => {
                  const { x } = event.nativeEvent.layout;
                  categoryButtonPositions.current.set(categoryId, x);
                }}
                style={[
                  styles.categoryFilterChip,
                  isSelected && styles.categoryFilterChipActive
                ]}
                onPress={() => {
                  // Multi-select: clicking a category toggles its selection
                  setSelectedCategoryFilters(prev => {
                    const prevNumeric = prev.map(id => Number(id));
                    const categoryIdNum = Number(categoryId);
                    
                    if (prevNumeric.includes(categoryIdNum)) {
                      return prev.filter(id => Number(id) !== categoryIdNum);
                    } else {
                      return [...prev, categoryIdNum];
                    }
                  });
                }}
                activeOpacity={0.7}
              >
                <AutoText style={[
                  styles.categoryFilterText,
                  isSelected && styles.categoryFilterTextActive
                ]}>
                  {category.name}
                </AutoText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Materials List */}
        {(loadingSubcategories || isInitializing) ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AutoText style={styles.loadingText}>Loading materials...</AutoText>
          </View>
        ) : filteredSubcategories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="package-variant" size={48} color={theme.textSecondary} />
            <AutoText style={styles.emptyText}>
              {selectedCategoryFilters.length > 0 
                ? 'No materials found in selected categories' 
                : searchQuery.trim() 
                  ? 'No materials found' 
                  : 'No materials available'}
            </AutoText>
          </View>
        ) : (
          <View style={styles.materialsList}>
            {filteredSubcategories.map((subcategory) => {
              const isSelected = selectedSubcategories.includes(subcategory.id);
              return (
                <View key={subcategory.id} style={styles.materialItem}>
                  <View style={styles.materialItemLeft}>
                    <View style={styles.materialImageContainer}>
                      {subcategory.image ? (
                        <Image
                          source={{ uri: subcategory.image }}
                          style={styles.materialImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <MaterialCommunityIcons
                          name={getCategoryIcon(subcategory.main_category?.name || '')}
                          size={32}
                          color={theme.primary}
                        />
                      )}
                    </View>
                    <View style={styles.materialInfo}>
                      <AutoText style={styles.materialName} numberOfLines={1}>
                        {subcategory.name}
                      </AutoText>
                      <AutoText style={styles.materialPrice}>
                        ₹{subcategory.default_price} per {subcategory.price_unit}
                      </AutoText>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.materialActionButton,
                      isSelected && styles.materialActionButtonSelected
                    ]}
                    onPress={() => handleSubcategoryToggle(subcategory.id)}
                    activeOpacity={0.7}
                  >
                    <AutoText style={[
                      styles.materialActionText,
                      isSelected && styles.materialActionTextSelected
                    ]}>
                      {isSelected ? 'Remove' : 'Add'}
                    </AutoText>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Bottom Spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Selection Summary Footer */}
      {selectedSubcategories.length > 0 && (
        <View style={styles.selectionFooter}>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <View style={styles.continueButtonContent}>
              {/* Selected Materials Preview */}
              <View style={styles.selectedMaterialsPreview}>
                {selectedSubcategories.slice(0, 2).map((subcategoryId, index) => {
                  const subcategory = allSubcategories.find(sub => sub.id === subcategoryId);
                  if (!subcategory) return null;
                  
                  return (
                    <View key={subcategoryId} style={[styles.selectedMaterialBadge, index > 0 && styles.selectedMaterialBadgeOverlap]}>
                      {subcategory.image ? (
                        <Image
                          source={{ uri: subcategory.image }}
                          style={styles.selectedMaterialImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.selectedMaterialIconContainer}>
                          <MaterialCommunityIcons
                            name={getCategoryIcon(subcategory.main_category?.name || '')}
                            size={14}
                            color={theme.primary}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
                {selectedSubcategories.length > 2 && (
                  <View style={[styles.selectedMaterialBadge, styles.selectedMaterialBadgeOverlap, styles.selectedMaterialMore]}>
                    <AutoText style={styles.selectedMaterialMoreText}>
                      +{selectedSubcategories.length - 2}
                    </AutoText>
                  </View>
                )}
              </View>
              
              {/* Button Text */}
              <View style={styles.continueButtonTextContainer}>
                <AutoText style={styles.continueButtonText}>
                  Continue
                </AutoText>
                {selectedSubcategories.length > 0 && (
                  <AutoText style={styles.continueButtonSubtext}>
                    {selectedSubcategories.length} material{selectedSubcategories.length !== 1 ? 's' : ''}
                  </AutoText>
                )}
              </View>
              
              {/* Arrow Icon */}
              <MaterialCommunityIcons 
                name="arrow-right" 
                size={18} 
                color="#FFFFFF" 
                style={styles.continueButtonIcon}
              />
            </View>
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
      fontFamily: 'Poppins-SemiBold',
      fontSize: '18@s',
      color: theme.textPrimary,
      textAlign: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: '16@s',
      paddingTop: '16@vs',
      paddingBottom: '24@vs',
    },
    searchContainer: {
      paddingHorizontal: '16@s',
      paddingTop: '16@vs',
      paddingBottom: '8@vs',
      backgroundColor: theme.background,
    },
    searchInput: {
      width: '100%',
    },
    categoryFiltersContainer: {
      paddingRight: '16@s',
      marginBottom: '20@vs',
      gap: '2@s',
    },
    categoryFilterChip: {
      paddingHorizontal: '18@s',
      paddingVertical: '8@vs',
      borderRadius: '20@ms',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      marginRight: '10@s',
    },
    categoryFilterChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    categoryFilterText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '13@s',
      color: theme.textPrimary,
    },
    categoryFilterTextActive: {
      color: '#FFFFFF',
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
    materialsList: {
      gap: '12@vs',
    },
    materialItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '12@s',
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    materialItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    materialImageContainer: {
      width: '56@s',
      height: '56@vs',
      borderRadius: '12@ms',
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginRight: '12@s',
    },
    materialImage: {
      width: '100%',
      height: '100%',
    },
    materialInfo: {
      flex: 1,
    },
    materialName: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '15@s',
      color: theme.textPrimary,
      marginBottom: '4@vs',
    },
    materialPrice: {
      fontFamily: 'Poppins-Regular',
      fontSize: '13@s',
      color: theme.textSecondary,
    },
    materialActionButton: {
      paddingHorizontal: '16@s',
      paddingVertical: '8@vs',
      borderRadius: '8@ms',
      backgroundColor: theme.primary,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    materialActionButtonSelected: {
      backgroundColor: 'transparent',
      borderColor: theme.border,
    },
    materialActionText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '13@s',
      color: '#FFFFFF',
    },
    materialActionTextSelected: {
      color: theme.textSecondary,
    },
    selectionFooter: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.card,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingHorizontal: '16@s',
      paddingTop: '12@vs',
      paddingBottom: '24@vs',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 8,
    },
    continueButton: {
      backgroundColor: theme.primary,
      borderRadius: '10@ms',
      paddingVertical: '10@vs',
      paddingHorizontal: '14@s',
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 4,
    },
    continueButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10@s',
    },
    selectedMaterialsPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: '6@s',
    },
    selectedMaterialBadge: {
      width: '32@s',
      height: '32@vs',
      borderRadius: '16@ms',
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      borderWidth: 1.5,
      borderColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    selectedMaterialBadgeOverlap: {
      marginLeft: '-10@s',
      zIndex: 1,
    },
    selectedMaterialImage: {
      width: '100%',
      height: '100%',
    },
    selectedMaterialIconContainer: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    selectedMaterialMore: {
      backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    selectedMaterialMoreText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '10@s',
      color: '#FFFFFF',
    },
    continueButtonTextContainer: {
      flex: 1,
      alignItems: 'flex-start',
    },
    continueButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '15@s',
      color: '#FFFFFF',
      marginBottom: '1@vs',
      lineHeight: '18@vs',
    },
    continueButtonSubtext: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: 'rgba(255, 255, 255, 0.9)',
      lineHeight: '13@vs',
    },
    continueButtonIcon: {
      marginLeft: '6@s',
    },
  });

export default MaterialSelectionScreen;
