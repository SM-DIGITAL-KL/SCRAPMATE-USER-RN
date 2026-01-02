/**
 * V2 Categories API Service
 * Handles category and subcategory API calls
 */

import { buildApiUrl, getApiHeaders } from '../apiConfig';

export interface Category {
  id: number;
  name: string;
  image: string;
  available_in: {
    b2b: boolean;
    b2c: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

export interface Subcategory {
  id: number;
  name: string;
  image: string;
  default_price: string;
  price_unit: string;
  main_category_id: number;
  main_category?: {
    id: number;
    name: string;
    image: string;
  };
  available_in: {
    b2b: boolean;
    b2c: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

export interface CategoryWithSubcategories extends Category {
  subcategories: Subcategory[];
  subcategory_count: number;
}

export interface CategoriesResponse {
  status: string;
  msg: string;
  data: Category[];
  meta?: {
    total: number;
    b2b_available: number;
    b2c_available: number;
  };
}

export interface SubcategoriesResponse {
  status: string;
  msg: string;
  data: Subcategory[];
  meta?: {
    total: number;
    b2b_available: number;
    b2c_available: number;
    category_id?: number | null;
  };
}

export interface CategoriesWithSubcategoriesResponse {
  status: string;
  msg: string;
  data: CategoryWithSubcategories[];
  meta?: {
    total_categories: number;
    total_subcategories: number;
    b2b_available: number;
    b2c_available: number;
    stats?: {
      totalOrders: number;
      totalEarned: number;
      totalRecycled: number;
    };
  };
}

/**
 * Get all categories
 * @param userType - Optional filter: 'b2b', 'b2c', or 'all'
 */
export const getCategories = async (
  userType?: 'b2b' | 'b2c' | 'all'
): Promise<CategoriesResponse> => {
  const url = buildApiUrl('/v2/categories');
  const queryParams = userType && userType !== 'all' ? `?userType=${userType}` : '';
  const fullUrl = `${url}${queryParams}`;

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: getApiHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get all subcategories
 * @param categoryId - Optional filter by main category ID
 * @param userType - Optional filter: 'b2b', 'b2c', or 'all'
 */
export const getSubcategories = async (
  categoryId?: number,
  userType?: 'b2b' | 'b2c' | 'all'
): Promise<SubcategoriesResponse> => {
  const params = new URLSearchParams();
  if (categoryId) {
    params.append('categoryId', categoryId.toString());
  }
  if (userType && userType !== 'all') {
    params.append('userType', userType);
  }

  const url = buildApiUrl('/v2/subcategories');
  const queryString = params.toString();
  const fullUrl = queryString ? `${url}?${queryString}` : url;

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: getApiHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch subcategories: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get categories with their subcategories grouped
 * @param userType - Optional filter: 'b2b', 'b2c', or 'all'
 */
export const getCategoriesWithSubcategories = async (
  userType?: 'b2b' | 'b2c' | 'all'
): Promise<CategoriesWithSubcategoriesResponse> => {
  const url = buildApiUrl('/v2/categories/with-subcategories');
  const queryParams = userType && userType !== 'all' ? `?userType=${userType}` : '';
  const fullUrl = `${url}${queryParams}`;

  const response = await fetch(fullUrl, {
    method: 'GET',
    headers: getApiHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch categories with subcategories: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get incremental updates for categories and subcategories
 * @param userType - Optional filter: 'b2b', 'b2c', or 'all'
 * @param lastUpdatedOn - Optional ISO timestamp string, if not provided returns all
 */
export const getIncrementalUpdates = async (
  userType?: 'b2b' | 'b2c' | 'all',
  lastUpdatedOn?: string,
  userId?: number,
  type?: 'customer' | 'shop' | 'delivery'
): Promise<{
  status: string;
  msg: string;
  data: {
    categories: Category[];
    subcategories: Subcategory[];
    deleted?: {
      categories?: Array<{ id: number; deleted: boolean }>;
      subcategories?: Array<{ id: number; deleted: boolean }>;
    };
    stats?: {
      totalOrders: number;
      totalEarned: number;
      totalRecycled: number;
    };
  };
  meta: {
    categories_count: number;
    subcategories_count: number;
    deleted_categories_count?: number;
    deleted_subcategories_count?: number;
    lastUpdatedOn: string;
    hasUpdates: boolean;
  };
  hitBy: string;
}> => {
  const url = buildApiUrl('/v2/categories/incremental-updates');
  const params = new URLSearchParams();
  
  if (userType && userType !== 'all') {
    params.append('userType', userType);
  }
  if (lastUpdatedOn) {
    params.append('lastUpdatedOn', lastUpdatedOn);
  }
  if (userId) {
    params.append('userId', userId.toString());
  }
  if (type) {
    params.append('type', type);
  }
  
  const queryString = params.toString();
  const fullUrl = queryString ? `${url}?${queryString}` : url;

  console.log('📡 [getIncrementalUpdates] Making API request:');
  console.log(`   Endpoint: ${fullUrl}`);
  console.log(`   userType: ${userType || 'all'}`);
  console.log(`   lastUpdatedOn: ${lastUpdatedOn || 'not provided'}`);
  console.log(`   Method: GET`);

  let response;
  try {
    response = await fetch(fullUrl, {
    method: 'GET',
    headers: getApiHeaders(),
  });
  } catch (networkError: any) {
    // Network error (offline, timeout, etc.)
    console.warn('⚠️ [getIncrementalUpdates] Network error (offline or connection issue):', networkError.message);
    throw new Error(`Network request failed: ${networkError.message || 'Please check your internet connection'}`);
  }

  console.log(`   Response Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    console.error(`❌ [getIncrementalUpdates] API request failed:`, {
      status: response.status,
      statusText: response.statusText,
      url: fullUrl,
    });
    throw new Error(`Failed to fetch incremental updates: ${response.statusText}`);
  }

  const data = await response.json();
  
  console.log('📥 [getIncrementalUpdates] API Response received:');
  console.log(`   Status: ${data.status}`);
  console.log(`   Message: ${data.msg}`);
  console.log(`   Has Updates: ${data.meta?.hasUpdates || false}`);
  console.log(`   Categories Count: ${data.data?.categories?.length || 0}`);
  console.log(`   Subcategories Count: ${data.data?.subcategories?.length || 0}`);
  console.log(`   Deleted Categories: ${data.data?.deleted?.categories?.length || 0}`);
  console.log(`   Deleted Subcategories: ${data.data?.deleted?.subcategories?.length || 0}`);
  console.log(`   Last Updated On: ${data.meta?.lastUpdatedOn || 'N/A'}`);
  console.log(`   Hit By: ${data.hitBy || 'N/A'}`);
  
  if (data.data?.categories && data.data.categories.length > 0) {
    console.log('   📋 Updated Categories:');
    data.data.categories.forEach((cat, index) => {
      console.log(`      ${index + 1}. ID: ${cat.id}, Name: "${cat.name}"`);
      console.log(`         Updated At: ${cat.updated_at || 'N/A'}`);
    });
  }
  
  if (data.data?.subcategories && data.data.subcategories.length > 0) {
    console.log('   📋 Updated Subcategories (first 5):');
    data.data.subcategories.slice(0, 5).forEach((sub, index) => {
      console.log(`      ${index + 1}. ID: ${sub.id}, Name: "${sub.name}", Category ID: ${sub.main_category_id}`);
    });
    if (data.data.subcategories.length > 5) {
      console.log(`      ... and ${data.data.subcategories.length - 5} more subcategories`);
    }
  }
  
  console.log('✅ [getIncrementalUpdates] API call completed successfully');
  
  return data;
};

/**
 * Refresh image URL for a category or subcategory
 * @param categoryId - Category ID (optional if subcategoryId is provided)
 * @param subcategoryId - Subcategory ID (optional if categoryId is provided)
 * @returns Fresh presigned URL for the image
 */
export const refreshImageUrl = async (
  categoryId?: number,
  subcategoryId?: number
): Promise<{
  status: string;
  msg: string;
  data: {
    image: string;
    entityType: 'category' | 'subcategory';
    entityId: number;
    expiresIn: number;
  };
}> => {
  const url = buildApiUrl('/v2/categories/refresh-image');
  
  const body: { categoryId?: number; subcategoryId?: number } = {};
  if (categoryId) {
    body.categoryId = categoryId;
  }
  if (subcategoryId) {
    body.subcategoryId = subcategoryId;
  }

  console.log('🔄 [refreshImageUrl] Making API request:');
  console.log(`   Endpoint: ${url}`);
  console.log(`   Body:`, body);
  console.log(`   Method: POST`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...getApiHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  console.log(`   Response Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    console.error(`❌ [refreshImageUrl] API request failed:`, {
      status: response.status,
      statusText: response.statusText,
      url,
    });
    throw new Error(`Failed to refresh image URL: ${response.statusText}`);
  }

  const data = await response.json();
  
  console.log('✅ [refreshImageUrl] API Response received:');
  console.log(`   Status: ${data.status}`);
  console.log(`   Message: ${data.msg}`);
  console.log(`   Entity Type: ${data.data?.entityType}`);
  console.log(`   Entity ID: ${data.data?.entityId}`);
  console.log(`   Image URL: ${data.data?.image ? data.data.image.substring(0, 100) + '...' : 'N/A'}`);
  
  return data;
};

// REMOVED: getSubcategoriesPaginated - Use getCategoriesWithSubcategories instead
// The paginated API has been removed. Use getCategoriesWithSubcategories for a single API call that returns all data.
