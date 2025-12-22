/**
 * Categories and Subcategories Cache Service
 * Manages 365-day local cache with incremental updates
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoryWithSubcategories } from '../api/v2/categories';
import { getUserData } from '../auth/authService';

// Cache keys are user-specific to support multiple users on the same device
const getCacheKey = async (): Promise<string> => {
  const userData = await getUserData();
  const userId = userData?.id || 'anonymous';
  return `@categories_subcategories_cache_${userId}`;
};

const getLastUpdatedKey = async (): Promise<string> => {
  const userData = await getUserData();
  const userId = userData?.id || 'anonymous';
  return `@categories_last_updated_${userId}`;
};

const CACHE_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

interface CachedData {
  data: CategoryWithSubcategories[];
  cachedAt: string;
  lastUpdatedOn: string;
}

interface IncrementalUpdate {
  categories: any[];
  subcategories: any[];
  deleted?: {
    categories?: Array<{ id: number; deleted: boolean }>;
    subcategories?: Array<{ id: number; deleted: boolean }>;
  };
  lastUpdatedOn: string;
}

/**
 * Get cached categories and subcategories data
 */
export const getCachedCategories = async (): Promise<CategoryWithSubcategories[] | null> => {
  try {
    const cacheKey = await getCacheKey();
    const cachedDataString = await AsyncStorage.getItem(cacheKey);
    if (!cachedDataString) {
      return null;
    }

    const cachedData: CachedData = JSON.parse(cachedDataString);
    const cachedAt = new Date(cachedData.cachedAt);
    const now = new Date();
    const age = now.getTime() - cachedAt.getTime();

    // Check if cache is expired (older than 365 days)
    if (age > CACHE_DURATION_MS) {
      console.log('📦 Cache expired, clearing...');
      await clearCache();
      return null;
    }

    return cachedData.data;
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
};

/**
 * Save categories and subcategories data to cache
 */
export const saveCachedCategories = async (
  data: CategoryWithSubcategories[],
  lastUpdatedOn: string
): Promise<void> => {
  try {
    const cacheKey = await getCacheKey();
    const lastUpdatedKey = await getLastUpdatedKey();
    const cachedData: CachedData = {
      data,
      cachedAt: new Date().toISOString(),
      lastUpdatedOn,
    };

    await AsyncStorage.setItem(cacheKey, JSON.stringify(cachedData));
    await AsyncStorage.setItem(lastUpdatedKey, lastUpdatedOn);
    console.log('💾 Categories cached successfully (user-specific)');
  } catch (error) {
    console.error('Error saving cache:', error);
  }
};

/**
 * Get last updated timestamp
 */
export const getLastUpdatedOn = async (): Promise<string | null> => {
  try {
    const lastUpdatedKey = await getLastUpdatedKey();
    return await AsyncStorage.getItem(lastUpdatedKey);
  } catch (error) {
    console.error('Error reading lastUpdatedOn:', error);
    return null;
  }
};

/**
 * Update last updated timestamp
 */
export const updateLastUpdatedOn = async (timestamp: string): Promise<void> => {
  try {
    const lastUpdatedKey = await getLastUpdatedKey();
    await AsyncStorage.setItem(lastUpdatedKey, timestamp);
  } catch (error) {
    console.error('Error updating lastUpdatedOn:', error);
  }
};

/**
 * Merge incremental updates with cached data
 */
export const mergeIncrementalUpdates = (
  cachedData: CategoryWithSubcategories[],
  updates: IncrementalUpdate
): CategoryWithSubcategories[] => {
  console.log('🔄 [mergeIncrementalUpdates] Starting merge...');
  console.log(`   Cached categories: ${cachedData.length}`);
  console.log(`   Updated categories: ${updates.categories.length}`);
  console.log(`   Updated subcategories: ${updates.subcategories.length}`);
  
  const categoryMap = new Map<number, CategoryWithSubcategories>();
  const subcategoryMap = new Map<number, any>();

  // Add all cached categories to map
  cachedData.forEach(category => {
    categoryMap.set(category.id, { ...category });
  });

  // First, remove deleted categories BEFORE processing updates
  if (updates.deleted?.categories && updates.deleted.categories.length > 0) {
    console.log(`   🗑️  [DELETE] Removing ${updates.deleted.categories.length} deleted category/categories`);
    let removedCount = 0;
    updates.deleted.categories.forEach(deletedCat => {
      if (categoryMap.has(deletedCat.id)) {
        const categoryName = categoryMap.get(deletedCat.id)?.name || 'Unknown';
        console.log(`   🗑️  [DELETE] Removing deleted category ID ${deletedCat.id} (${categoryName})`);
        categoryMap.delete(deletedCat.id);
        removedCount++;
      } else {
        console.log(`   ⚠️  [DELETE] Category ID ${deletedCat.id} not found in cache (already removed or never existed)`);
      }
    });
    console.log(`   ✅ [DELETE] Removed ${removedCount} deleted category/categories from cache`);
  }

  // Process updated categories
  updates.categories.forEach(updatedCategory => {
    // Skip if category is marked as deleted (should be in deleted array, but check just in case)
    if (updatedCategory.deleted) {
      console.log(`   🗑️  Skipping deleted category ID ${updatedCategory.id} from updates`);
      categoryMap.delete(updatedCategory.id);
      return;
    }
    
    const existingCategory = categoryMap.get(updatedCategory.id);
    
    if (existingCategory) {
      const oldName = existingCategory.name;
      const newName = updatedCategory.name;
      const oldImage = existingCategory.image || '';
      const newImage = updatedCategory.image || '';
      const imageChanged = oldImage !== newImage;
      
      console.log(`   📝 Updating category ID ${updatedCategory.id}: "${oldName}" → "${newName}"`);
      console.log(`   🔍 [Image Check] Category ${updatedCategory.id}:`);
      console.log(`      Old image: ${oldImage ? oldImage.substring(0, 100) + '...' : 'none'}`);
      console.log(`      New image: ${newImage ? newImage.substring(0, 100) + '...' : 'none'}`);
      console.log(`      Image changed: ${imageChanged}`);
      console.log(`      Updated category keys: ${Object.keys(updatedCategory).join(', ')}`);
      console.log(`      Updated category.image value: ${updatedCategory.image ? 'present' : 'missing'}`);
      
      if (imageChanged) {
        console.log(`   🖼️  Image changed: ${oldImage.substring(0, 80)}... → ${newImage.substring(0, 80)}...`);
      } else {
        console.log(`   ⚠️  Image NOT changed - old and new URLs are the same or both empty`);
      }
      
      // Update existing category - IMPORTANT: spread updatedCategory last to ensure new values override old ones
      // This ensures category name changes (like "Paper" → "Papers") are applied
      // Always add cache-busting parameter when category is updated to force image reload
      // This ensures UI updates even when backend returns same URL but image was actually updated
      let imageUrl = updatedCategory.image || existingCategory.image || '';
      
      // Always apply cache-busting if category was updated (has updated_at) and has an image URL
      // This forces React Native Image component to reload even if URL appears the same
      if (updatedCategory.updated_at && imageUrl && imageUrl.trim().length > 0) {
        try {
          // Check if URL is valid HTTP/HTTPS URL
          if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            try {
              // Clean the URL first - remove trailing slashes before query string
              let cleanUrl = imageUrl.trim();
              
              // Remove existing _t parameter if present (using regex to handle both ? and &)
              cleanUrl = cleanUrl.replace(/[?&]_t=\d+/g, '');
              
              // Fix malformed URLs: remove trailing slash before query string (e.g., ...png/? → ...png?)
              // Also handle case where URL ends with /? (slash followed by question mark)
              cleanUrl = cleanUrl.replace(/\/(\?|$)/, (match, p1) => p1 === '?' ? '?' : '');
              
              // Remove trailing ? if it exists and we're about to add a query param
              cleanUrl = cleanUrl.replace(/\?$/, '');
              
              // Add cache-busting query parameter to force image reload
              // Use current time to ensure unique URL each time
              const timestamp = Date.now();
              
              // Check if URL already has query parameters (after cleaning)
              const hasQuery = cleanUrl.includes('?');
              const separator = hasQuery ? '&' : '?';
              
              // Add the cache-busting parameter
              imageUrl = `${cleanUrl}${separator}_t=${timestamp}`;
              
              console.log(`   🔄 [Cache Bust] Added timestamp parameter (_t=${timestamp}) to force image reload`);
              console.log(`      Original URL: ${(updatedCategory.image || existingCategory.image || '').substring(0, 100)}...`);
              console.log(`      Cache-busted URL: ${imageUrl.substring(0, 150)}...`);
            } catch (urlError: any) {
              // Fallback: simple string manipulation if URL parsing fails
              console.warn(`   ⚠️  [Cache Bust] URL parsing failed, using string manipulation:`, urlError?.message || urlError);
              const timestamp = Date.now();
              // Remove existing _t parameter and fix trailing slash
              let cleanUrl = imageUrl.replace(/[?&]_t=\d+/g, '').replace(/\/(\?|$)/, (match, p1) => p1 === '?' ? '?' : '');
              cleanUrl = cleanUrl.replace(/\?$/, '');
              const hasQuery = cleanUrl.includes('?');
              const separator = hasQuery ? '&' : '?';
              imageUrl = `${cleanUrl}${separator}_t=${timestamp}`;
              console.log(`   🔄 [Cache Bust] Added timestamp using fallback method`);
            }
          } else {
            console.log(`   ⚠️  [Cache Bust] Skipped - URL doesn't start with http/https: ${imageUrl.substring(0, 50)}...`);
          }
        } catch (urlError: any) {
          // If URL parsing fails, use original URL
          console.warn(`   ⚠️  [Cache Bust] Could not add cache-busting parameter:`, urlError?.message || urlError);
          console.warn(`      URL that failed: ${imageUrl.substring(0, 100)}...`);
        }
      } else {
        if (!updatedCategory.updated_at) {
          console.log(`   ℹ️  [Cache Bust] Skipped - no updated_at timestamp`);
        } else if (!imageUrl || imageUrl.trim().length === 0) {
          console.log(`   ℹ️  [Cache Bust] Skipped - no image URL`);
        }
      }
      
      const updatedCategoryData = {
        ...existingCategory,
        ...updatedCategory, // This will override name, image, etc. from existingCategory
        image: imageUrl, // Use cache-busted image URL if applicable
        // Preserve subcategories from existing category (don't overwrite with empty array)
        subcategories: existingCategory.subcategories || [],
      };
      
      categoryMap.set(updatedCategory.id, updatedCategoryData);
      
      // Verify the update
      const updated = categoryMap.get(updatedCategory.id);
      if (updated?.name !== newName) {
        console.warn(`   ⚠️ Warning: Category name not updated correctly! Expected "${newName}", got "${updated?.name}"`);
        console.warn(`   Debug info:`, {
          existingName: existingCategory.name,
          updatedName: updatedCategory.name,
          finalName: updated?.name,
          updatedCategoryKeys: Object.keys(updatedCategory),
        });
      } else {
        console.log(`   ✅ Category name updated successfully: "${updated.name}"`);
      }
      
      // Verify image update
      // Note: Compare base URLs (without cache-busting _t parameter) since we add _t for cache-busting
      if (imageChanged) {
        const finalImage = updated?.image || '';
        // Remove _t parameter from both URLs for comparison
        // Also normalize trailing slashes and query string format
        const normalizeUrl = (url: string) => {
          if (!url) return '';
          try {
            // Remove _t parameter using regex (handles both ?_t= and &_t=)
            let normalized = url.replace(/[?&]_t=\d+/g, '');
            // Fix malformed URLs like ...png/? to ...png?
            normalized = normalized.replace(/\/(\?|$)/, '$1');
            // Remove trailing ? if no other query params
            normalized = normalized.replace(/\?$/, '');
            // Try to parse as URL to ensure it's valid
            try {
              const urlObj = new URL(normalized);
              return urlObj.toString();
            } catch {
              return normalized;
            }
          } catch {
            // Fallback: simple regex replacement
            return url.replace(/[?&]_t=\d+/g, '').replace(/\/(\?|$)/, '$1').replace(/\?$/, '');
          }
        };
        const normalizedNewImage = normalizeUrl(newImage);
        const normalizedFinalImage = normalizeUrl(finalImage);
        
        if (normalizedFinalImage !== normalizedNewImage) {
          console.warn(`   ⚠️ Warning: Category image not updated correctly!`);
          console.warn(`   Expected (normalized): ${normalizedNewImage.substring(0, 100)}...`);
          console.warn(`   Got (normalized): ${normalizedFinalImage.substring(0, 100)}...`);
        } else {
          console.log(`   ✅ Category image updated successfully`);
          if (finalImage !== newImage) {
            console.log(`   ℹ️  Cache-busting parameter added: ${finalImage.includes('_t=') ? 'Yes' : 'No'}`);
          }
        }
      }
    } else {
      // New category
      console.log(`   ➕ Adding new category ID ${updatedCategory.id}: "${updatedCategory.name}"`);
      categoryMap.set(updatedCategory.id, {
        ...updatedCategory,
        subcategories: [],
        subcategory_count: 0,
      });
    }
  });

  // First, remove deleted subcategories BEFORE processing updates
  if (updates.deleted?.subcategories && updates.deleted.subcategories.length > 0) {
    console.log(`   🗑️  [DELETE] Removing ${updates.deleted.subcategories.length} deleted subcategory/subcategories`);
    let removedCount = 0;
    updates.deleted.subcategories.forEach(deletedSub => {
      // Find and remove from all categories
      categoryMap.forEach((category) => {
        const subIndex = category.subcategories.findIndex(sub => sub.id === deletedSub.id);
        if (subIndex >= 0) {
          const subName = category.subcategories[subIndex]?.name || 'Unknown';
          console.log(`   🗑️  [DELETE] Removing deleted subcategory ID ${deletedSub.id} (${subName}) from category ${category.id} (${category.name})`);
          category.subcategories.splice(subIndex, 1);
          category.subcategory_count = category.subcategories.length;
          removedCount++;
        }
      });
    });
    console.log(`   ✅ [DELETE] Removed ${removedCount} deleted subcategory/subcategories from cache`);
  }

  // Process updated subcategories
  updates.subcategories.forEach(updatedSub => {
    // Skip if subcategory is marked as deleted
    if (updatedSub.deleted) {
      console.log(`   🗑️  Skipping deleted subcategory ID ${updatedSub.id} from updates`);
      // Remove from all categories
      categoryMap.forEach((category) => {
        const subIndex = category.subcategories.findIndex(sub => sub.id === updatedSub.id);
        if (subIndex >= 0) {
          category.subcategories.splice(subIndex, 1);
          category.subcategory_count = category.subcategories.length;
        }
      });
      return;
    }
    
    subcategoryMap.set(updatedSub.id, updatedSub);
    
    const categoryId = updatedSub.main_category_id;
    const category = categoryMap.get(categoryId);
    
    if (category) {
      // Find existing subcategory in category
      const subcategoryIndex = category.subcategories.findIndex(
        sub => sub.id === updatedSub.id
      );
      
      if (subcategoryIndex >= 0) {
        // Update existing subcategory
        category.subcategories[subcategoryIndex] = {
          ...category.subcategories[subcategoryIndex],
          ...updatedSub,
        };
      } else {
        // New subcategory
        category.subcategories.push(updatedSub);
        category.subcategory_count = category.subcategories.length;
      }
    }
  });

  // Convert map back to array
  const mergedData = Array.from(categoryMap.values());
  
  // Sort by category name
  mergedData.sort((a, b) => a.name.localeCompare(b.name));
  
  // Log final count after deletions
  const deletedCount = (updates.deleted?.categories?.length || 0) + (updates.deleted?.subcategories?.length || 0);
  if (deletedCount > 0) {
    console.log(`   ✅ [mergeIncrementalUpdates] Merge complete. Final categories: ${mergedData.length} (removed ${deletedCount} deleted item(s))`);
  } else {
    console.log(`   ✅ [mergeIncrementalUpdates] Merge complete. Final categories: ${mergedData.length}`);
  }
  
  return mergedData;
};

