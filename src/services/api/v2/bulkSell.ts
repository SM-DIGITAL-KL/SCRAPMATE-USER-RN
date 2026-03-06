/**
 * V2 Bulk Sell API for B2C Users
 * Handles fetching bulk sell orders created by B2C users
 */

import { buildApiUrl, getApiHeaders, API_ROUTES } from '../apiConfig';

export interface SubcategoryDetail {
  subcategory_id: number;
  subcategory_name: string;
  quantity: number;
  asking_price?: number;
}

export interface AcceptedBuyer {
  user_id: number;
  user_type: string;
  shop_id?: number | null;
  committed_quantity?: number;
  bidding_price?: number;
  status?: string;
  accepted_at: string;
  images?: string[] | null;
}

export interface BulkSellOrder {
  id: number;
  seller_id: number;
  seller_name: string | null;
  latitude: number;
  longitude: number;
  scrap_type: string | null;
  subcategories?: SubcategoryDetail[] | null;
  quantity: number;
  asking_price?: number | null;
  preferred_distance: number;
  when_available?: string | null;
  location?: string | null;
  additional_notes?: string | null;
  documents?: string[] | null;
  status: string;
  created_at: string;
  updated_at: string;
  payment_status?: string | null;
  payment_amount?: number | null;
  total_committed_quantity?: number;
  accepted_buyers?: AcceptedBuyer[];
}

export interface BulkSellOrdersResponse {
  status: 'success' | 'error';
  msg: string;
  data: BulkSellOrder[];
}

export interface BulkSellOrderDetailResponse {
  status: 'success' | 'error';
  msg: string;
  data: BulkSellOrder;
}

/**
 * Get bulk sell orders created by the current user (B2C)
 */
export const getMyBulkSellOrders = async (
  userId: number
): Promise<BulkSellOrder[]> => {
  const url = buildApiUrl(`${API_ROUTES.V2}/bulk-sell/my-orders?user_id=${userId}`);
  const headers = getApiHeaders();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('❌ Non-JSON response from getMyBulkSellOrders:', text.substring(0, 200));
      throw new Error('Server returned non-JSON response');
    }

    const data: BulkSellOrdersResponse = await response.json();

    if (!response.ok) {
      console.error('❌ Get my bulk sell orders failed:', data);
      throw new Error(data.msg || 'Failed to fetch bulk sell orders');
    }

    return data.data || [];
  } catch (error: any) {
    console.error('❌ Error getting my bulk sell orders:', error);
    throw error;
  }
};

/**
 * Get details of a specific bulk sell order
 */
export const getBulkSellOrderDetails = async (
  orderId: number
): Promise<BulkSellOrder> => {
  const url = buildApiUrl(`${API_ROUTES.V2}/bulk-sell/orders/${orderId}`);
  const headers = getApiHeaders();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('❌ Non-JSON response from getBulkSellOrderDetails:', text.substring(0, 200));
      throw new Error('Server returned non-JSON response');
    }

    const data: BulkSellOrderDetailResponse = await response.json();

    if (!response.ok) {
      console.error('❌ Get bulk sell order details failed:', data);
      throw new Error(data.msg || 'Failed to fetch order details');
    }

    return data.data;
  } catch (error: any) {
    console.error('❌ Error getting bulk sell order details:', error);
    throw error;
  }
};

/**
 * Cancel a bulk sell order
 */
export const cancelBulkSellOrder = async (
  orderId: number,
  userId: number
): Promise<{ status: string; msg: string }> => {
  const url = buildApiUrl(`${API_ROUTES.V2}/bulk-sell/orders/${orderId}/cancel`);
  const headers = getApiHeaders();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_id: userId }),
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('❌ Non-JSON response from cancelBulkSellOrder:', text.substring(0, 200));
      throw new Error('Server returned non-JSON response');
    }

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Cancel bulk sell order failed:', data);
      throw new Error(data.msg || 'Failed to cancel order');
    }

    return data;
  } catch (error: any) {
    console.error('❌ Error cancelling bulk sell order:', error);
    throw error;
  }
};

/**
 * Get status text with proper formatting
 */
export const getBulkSellStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    'pending': 'Pending',
    'active': 'Active',
    'in_progress': 'In Progress',
    'partially_fulfilled': 'Partially Fulfilled',
    'fulfilled': 'Fulfilled',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'expired': 'Expired',
  };
  return statusMap[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Get status color based on order status
 */
export const getBulkSellStatusColor = (status: string): string => {
  const colorMap: Record<string, string> = {
    'pending': '#FF9800',
    'active': '#4CAF50',
    'in_progress': '#2196F3',
    'partially_fulfilled': '#9C27B0',
    'fulfilled': '#4CAF50',
    'completed': '#4CAF50',
    'cancelled': '#F44336',
    'expired': '#9E9E9E',
  };
  return colorMap[status] || '#757575';
};

/**
 * Get payment status text
 */
export const getPaymentStatusText = (status?: string | null): string => {
  if (!status) return 'Not Paid';
  const statusMap: Record<string, string> = {
    'paid': 'Paid',
    'pending': 'Payment Pending',
    'failed': 'Payment Failed',
    'refunded': 'Refunded',
  };
  return statusMap[status] || status;
};
