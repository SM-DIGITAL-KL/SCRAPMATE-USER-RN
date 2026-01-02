/**
 * React Query hooks for categories and subcategories management
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useApiQuery, useApiMutation } from './index';
import { queryClient } from '../services/api/queryClient';
import { 
  getCategories, 
  getSubcategories, 
  getCategoriesWithSubcategories,
  getIncrementalUpdates,
  Category,
  Subcategory,
  CategoriesResponse,
  SubcategoriesResponse,
} from '../services/api/v2/categories';
import {
  getCachedCategories,
  saveCachedCategories,
  getLastUpdatedOn,
  updateLastUpdatedOn,
  mergeIncrementalUpdates,
  isCacheValid,
} from '../services/cache/categoriesCache';
import { getUserData } from '../services/auth/authService';
import { 
  getUserCategories, 
  getUserSubcategories,
  updateUserCategories,
  updateUserSubcategories,
  removeUserCategory,
  removeUserSubcategories,
} from '../services/api/v2/profile';
import { queryKeys } from '../services/api/queryKeys';

/**
 * Hook to get all categories
 */
export const useCategories = (userType?: 'b2b' | 'b2c' | 'all', enabled = true) => {
  return useApiQuery<CategoriesResponse>({
    queryKey: queryKeys.categories.byUserType(userType),
    queryFn: () => getCategories(userType),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });
};

/**
 * Hook to get subcategories
 */
