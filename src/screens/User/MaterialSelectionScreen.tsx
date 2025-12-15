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
import { useCategories } from '../../hooks/useCategories';
import { Subcategory, getSubcategoriesPaginated, SubcategoriesResponse } from '../../services/api/v2/categories';
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

// Module-level cache that persists across component mounts/unmounts
// This ensures cache persists when navigating away and coming back
const persistentSubcategoriesCache = new Map<number | 'all', { 
  subcategories: Subcategory[], 
  lastPage: number, 
  hasMore: boolean 
}>();

const MaterialSelectionScreen = () => {
  const { theme, isDark, themeName } = useTheme();
  const { setTabBarVisible } = useTabBar();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = route.params as UserRootStackParamList['MaterialSelection'];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState<number[]>([]); // Array to support multi-selection (for UI)
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<number | undefined>(undefined); // The category whose subcategories are currently displayed
  const [selectedSubcategories, setSelectedSubcategories] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [allSubcategories, setAllSubcategories] = useState<Subcategory[]>([]);
  const expectedCategoryIdRef = useRef<number | undefined>(undefined);
  // Use module-level cache instead of component-level ref to persist across navigation
  // Always use the same module-level Map instance to ensure persistence
  const subcategoriesCacheRef = useRef(persistentSubcategoriesCache);
  // Ref for horizontal ScrollView to scroll to selected categories
  const categoryFiltersScrollViewRef = useRef<ScrollView>(null);
  // Store positions of category buttons for scrolling
  const categoryButtonPositions = useRef<Map<number, number>>(new Map());
  // Track which route params we've already scrolled for (to prevent scrolling when user manually adds categories)
  const scrolledRouteParams = useRef<number[] | null>(null);
  
  // Verify cache persistence on mount
  useEffect(() => {
    const allCacheSize = subcategoriesCacheRef.current.get('all')?.subcategories.length || 0;
    const specificCacheCount = Array.from(subcategoriesCacheRef.current.keys()).filter(k => k !== 'all').length;
    console.log('🔍 Cache status on mount - All cache:', allCacheSize, 'items, Specific caches:', specificCacheCount);
    
    // Ensure we're using the persistent cache
    if (subcategoriesCacheRef.current !== persistentSubcategoriesCache) {
      console.warn('⚠️ Cache reference mismatch! Reassigning to persistent cache.');
      subcategoriesCacheRef.current = persistentSubcategoriesCache;
    }
  }, []);
  
  const styles = useMemo(() => getStyles(theme, themeName, isDark), [theme, themeName, isDark]);

  // Fetch categories for filters
  const { data: categoriesData } = useCategories('b2c', true);
  const allCategories = categoriesData?.data || [];

  // Set category filters based on route params (selected categories from dashboard)
  useEffect(() => {
    if (routeParams?.selectedCategories && routeParams.selectedCategories.length > 0) {
      const routeCategories = routeParams.selectedCategories;
      const routeCategoriesKey = JSON.stringify(routeCategories.sort());
      const scrolledKey = scrolledRouteParams.current ? JSON.stringify(scrolledRouteParams.current.sort()) : null;
      
      // Check if these are new route params (different from what we've scrolled for)
      const isNewRouteParams = routeCategoriesKey !== scrolledKey;
      
      // If categories are passed from dashboard, select all of them
      console.log('🎯 Setting category filters from route params:', routeCategories, 'isNew:', isNewRouteParams);
      setSelectedCategoryFilters(routeCategories);
      
      // Only scroll if these are new route params (not when user manually adds categories)
      if (isNewRouteParams) {
        // Mark that we've scrolled for these route params
        scrolledRouteParams.current = routeCategories;
        
        // Scroll to the first selected category after a delay to ensure layout is complete
        setTimeout(() => {
          const firstSelectedCategoryId = routeCategories[0];
          if (!firstSelectedCategoryId) return;
          const buttonX = categoryButtonPositions.current.get(firstSelectedCategoryId);
          if (buttonX !== undefined && categoryFiltersScrollViewRef.current) {
            // Scroll to show the button with some padding
            categoryFiltersScrollViewRef.current.scrollTo({
              x: Math.max(0, buttonX - 20), // 20px padding from left
              animated: true,
            });
            console.log('📍 Scrolled to selected category:', firstSelectedCategoryId, 'at position:', buttonX);
          } else {
            console.log('⚠️ Category button position not yet measured, will retry');
            // Retry after a longer delay if position not available
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
        }, 300); // Small delay to ensure layout is complete
      } else {
        console.log('ℹ️ Route params already processed, skipping scroll');
      }
    }
  }, [routeParams?.selectedCategories]);

  // For API query, use the active category (last selected) or "All" if none selected
  const categoryIdForQuery = activeCategoryFilter !== undefined 
    ? activeCategoryFilter 
    : undefined;
  const cacheKey = categoryIdForQuery ?? 'all';
  
  // Check if we have cached data for the current page
  const cachedData = subcategoriesCacheRef.current.get(cacheKey);
  
  // Determine if we should fetch:
  // 1. No cache exists
  // 2. We need a page that's not in cache (currentPage > lastPage)
  // 3. We have cache but it's incomplete (hasMore = true and we're on page 1 with no data)
  const shouldFetch = useMemo(() => {
    // If fetching "All" category
    if (categoryIdForQuery === undefined) {
      const allCache = subcategoriesCacheRef.current.get('all');
      
      // Check if we have data from specific category caches
      let totalFromSpecificCategories = 0;
      let allSpecificCategoriesComplete = true; // Track if all specific categories are fully loaded
      subcategoriesCacheRef.current.forEach((value, key) => {
        if (key !== 'all' && typeof key === 'number') {
          totalFromSpecificCategories += value.subcategories.length;
          // If any specific category still has more pages, we're not complete
          if (value.hasMore) {
            allSpecificCategoriesComplete = false;
          }
        }
      });
      
      // If we have All cache with data
      if (allCache && allCache.subcategories.length > 0) {
        // If we've loaded all pages (hasMore = false), don't fetch anymore
        if (!allCache.hasMore && currentPage <= allCache.lastPage) {
          console.log('✅ All category: All pages cached - using cache, page:', currentPage, 'lastPage:', allCache.lastPage, 'total:', allCache.subcategories.length);
          return false;
        }
        
        // If we need a page beyond what we have, fetch it
        if (currentPage > allCache.lastPage) {
          console.log('🔄 All category: Need new page - will fetch, currentPage:', currentPage, 'lastPage:', allCache.lastPage);
          return true;
        }
        
        // If we have the page in cache, don't fetch
        console.log('✅ All category: Page in cache - using cache, page:', currentPage, 'total:', allCache.subcategories.length);
        return false;
      }
      
      // If we have data from specific categories and all of them are complete (hasMore = false),
      // we already have all subcategories, so don't fetch
      if (totalFromSpecificCategories > 0 && allSpecificCategoriesComplete && currentPage === 1) {
        console.log('✅ All category: Have', totalFromSpecificCategories, 'subcategories from specific category caches (all complete) - will use cache, not fetching');
        return false; // Don't fetch, we'll use merged data from cache
      }
      
      // If we have some data from specific categories but need more pages
      if (totalFromSpecificCategories > 0 && currentPage > 1) {
        // Only fetch if the All cache doesn't have this page yet
        if (!allCache || currentPage > allCache.lastPage) {
          console.log('🔄 All category: Have cached data but need page', currentPage, '- will fetch');
          return true;
        }
        return false;
      }
      
      // If we have data from specific categories but they're not all complete, 
      // still don't fetch on page 1 - let the filter change effect handle merging
      if (totalFromSpecificCategories > 0 && currentPage === 1) {
        console.log('✅ All category: Have', totalFromSpecificCategories, 'subcategories from specific category caches - will use cache, not fetching');
        return false;
      }
    }
    
    // For specific categories or "All"
    if (!cachedData) {
      console.log('🔄 No cache - will fetch');
      return true;
    }
    
    // If we've loaded all pages (hasMore = false), don't fetch anymore
    if (!cachedData.hasMore && currentPage <= cachedData.lastPage) {
      console.log('✅ All pages cached - using cache, page:', currentPage, 'lastPage:', cachedData.lastPage);
      return false;
    }
    
    // If we need a page beyond what we have, fetch it
    if (currentPage > cachedData.lastPage) {
      console.log('🔄 Need new page - will fetch, currentPage:', currentPage, 'lastPage:', cachedData.lastPage);
      return true;
    }
    
    // If we have the page in cache, don't fetch
    console.log('✅ Page in cache - using cache, page:', currentPage);
    return false;
  }, [cachedData, currentPage, categoryIdForQuery, activeCategoryFilter]);
  
  const { 
    data: subcategoriesData, 
    isLoading: loadingSubcategories,
    error: subcategoriesError,
    isSuccess,
    isFetched
  } = useApiQuery<SubcategoriesResponse & { meta: { page: number; limit: number; totalPages: number; hasMore: boolean } }>({
    queryKey: ['subcategories', 'paginated', categoryIdForQuery ?? 'all', 'b2c', currentPage],
    queryFn: () => {
      console.log('🔄 Fetching paginated subcategories - page:', currentPage, 'categoryId:', categoryIdForQuery);
      return getSubcategoriesPaginated(currentPage, 20, categoryIdForQuery, 'b2c');
    },
    enabled: shouldFetch, // Only fetch if we don't have cached data or need next page
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

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
          // Get the width of the screen/viewport to center the button
          // Scroll to show the button with some padding
          const scrollPosition = Math.max(0, buttonX - 20); // 20px padding from left
          categoryFiltersScrollViewRef.current.scrollTo({
            x: scrollPosition,
            animated: true,
          });
          console.log('📍 Scrolled to active category:', activeCategoryFilter, 'at position:', scrollPosition);
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
              console.log('📍 Retry scroll to active category:', activeCategoryFilter, 'at position:', scrollPosition);
            }
          }, 300);
        }
      }, 100);
    }
  }, [activeCategoryFilter]);

  // Reset page and subcategories when active category changes
  useEffect(() => {
    // Show subcategories only for the active category (last selected)
    if (activeCategoryFilter !== undefined) {
      setCurrentPage(1);
      
      // Get cached data for the active category
      const cached = subcategoriesCacheRef.current.get(activeCategoryFilter);
      
      if (cached && cached.subcategories.length > 0) {
        // Show cached data immediately
        setAllSubcategories(cached.subcategories);
        console.log('✅ Showing cached subcategories for category:', activeCategoryFilter, 'count:', cached.subcategories.length);
      } else {
        // No cached data, clear the list and fetch
        setAllSubcategories([]);
        console.log('🔄 No cache for category:', activeCategoryFilter, '- will fetch');
      }
      
      expectedCategoryIdRef.current = activeCategoryFilter;
      return;
    }
    
    // If no active category, show "All"
    setCurrentPage(1);
    
    // Check if we have cached data for "All"
    const cached = subcategoriesCacheRef.current.get('all');
    
    if (cached && cached.subcategories.length > 0) {
      // Use cached data immediately
      setAllSubcategories(cached.subcategories);
      console.log('✅ Showing cached "All" subcategories:', cached.subcategories.length, 'items');
    } else {
      // No cached data, clear the list and fetch
      setAllSubcategories([]);
      console.log('🔄 No cache for "All" - will fetch');
    }
  }, [activeCategoryFilter]);

  // Helper function to remove duplicates
  const removeDuplicates = (arr: Subcategory[]) => {
    const seen = new Set<number>();
    return arr.filter(item => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  };

  // Function to merge subcategories into "All" cache
  const mergeIntoAllCache = (subcategories: Subcategory[], categoryId: number, hasMore: boolean) => {
    // First, ensure the category cache is updated with the latest hasMore status
    const categoryCache = subcategoriesCacheRef.current.get(categoryId);
    if (categoryCache) {
      subcategoriesCacheRef.current.set(categoryId, {
        ...categoryCache,
        hasMore: hasMore
      });
    }
    
    const allCache = subcategoriesCacheRef.current.get('all');
    const merged = allCache 
      ? removeDuplicates([...allCache.subcategories, ...subcategories])
      : removeDuplicates(subcategories);
    
    // Check if all specific categories are now complete (after updating the current category)
    let allSpecificCategoriesComplete = true;
    let totalFromSpecificCategories = 0;
    subcategoriesCacheRef.current.forEach((value, key) => {
      if (key !== 'all' && typeof key === 'number') {
        totalFromSpecificCategories += value.subcategories.length;
        // Use the updated hasMore for the current category, otherwise use cached value
        const categoryHasMore = key === categoryId ? hasMore : value.hasMore;
        if (categoryHasMore) {
          allSpecificCategoriesComplete = false;
        }
      }
    });
    
    // Determine hasMore for "All" cache:
    // - If all specific categories are complete, hasMore should be false
    // - Otherwise, keep the existing hasMore status or set to true if no cache exists
    const allHasMore = allSpecificCategoriesComplete ? false : (allCache?.hasMore ?? true);
    
    // IMPORTANT: Never clear the "All" cache - always merge
    if (merged.length === 0 && allCache && allCache.subcategories.length > 0) {
      console.warn('⚠️ Attempted to set empty All cache, preserving existing cache with', allCache.subcategories.length, 'items');
      return; // Don't overwrite with empty data
    }
    
    subcategoriesCacheRef.current.set('all', {
      subcategories: merged,
      lastPage: allCache?.lastPage || 0,
      hasMore: allHasMore
    });
    
    console.log('✅ Pushed', subcategories.length, 'subcategories from category', categoryId, 'into All cache. Total in All:', merged.length, 'allComplete:', allSpecificCategoriesComplete, 'hasMore:', allHasMore, 'categoryHasMore:', hasMore);
  };

  // Accumulate subcategories when data is successfully fetched
  useEffect(() => {
    // Only update when data is successfully fetched and we have valid data
    if (isFetched && isSuccess && subcategoriesData?.data && Array.isArray(subcategoriesData.data)) {
      const dataCategoryId = subcategoriesData.meta?.category_id;
      const expectedCategoryId = expectedCategoryIdRef.current;
      const cacheKey = expectedCategoryId ?? 'all';
      
      // Verify the data matches the current filter (handle null/undefined for "All")
      // Normalize category IDs for comparison (handle string/number mismatches)
      const normalizedExpectedId = expectedCategoryId !== undefined ? Number(expectedCategoryId) : undefined;
      const normalizedDataId = dataCategoryId !== null && dataCategoryId !== undefined && String(dataCategoryId) !== 'null' 
        ? Number(dataCategoryId) 
        : null;
      
      const categoryMatches = 
        (normalizedExpectedId === undefined && normalizedDataId === null) ||
        (normalizedExpectedId !== undefined && normalizedDataId === normalizedExpectedId);
      
      // Determine which category ID to use for merging
      // For specific categories, use expectedCategoryId; for "All", use dataCategoryId if available
      const categoryIdForMerge = expectedCategoryId !== undefined 
        ? expectedCategoryId 
        : (normalizedDataId !== null ? normalizedDataId : undefined);
      
      const hasMore = subcategoriesData.meta?.hasMore || false;
      
      if (categoryMatches) {
        console.log('✅ Updating allSubcategories - page:', currentPage, 'data count:', subcategoriesData.data.length, 'categoryId:', expectedCategoryId, 'dataCategoryId:', dataCategoryId, 'categoryIdForMerge:', categoryIdForMerge);
        
        if (currentPage === 1) {
          const uniqueData = removeDuplicates(subcategoriesData.data);
          
          // If this is "All" category, merge with existing "All" cache instead of replacing
          if (expectedCategoryId === undefined) {
            const existingAllCache = subcategoriesCacheRef.current.get('all');
            if (existingAllCache && existingAllCache.subcategories.length > 0) {
              // Merge fetched data with existing cache
              const merged = removeDuplicates([...existingAllCache.subcategories, ...uniqueData]);
              setAllSubcategories(merged);
              
              // Update "All" cache with merged data
              subcategoriesCacheRef.current.set('all', {
                subcategories: merged,
                lastPage: currentPage,
                hasMore: hasMore
              });
              
              console.log('✅ [PAGE 1] Merged "All" fetched data (', uniqueData.length, ') with existing cache (', existingAllCache.subcategories.length, ') =', merged.length, 'items');
            } else {
              // No existing cache, just set the fetched data
              setAllSubcategories(uniqueData);
              subcategoriesCacheRef.current.set('all', {
                subcategories: uniqueData,
                lastPage: currentPage,
                hasMore: hasMore
              });
              console.log('✅ [PAGE 1] Set "All" cache with fetched data:', uniqueData.length, 'items');
            }
          } else {
            // For specific categories - just set the fetched data (only showing active category)
            setAllSubcategories(uniqueData);
            console.log('✅ Set subcategories for category', categoryIdForMerge, ':', uniqueData.length, 'items');
            
            // Update cache for this specific category
            subcategoriesCacheRef.current.set(cacheKey, {
              subcategories: uniqueData,
              lastPage: currentPage,
              hasMore: hasMore
            });
            
            // ALWAYS merge into "All" cache for specific categories
            if (categoryIdForMerge !== undefined && categoryIdForMerge !== null) {
              console.log('🔄 [PAGE 1] Merging category', categoryIdForMerge, 'into All cache - data count:', uniqueData.length);
              mergeIntoAllCache(uniqueData, categoryIdForMerge, hasMore);
            }
          }
        } else {
          // Append new page data - only for the active category
          setAllSubcategories(prev => {
            const newData = removeDuplicates([...prev, ...subcategoriesData.data]);
            
            // Update cache with merged data for this specific category
            const categoryCache = subcategoriesCacheRef.current.get(cacheKey);
            const categoryData = categoryCache 
              ? removeDuplicates([...categoryCache.subcategories, ...subcategoriesData.data])
              : subcategoriesData.data;
            
            subcategoriesCacheRef.current.set(cacheKey, {
              subcategories: categoryData,
              lastPage: currentPage,
              hasMore: hasMore
            });
            
            // If this is a specific category (not "All"), ALWAYS merge new items into "All" cache
            if (categoryIdForMerge !== undefined && categoryIdForMerge !== null) {
              console.log('🔄 [PAGE', currentPage, '] Merging from category', categoryIdForMerge, 'into All cache - data count:', subcategoriesData.data.length);
              mergeIntoAllCache(subcategoriesData.data, categoryIdForMerge, hasMore);
            } else {
              // For "All" category, just update the cache
              console.log('✅ [PAGE', currentPage, '] Updated "All" cache - prev:', prev.length, 'new items:', subcategoriesData.data.length, 'total:', newData.length);
            }
            
            console.log('✅ Appending page data - prev count:', prev.length, 'new count:', newData.length, 'hasMore:', hasMore, '(cached)');
            return newData;
          });
        }
        
        // If no more pages, log that all data is cached
        if (!hasMore) {
          console.log('✅ All pages loaded for category:', cacheKey, 'total items:', subcategoriesCacheRef.current.get(cacheKey)?.subcategories.length);
        }
      } else {
        // Even if category doesn't match, try to merge if we have a valid category ID in the data
        // This handles edge cases where timing might cause mismatches
        if (normalizedDataId !== null && normalizedDataId !== undefined && subcategoriesData.data.length > 0) {
          console.log('⚠️ Category mismatch but attempting merge - expected:', expectedCategoryId, 'got:', dataCategoryId, 'using data category:', normalizedDataId);
          const uniqueData = removeDuplicates(subcategoriesData.data);
          
          // Update cache for the category from data
          const dataCacheKey = normalizedDataId;
          const existingDataCache = subcategoriesCacheRef.current.get(dataCacheKey);
          const mergedCategoryData = existingDataCache 
            ? removeDuplicates([...existingDataCache.subcategories, ...uniqueData])
            : uniqueData;
            
          subcategoriesCacheRef.current.set(dataCacheKey, {
            subcategories: mergedCategoryData,
            lastPage: currentPage,
            hasMore: hasMore
          });
          
          // ALWAYS merge into All cache when we have valid category data
          console.log('🔄 [FALLBACK] Merging category', normalizedDataId, 'into All cache - data count:', uniqueData.length);
          mergeIntoAllCache(uniqueData, normalizedDataId, hasMore);
          console.log('✅ Merged mismatched category data into All cache');
        } else {
          console.log('⚠️ Skipping stale data - expected categoryId:', expectedCategoryId, 'type:', typeof expectedCategoryId, 'got:', dataCategoryId, 'type:', typeof dataCategoryId, 'normalizedExpected:', normalizedExpectedId, 'normalizedData:', normalizedDataId);
        }
      }
    } else if (isFetched && !loadingSubcategories) {
      console.log('⚠️ Query finished but no data - isSuccess:', isSuccess, 'hasData:', !!subcategoriesData?.data, 'subcategoriesData:', subcategoriesData);
    }
  }, [subcategoriesData, currentPage, isSuccess, isFetched, loadingSubcategories]);

  useFocusEffect(
    React.useCallback(() => {
      setTabBarVisible(false);
      
      // When screen comes into focus, restore cached data for the active category
      if (activeCategoryFilter !== undefined) {
        const cached = subcategoriesCacheRef.current.get(activeCategoryFilter);
        if (cached && cached.subcategories.length > 0) {
          if (allSubcategories.length === 0 || allSubcategories.length !== cached.subcategories.length) {
            console.log('🔄 Screen focused - restoring cached data for category:', activeCategoryFilter, 'count:', cached.subcategories.length);
            setAllSubcategories(cached.subcategories);
          } else {
            console.log('✅ Screen focused - cache already loaded for category:', activeCategoryFilter, 'count:', cached.subcategories.length);
          }
        } else {
          console.log('ℹ️ Screen focused - no cache available for category:', activeCategoryFilter);
        }
      } else {
        // No categories selected, use "All" cache
        const cached = subcategoriesCacheRef.current.get('all');
        
        // Always restore from cache if available, regardless of current state
        // This ensures cache persists across navigation
        if (cached && cached.subcategories.length > 0) {
          if (allSubcategories.length === 0 || allSubcategories.length !== cached.subcategories.length) {
            console.log('🔄 Screen focused - restoring cached data for: all, count:', cached.subcategories.length, 'current count:', allSubcategories.length);
            setAllSubcategories(cached.subcategories);
          } else {
            console.log('✅ Screen focused - cache already loaded for: all, count:', cached.subcategories.length);
          }
        } else {
          console.log('ℹ️ Screen focused - no cache available for: all');
        }
      }
      
      // Log cache status for debugging
      console.log('📦 Cache status on focus:', {
        allCache: subcategoriesCacheRef.current.get('all')?.subcategories.length || 0,
        specificCaches: Array.from(subcategoriesCacheRef.current.keys()).filter(k => k !== 'all').length,
        activeCategory: activeCategoryFilter,
        selectedCategories: selectedCategoryFilters,
        currentSubcategories: allSubcategories.length
      });
      
      return () => {
        setTabBarVisible(true);
      };
    }, [setTabBarVisible, activeCategoryFilter, allSubcategories.length])
  );

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
    console.log('Selected subcategories:', selectedSubcategories);
    // Navigate to upload images screen
    (navigation as any).navigate('UploadImages', {
      selectedSubcategories: selectedSubcategories
    });
  };

  // Filter subcategories based on search query
  const filteredSubcategories = useMemo(() => {
    const subcategories: Subcategory[] = allSubcategories || [];
    console.log('Filtering subcategories - allSubcategories count:', subcategories.length, 'searchQuery:', searchQuery);
    if (searchQuery === '') return subcategories;
    return subcategories.filter((sub) =>
      sub.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allSubcategories, searchQuery]);

  // Get hasMore from cache or API response
  const cachedDataForHasMore = subcategoriesCacheRef.current.get(cacheKey);
  const hasMore = cachedDataForHasMore 
    ? cachedDataForHasMore.hasMore 
    : (subcategoriesData?.meta?.hasMore || false);
  
  const isLoadingMoreRef = useRef(false);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isCloseToBottom && !loadingSubcategories && !isLoadingMoreRef.current) {
      // Check cache to see if we have more data
      const cached = subcategoriesCacheRef.current.get(cacheKey);
      const cacheHasMore = cached ? cached.hasMore : false;
      
      if (cacheHasMore) {
        isLoadingMoreRef.current = true;
        console.log('Scrolled to bottom - loading more...');
        setCurrentPage(prev => prev + 1);
        // Reset the flag after a short delay to allow the query to start
        setTimeout(() => {
          isLoadingMoreRef.current = false;
        }, 1000);
      } else {
        console.log('Scrolled to bottom but no more data available (all cached)');
      }
    }
  };

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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={400}
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <SearchInput
            placeholder="Search materials"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>

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
            onPress={() => setSelectedCategoryFilters([])}
            activeOpacity={0.7}
          >
            <AutoText style={[
              styles.categoryFilterText,
              selectedCategoryFilters.length === 0 && styles.categoryFilterTextActive
            ]}>
              All
            </AutoText>
          </TouchableOpacity>
          {allCategories.map((category, index) => {
            const isSelected = selectedCategoryFilters.includes(category.id);
            return (
              <TouchableOpacity
                key={category.id}
                onLayout={(event: any) => {
                  // Store the x position of this button
                  const { x } = event.nativeEvent.layout;
                  categoryButtonPositions.current.set(category.id, x);
                }}
                style={[
                  styles.categoryFilterChip,
                  isSelected && styles.categoryFilterChipActive
                ]}
                onPress={() => {
                  setSelectedCategoryFilters(prev => {
                    if (prev.includes(category.id)) {
                      // Deselect if already selected
                      return prev.filter(id => id !== category.id);
                    } else {
                      // Add to selection
                      return [...prev, category.id];
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
        {filteredSubcategories.length === 0 && loadingSubcategories ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AutoText style={styles.emptyText}>Loading materials...</AutoText>
          </View>
        ) : filteredSubcategories.length === 0 && !loadingSubcategories ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="package-variant" size={48} color={theme.textSecondary} />
            <AutoText style={styles.emptyText}>No materials found</AutoText>
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
            
            {/* Loading Indicator - shown at bottom when loading (all pages including first) */}
            {loadingSubcategories && (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color={theme.primary} />
                <AutoText style={styles.loadingMoreText}>
                  {currentPage === 1 ? 'Loading materials...' : 'Loading more materials...'}
                </AutoText>
              </View>
            )}
            
            {/* End of list indicator */}
            {!hasMore && filteredSubcategories.length > 0 && !loadingSubcategories && (
              <View style={styles.endOfListContainer}>
                <AutoText style={styles.endOfListText}>No more materials to load</AutoText>
              </View>
            )}
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
      marginBottom: '16@vs',
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
    selectionSummary: {
      backgroundColor: theme.accent || addOpacityToHex(theme.primary, 0.1),
      borderRadius: '8@ms',
      paddingVertical: '10@vs',
      paddingHorizontal: '16@s',
      marginBottom: '12@vs',
      alignItems: 'center',
    },
    selectionSummaryText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.primary,
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
    loadingMoreContainer: {
      paddingVertical: '16@vs',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: '8@s',
    },
    loadingMoreText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '13@s',
      color: theme.textSecondary,
      marginLeft: '8@s',
    },
    endOfListContainer: {
      paddingVertical: '16@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    endOfListText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
    },
  });

export default MaterialSelectionScreen;