/**
 * Clear cache (for current user)
 */
export const clearCache = async (): Promise<void> => {
  try {
    const cacheKey = await getCacheKey();
    const lastUpdatedKey = await getLastUpdatedKey();
    await AsyncStorage.removeItem(cacheKey);
    await AsyncStorage.removeItem(lastUpdatedKey);
    console.log('🗑️ Cache cleared (user-specific)');
    
    // Also invalidate React Query cache for categories
    try {
      const { queryClient } = require('../api/queryClient');
      const { queryKeys } = require('../api/queryKeys');
      
      // Invalidate all category-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.categories.all, 'withSubcategories'] });
      console.log('🔄 React Query cache invalidated for categories');
    } catch (queryError) {
      console.warn('Could not invalidate React Query cache:', queryError);
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
};

/**
 * Check if cache exists and is valid
 */
export const isCacheValid = async (): Promise<boolean> => {
  try {
    const cacheKey = await getCacheKey();
    const cachedDataString = await AsyncStorage.getItem(cacheKey);
    if (!cachedDataString) {
      return false;
    }

    const cachedData: CachedData = JSON.parse(cachedDataString);
    const cachedAt = new Date(cachedData.cachedAt);
    const now = new Date();
    const age = now.getTime() - cachedAt.getTime();

    return age <= CACHE_DURATION_MS;
  } catch (error) {
    return false;
  }
};

/**
 * Force refresh by clearing cache and lastUpdatedOn
 * This will force a full fetch from the API on next request
 */
export const forceRefreshCache = async (): Promise<void> => {
  try {
    await clearCache();
    console.log('🔄 Cache force refreshed - next fetch will get fresh data from API');
  } catch (error) {
    console.error('Error force refreshing cache:', error);
  }
};