export const useSubcategories = (
  categoryId?: number,
  userType?: 'b2b' | 'b2c' | 'all',
  enabled = true
) => {
  return useApiQuery<SubcategoriesResponse>({
    queryKey: queryKeys.subcategories.byCategory(categoryId || 0, userType),
    queryFn: () => getSubcategories(categoryId, userType),
    enabled: enabled && !!categoryId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Hook to get categories with subcategories
 * Uses 365-day persistent cache with incremental updates via AsyncStorage
 */
export const useCategoriesWithSubcategories = (
  userType?: 'b2b' | 'b2c' | 'all',
  enabled = true,
  refetchOnMount = true
) => {
  // Get current user ID for user-specific caching
  const [userId, setUserId] = useState<string | number | null>(null);
  
  useEffect(() => {
    getUserData().then(userData => {
      setUserId(userData?.id || null);
    });
  }, []);
  
  // Memoize queryKey to prevent recreating it on every render
  // Include userId to ensure user-specific React Query cache
  const queryKey = useMemo(
    () => [...queryKeys.categories.all, 'withSubcategories', userType || 'all', userId || 'anonymous'],
    [userType, userId]
  );
  
  // If refetchOnMount is false, load data directly from AsyncStorage
  // This completely bypasses API calls and React Query's queryFn
  const [asyncStorageData, setAsyncStorageData] = useState<any>(null);
  const [isLoadingAsyncStorage, setIsLoadingAsyncStorage] = useState(false);
  const hasLoadedRef = useRef(false);
  
  useEffect(() => {
    // Only load once if refetchOnMount is false and we haven't loaded yet
    if (!refetchOnMount && enabled && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      setIsLoadingAsyncStorage(true);
      console.log('📦 [useCategories] RateListScreen: Loading from AsyncStorage (NO API CALL)');
      // Load directly from AsyncStorage without any API calls
      getCachedCategories()
        .then((cached) => {
          if (cached) {
            console.log(`✅ [useCategories] RateListScreen: Data loaded from AsyncStorage`);
            console.log(`   📊 Categories: ${cached.length}, Subcategories: ${cached.reduce((sum, cat) => sum + (cat.subcategory_count || 0), 0)}`);
            const response = {
              status: 'success' as const,
              msg: 'Categories with subcategories retrieved successfully (AsyncStorage)',
              data: cached,
              meta: {
                total_categories: cached.length,
                total_subcategories: cached.reduce((sum, cat) => sum + (cat.subcategory_count || 0), 0),
                b2b_available: cached.filter(c => c.available_in?.b2b).length,
                b2c_available: cached.filter(c => c.available_in?.b2c).length,
              },
              hitBy: 'AsyncStorage',
            };
            setAsyncStorageData(response);
            // Also update React Query cache so other components can use it
            queryClient.setQueryData(queryKey, response);
          } else {
            console.log('⚠️ [useCategories] RateListScreen: No cached data found in AsyncStorage');
          }
          setIsLoadingAsyncStorage(false);
        })
        .catch((error) => {
          console.warn('⚠️ [useCategories] RateListScreen: Error loading from AsyncStorage:', error);
          setIsLoadingAsyncStorage(false);
        });
    }
  }, [refetchOnMount, enabled, queryKey]);
  
  // If refetchOnMount is false, use data from AsyncStorage directly
  // and completely disable the React Query hook
  if (!refetchOnMount) {
    return {
      data: asyncStorageData,
      isLoading: isLoadingAsyncStorage,
      isError: false,
      error: null,
      refetch: async () => {
        // No-op: we don't refetch when refetchOnMount is false
        return { data: asyncStorageData, error: null };
      },
    } as any;
  }
  
  // Normal flow: use React Query with API calls for dashboard
  return useApiQuery({
    queryKey,
    // Disable structural sharing to ensure React Query detects all changes
    // This ensures that when we update the cache with incremental updates, React Query sees it as a new value
    structuralSharing: false,
    queryFn: async () => {
      console.log('🔄 [useCategories] Dashboard: Starting query (checking cache first)...');
      
      // Check AsyncStorage cache first (365-day persistence)
      const cachedData = await getCachedCategories();
      const lastUpdatedOn = await getLastUpdatedOn();
      const cacheIsValid = await isCacheValid();

      if (cachedData && cacheIsValid && lastUpdatedOn) {
        console.log('📦 [useCategories] Dashboard: Found cached data in AsyncStorage');
        console.log(`   📊 Cached categories: ${cachedData.length}`);
        // Try to get incremental updates in background
        try {
          // Subtract 5 seconds from lastUpdatedOn to ensure we don't miss updates
          // that happened just moments ago (handles timing issues)
          const lastUpdatedDate = new Date(lastUpdatedOn);
          const adjustedTimestamp = new Date(lastUpdatedDate.getTime() - 5000).toISOString(); // 5 seconds buffer
          
          console.log('🌐 [useCategories] Dashboard: Calling API for incremental updates...');
          console.log(`   userType: ${userType}`);
          console.log(`   lastUpdatedOn (original): ${lastUpdatedOn}`);
          console.log(`   lastUpdatedOn (adjusted): ${adjustedTimestamp} (5s buffer to catch recent updates)`);
          console.log(`   userId: ${userId || 'not provided'}`);
          
          // Pass userId to get stats in incremental updates (type defaults to 'customer' for user app)
          const updates = await getIncrementalUpdates(userType, adjustedTimestamp, userId ? Number(userId) : undefined, 'customer');
          
          console.log('📥 [useCategories] Dashboard: Incremental updates API response received');
          console.log(`   hasUpdates: ${updates.meta?.hasUpdates}`);
          console.log(`   categories_count: ${updates.data?.categories?.length || 0}`);
          console.log(`   subcategories_count: ${updates.data?.subcategories?.length || 0}`);
          console.log(`   deleted_categories_count: ${updates.data?.deleted?.categories?.length || 0}`);
          console.log(`   deleted_subcategories_count: ${updates.data?.deleted?.subcategories?.length || 0}`);
          
          // Log deleted items for debugging
          if (updates.data?.deleted?.categories && updates.data.deleted.categories.length > 0) {
            console.log(`   🗑️  Deleted category IDs: ${updates.data.deleted.categories.map(c => c.id).join(', ')}`);
          }
          if (updates.data?.deleted?.subcategories && updates.data.deleted.subcategories.length > 0) {
            console.log(`   🗑️  Deleted subcategory IDs: ${updates.data.deleted.subcategories.map(s => s.id).join(', ')}`);
          }
          
          // Log updated categories with their images and compare with cached data
          if (updates.data?.categories && updates.data.categories.length > 0) {
            console.log(`   📋 Updated categories from API:`, updates.data.categories.map(c => {
              const cachedCat = cachedData.find(cached => cached.id === c.id);
              const imageChanged = cachedCat && cachedCat.image !== c.image;
              return {
                id: c.id,
                name: c.name,
                image: c.image ? `${c.image.substring(0, 80)}...` : 'no image',
                hasImage: !!c.image,
                cachedImage: cachedCat?.image ? `${cachedCat.image.substring(0, 80)}...` : 'no cached image',
                imageChanged: imageChanged ? 'YES ⚠️' : 'NO'
              };
            }));
          }
          
          // Check if there are updates OR deletions
          const hasDeletions = (updates.data?.deleted?.categories?.length || 0) > 0 || 
                              (updates.data?.deleted?.subcategories?.length || 0) > 0;
          const hasUpdates = updates.meta.hasUpdates || hasDeletions;
          
          if (hasUpdates || hasDeletions) {
            console.log('✅ [useCategories] Dashboard: Updates/deletions found - merging with cached data');
            console.log(`   📊 Updates: ${updates.data?.categories?.length || 0} categories, ${updates.data?.subcategories?.length || 0} subcategories`);
            console.log(`   🗑️  Deletions: ${updates.data?.deleted?.categories?.length || 0} categories, ${updates.data?.deleted?.subcategories?.length || 0} subcategories`);
            
            // Log category names and images before merge
            const categoryInfoBefore = cachedData.map(c => `${c.id}:${c.name} (img: ${c.image ? 'yes' : 'no'})`).join(', ');
            console.log(`   📋 Categories before merge: ${categoryInfoBefore}`);
            
            // Merge incremental updates with cached data (including deletions)
            const mergedData = mergeIncrementalUpdates(cachedData, {
              ...updates.data,
              deleted: updates.data?.deleted,
              lastUpdatedOn: updates.meta.lastUpdatedOn,
            });
            
            // Log category names and images after merge
            const categoryInfoAfter = mergedData.map(c => `${c.id}:${c.name} (img: ${c.image ? 'yes' : 'no'})`).join(', ');
            console.log(`   📋 Categories after merge: ${categoryInfoAfter}`);
            
            // Log deleted categories that were removed
            if (hasDeletions) {
              const deletedCategoryIds = updates.data?.deleted?.categories?.map(c => c.id) || [];
              const deletedSubcategoryIds = updates.data?.deleted?.subcategories?.map(s => s.id) || [];
              console.log(`   🗑️  Deleted category IDs removed from cache: ${deletedCategoryIds.join(', ')}`);
              console.log(`   🗑️  Deleted subcategory IDs removed from cache: ${deletedSubcategoryIds.join(', ')}`);
            }
            
            // Log specific image changes - check both before and after merge
            updates.data?.categories?.forEach(updatedCat => {
              const existingCat = cachedData.find(c => c.id === updatedCat.id);
              const mergedCat = mergedData.find(c => c.id === updatedCat.id);
              
              if (existingCat) {
                const imageChangedBeforeMerge = existingCat.image !== updatedCat.image;
                const imageChangedAfterMerge = mergedCat && mergedCat.image !== existingCat.image;
                
                console.log(`   🔍 [Image Change Check] Category ${updatedCat.id} (${updatedCat.name}):`);
                console.log(`      Before merge - Old: ${existingCat.image ? existingCat.image.substring(0, 100) + '...' : 'none'}`);
                console.log(`      Before merge - New: ${updatedCat.image ? updatedCat.image.substring(0, 100) + '...' : 'none'}`);
                console.log(`      Before merge - Changed: ${imageChangedBeforeMerge ? 'YES' : 'NO'}`);
                console.log(`      After merge - Final: ${mergedCat?.image ? mergedCat.image.substring(0, 100) + '...' : 'none'}`);
                console.log(`      After merge - Changed: ${imageChangedAfterMerge ? 'YES ✅' : 'NO ❌'}`);
                
                if (imageChangedBeforeMerge && !imageChangedAfterMerge) {
                  console.warn(`   ⚠️  WARNING: Image change detected before merge but NOT reflected after merge!`);
                }
              }
            });
            
            // Save updated cache to AsyncStorage (365-day persistence)
            // This is critical - must save even if only deletions occurred
            console.log(`💾 [useCategories] Saving updated cache to AsyncStorage (${mergedData.length} categories after merge)`);
            await saveCachedCategories(mergedData, updates.meta.lastUpdatedOn);
            console.log(`✅ [useCategories] Cache saved successfully to AsyncStorage`);
            
            // Create a new merged response with new object references
            // This ensures React Query detects the change and triggers a re-render
            // We create new object references for all nested data to ensure React Query sees it as changed
            const updatedResponse = {
              status: 'success' as const,
              msg: 'Categories with subcategories retrieved successfully (incremental update)',
              data: mergedData.map(cat => ({
                ...cat,
                // Ensure subcategories array is also a new reference
                subcategories: cat.subcategories ? cat.subcategories.map(sub => ({ ...sub })) : [],
              })),
              meta: {
                total_categories: mergedData.length,
                total_subcategories: mergedData.reduce((sum, cat) => sum + (cat.subcategory_count || 0), 0),
                b2b_available: mergedData.filter(c => c.available_in?.b2b).length,
                b2c_available: mergedData.filter(c => c.available_in?.b2c).length,
                ...(updates.data?.stats ? { stats: updates.data.stats } : {}),
              },
              hitBy: 'Cache+Incremental',
            };
            
            // Log image changes specifically
            const imageChanges = updates.data?.categories?.filter(updatedCat => {
              const existingCat = cachedData.find(c => c.id === updatedCat.id);
              return existingCat && existingCat.image !== updatedCat.image;
            }) || [];
            
            if (imageChanges.length > 0) {
              console.log(`🖼️  [useCategories] Image changes detected for ${imageChanges.length} category/categories:`);
              imageChanges.forEach(change => {
                const existingCat = cachedData.find(c => c.id === change.id);
                console.log(`   - Category ${change.id} (${change.name}):`);
                console.log(`     Old image: ${existingCat?.image ? existingCat.image.substring(0, 100) + '...' : 'none'}`);
                console.log(`     New image: ${change.image ? change.image.substring(0, 100) + '...' : 'none'}`);
              });
            }
            
            console.log('✅ [useCategories] Incremental update merged, saved, and React Query cache updated');
            console.log(`   📊 Updated category names in cache: ${mergedData.map(c => c.name).join(', ')}`);
            
            // Force React Query to update the cache immediately with new data
            // This ensures UI updates even if React Query doesn't detect the change automatically
            // We do this BEFORE invalidating to ensure the data is set
            queryClient.setQueryData(queryKey, updatedResponse);
            
            // Always invalidate when incremental updates are received to ensure UI reflects latest data
            // This is important for image changes, name changes, deletions, and any other updates
            const hasAnyUpdates = (updates.data?.categories?.length || 0) > 0 || 
                                 (updates.data?.subcategories?.length || 0) > 0 ||
                                 (updates.data?.deleted?.categories?.length || 0) > 0 ||
                                 (updates.data?.deleted?.subcategories?.length || 0) > 0;
            if (hasAnyUpdates) {
              if (imageChanges.length > 0) {
                console.log(`🔄 [useCategories] Forcing React Query cache invalidation due to ${imageChanges.length} image change(s)`);
              } else {
                console.log(`🔄 [useCategories] Forcing React Query cache invalidation due to incremental updates (${updates.data?.categories?.length || 0} categories, ${updates.data?.subcategories?.length || 0} subcategories)`);
              }
              // Invalidate to trigger a refetch, which will use the updated data we just set
              queryClient.invalidateQueries({ queryKey });
            }
            
            // Return the updated response - React Query will automatically update the cache with this value
            return updatedResponse;
          } else {
            // No updates, return cached data from AsyncStorage
            console.log('✅ [useCategories] Dashboard: No updates found - using cached data from AsyncStorage (NO API DATA)');
            return {
              status: 'success',
              msg: 'Categories with subcategories retrieved successfully (cached)',
              data: cachedData,
              meta: {
                total_categories: cachedData.length,
                total_subcategories: cachedData.reduce((sum, cat) => sum + cat.subcategory_count, 0),
                b2b_available: cachedData.filter(c => c.available_in.b2b).length,
                b2c_available: cachedData.filter(c => c.available_in.b2c).length,
              },
              hitBy: 'Cache',
            };
          }
        } catch (error: any) {
          // If incremental update fails, return cached data from AsyncStorage
          const isNetworkError = error?.message?.includes('Network request failed') || 
                                 error?.message?.includes('NetworkError') ||
                                 error?.name === 'TypeError';
          
          if (isNetworkError) {
            // Network error - silently use cache (user is offline or connection issue)
            console.log('📶 [useCategories] Dashboard: Network error - using cached data from AsyncStorage (NO API CALL)');
          } else {
            // Other errors - log warning
            console.warn('⚠️ [useCategories] Dashboard: Incremental update failed, using cached data:', error?.message || error);
          }
          
          return {
            status: 'success',
            msg: 'Categories with subcategories retrieved successfully (cached, update failed)',
            data: cachedData,
            meta: {
              total_categories: cachedData.length,
              total_subcategories: cachedData.reduce((sum, cat) => sum + cat.subcategory_count, 0),
              b2b_available: cachedData.filter(c => c.available_in.b2b).length,
              b2c_available: cachedData.filter(c => c.available_in.b2c).length,
            },
            hitBy: 'Cache',
          };
        }
      } else {
        // No cache or cache expired, fetch all data from API
        console.log('🌐 [useCategories] Dashboard: No cache found - calling API for full data fetch...');
        const response = await getCategoriesWithSubcategories(userType);
        console.log('✅ [useCategories] Dashboard: Full API response received');
        console.log(`   📊 Categories: ${response.data.length}`);
        
        // Save to AsyncStorage (365-day persistence)
        const currentTimestamp = new Date().toISOString();
        await saveCachedCategories(response.data, currentTimestamp);
        console.log('💾 [useCategories] Dashboard: Data saved to AsyncStorage');
        
        return {
          ...response,
          hitBy: 'API',
        };
      }
    },
    enabled,
    // Refetch on mount based on parameter (default: true for dashboard, false for rate list)
    // When false, uses cached data from React Query without refetching
    // Even with 365-day staleTime, we want to check for updates on each dashboard load
    refetchOnMount: refetchOnMount,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    // 365-day cache configuration for React Query
    staleTime: 365 * 24 * 60 * 60 * 1000, // 365 days - data is considered fresh for 365 days
    gcTime: 365 * 24 * 60 * 60 * 1000, // 365 days - keep in React Query cache for 365 days
    // React Query will persist this to AsyncStorage via PersistQueryClientProvider
    // This ensures data survives app restarts for 365 days
    // The custom AsyncStorage cache (categoriesCache.ts) handles incremental updates
    // placeholderData removed - it was async which React Query doesn't support
    // The queryFn already handles cached data, so placeholderData is not needed
  });
};

/**
 * Hook to get user's operating categories
 */
export const useUserCategories = (
  userId: string | number | null | undefined,
  enabled = true
) => {
  return useApiQuery({
    queryKey: queryKeys.userCategories.byUser(userId!),
    queryFn: () => getUserCategories(userId!),
    enabled: enabled && !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });
};

/**
 * Hook to get user's operating subcategories
 */
export const useUserSubcategories = (
  userId: string | number | null | undefined,
  enabled = true
) => {
  return useApiQuery({
    queryKey: queryKeys.userSubcategories.byUser(userId!),
    queryFn: () => getUserSubcategories(userId!),
    enabled: enabled && !!userId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });
};

/**
 * Hook to update user's operating categories
 */
export const useUpdateUserCategories = (userId: string | number) => {
  return useApiMutation({
    mutationFn: (categoryIds: number[]) => updateUserCategories(userId, categoryIds),
    invalidateQueries: [
      ['userCategories'],
      ['categories'],
    ],
  });
};

/**
 * Hook to update user's operating subcategories
 */
export const useUpdateUserSubcategories = (userId: string | number) => {
  return useApiMutation({
    mutationFn: (subcategories: Array<{ subcategoryId: number; customPrice: string; priceUnit: string }>) => 
      updateUserSubcategories(userId, subcategories),
    invalidateQueries: [
      queryKeys.userSubcategories.byUser(userId),
      queryKeys.userCategories.byUser(userId),
    ],
  });
};

/**
 * Hook to remove a category and all its subcategories
 */
export const useRemoveUserCategory = (userId: string | number) => {
  return useApiMutation({
    mutationFn: (categoryId: string | number) => 
      removeUserCategory(userId, categoryId),
    invalidateQueries: [
      queryKeys.userSubcategories.byUser(userId),
      queryKeys.userCategories.byUser(userId),
    ],
  });
};

/**
 * Hook to remove specific subcategories
 */
export const useRemoveUserSubcategories = (userId: string | number) => {
  return useApiMutation({
    mutationFn: (subcategoryIds: number[]) => 
      removeUserSubcategories(userId, subcategoryIds),
    invalidateQueries: [
      queryKeys.userSubcategories.byUser(userId),
      queryKeys.userCategories.byUser(userId),
    ],
  });
};
