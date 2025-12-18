/**
 * Categories and Subcategories Cache Service
 * Manages 365-day local cache with incremental updates
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoryWithSubcategories } from '../api/v2/categories';

const CACHE_KEY = '@categories_subcategories_cache';
const LAST_UPDATED_KEY = '@categories_last_updated';
const CACHE_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

interface CachedData {
  data: CategoryWithSubcategories[];
  cachedAt: string;
  lastUpdatedOn: string;
}

interface IncrementalUpdate {
  categories: any[];
  subcategories: any[];
  lastUpdatedOn: string;
}

/**
 * Get cached categories and subcategories data
 */
export const getCachedCategories = async (): Promise<CategoryWithSubcategories[] | null> => {
  try {
    const cachedDataString = await AsyncStorage.getItem(CACHE_KEY);
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
    const cachedData: CachedData = {
      data,
      cachedAt: new Date().toISOString(),
      lastUpdatedOn,
    };

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cachedData));
    await AsyncStorage.setItem(LAST_UPDATED_KEY, lastUpdatedOn);
    console.log('💾 Categories cached successfully');
  } catch (error) {
    console.error('Error saving cache:', error);
  }
};

/**
 * Get last updated timestamp
 */
export const getLastUpdatedOn = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(LAST_UPDATED_KEY);
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
    await AsyncStorage.setItem(LAST_UPDATED_KEY, timestamp);
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

  // Process updated categories
  updates.categories.forEach(updatedCategory => {
    const existingCategory = categoryMap.get(updatedCategory.id);
    
    if (existingCategory) {
      const oldName = existingCategory.name;
      const newName = updatedCategory.name;
      
      console.log(`   📝 Updating category ID ${updatedCategory.id}: "${oldName}" → "${newName}"`);
      
      // Update existing category - IMPORTANT: spread updatedCategory last to ensure new values override old ones
      // This ensures category name changes (like "Paper" → "Papers") are applied
      const updatedCategoryData = {
        ...existingCategory,
        ...updatedCategory, // This will override name, image, etc. from existingCategory
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

  // Process updated subcategories
  updates.subcategories.forEach(updatedSub => {
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
  
  return mergedData;
};

/**
 * Clear cache
 */
export const clearCache = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
    await AsyncStorage.removeItem(LAST_UPDATED_KEY);
    console.log('🗑️ Cache cleared');
    
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
    const cachedDataString = await AsyncStorage.getItem(CACHE_KEY);
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

