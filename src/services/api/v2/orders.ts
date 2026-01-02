import { API_BASE_URL, API_KEY } from '../apiConfig';

export interface PickupRequest {
  order_id: number;
  order_number: number;
  customer_id: number;
  address: string;
  latitude: number | null;
  longitude: number | null;
  scrap_description: string;
  estimated_weight_kg: number;
  estimated_price: number;
  status: number;
  preferred_pickup_time?: string;
  created_at: string;
  distance_km?: number;
  images: string[];
}

export interface ActivePickup {
  order_id: number;
  order_number: number;
  order_no: string;
  customer_id: number;
  address: string;
  latitude: number | null;
  longitude: number | null;
  scrap_description: string;
  estimated_weight_kg: number;
  estimated_price: number;
  status: number;
  preferred_pickup_time?: string;
  pickup_time_display: string;
  created_at: string;
  images: string[];
}

export interface CustomerOrder {
  id: number;
  order_number: number;
  order_no: string;
  customer_id: number;
  address: string;
  latitude: number | null;
  longitude: number | null;
  scrap_description: string;
  estim_weight: number;
  estim_price: number;
  status: number;
  preferred_pickup_time?: string;
  created_at: string;
  images: string[];
  shop_id?: number;
  delv_id?: number;
  partner_name?: string;
  shop_address?: string;
  shop_latitude?: number | null;
  shop_longitude?: number | null;
  shop_name?: string;
}

export interface PlacePickupRequestData {
  customer_id: number;
  orderdetails: string | object;
  customerdetails: string;
  latitude: number;
  longitude: number;
  estim_weight: number;
  estim_price: number;
  preferred_pickup_time?: string;
  images?: File[] | Array<{ uri: string; type?: string; fileName?: string }>;
}

/**
 * Place a pickup request order (User type 'U' from user app)
 */
export const placePickupRequest = async (
  data: PlacePickupRequestData
): Promise<{ order_number: number; order_id: number; status: number }> => {
  console.log('📤 [placePickupRequest] Starting request with data:', {
    customer_id: data.customer_id,
    latitude: data.latitude,
    longitude: data.longitude,
    estim_weight: data.estim_weight,
    estim_price: data.estim_price,
    has_orderdetails: !!data.orderdetails,
    has_customerdetails: !!data.customerdetails,
    has_images: !!(data.images && data.images.length > 0),
  });

  const formData = new FormData();
  
  formData.append('customer_id', data.customer_id.toString());
  formData.append(
    'orderdetails',
    typeof data.orderdetails === 'string' 
      ? data.orderdetails 
      : JSON.stringify(data.orderdetails)
  );
  formData.append('customerdetails', data.customerdetails);
  formData.append('latitude', data.latitude.toString());
  formData.append('longitude', data.longitude.toString());
  formData.append('estim_weight', data.estim_weight.toString());
  formData.append('estim_price', data.estim_price.toString());
  
  if (data.preferred_pickup_time) {
    formData.append('preferred_pickup_time', data.preferred_pickup_time);
  }
  
  // Add images (React Native FormData format)
  if (data.images && data.images.length > 0) {
    data.images.slice(0, 6).forEach((image, index) => {
      const imageFile = image as any;
      formData.append(`image${index + 1}`, {
        uri: imageFile.uri || imageFile.path || imageFile.localUri,
        type: imageFile.type || 'image/jpeg',
        name: imageFile.name || imageFile.fileName || `image${index + 1}.jpg`
      } as any);
    });
  }

  console.log('📤 [placePickupRequest] FormData prepared, sending request...');

  const response = await fetch(
    `${API_BASE_URL}/v2/orders/pickup-request`,
    {
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        // Don't set Content-Type for FormData - React Native will set it with boundary
      },
      body: formData as any,
    }
  );

  console.log('📥 [placePickupRequest] Response received:', {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
  });

  // Try to parse response as JSON first to get error message
  let result;
  try {
    const responseText = await response.text();
    console.log('📥 [placePickupRequest] Response text:', responseText.substring(0, 500));
    
    if (!responseText) {
      throw new Error(`Empty response from server (${response.status} ${response.statusText})`);
    }
    
    result = JSON.parse(responseText);
  } catch (parseError: any) {
    console.error('❌ [placePickupRequest] Error parsing response:', parseError);
    // If JSON parsing fails, throw with status text
    if (!response.ok) {
      throw new Error(`Failed to place pickup request: ${response.status} ${response.statusText}`);
    }
    throw new Error(`Failed to parse server response: ${parseError.message}`);
  }

  console.log('📥 [placePickupRequest] Parsed result:', {
    status: result.status,
    has_data: !!result.data,
    msg: result.msg,
  });

  if (!response.ok || result.status === 'error') {
    const errorMsg = result.msg || result.message || `Server error: ${response.status} ${response.statusText}`;
    console.error('❌ [placePickupRequest] API Error Response:', {
      status: response.status,
      statusText: response.statusText,
      result: result
    });
    throw new Error(errorMsg);
  }

  console.log('✅ [placePickupRequest] Success:', result.data);
  return result.data;
};

/**
 * Get available pickup requests (for R, S, SR, D users)
 */
export const getAvailablePickupRequests = async (
  user_id: number,
  user_type: 'R' | 'S' | 'SR' | 'D',
  latitude?: number,
  longitude?: number,
  radius: number = 10
): Promise<PickupRequest[]> => {
  let url = `${API_BASE_URL}/v2/orders/pickup-requests/available?user_id=${user_id}&user_type=${user_type}`;
  
  if (latitude && longitude) {
    url += `&latitude=${latitude}&longitude=${longitude}&radius=${radius}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'api-key': API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch available pickup requests: ${response.statusText}`);
  }

  const result = await response.json();
  
  if (result.status === 'error') {
    throw new Error(result.msg || 'Failed to fetch available pickup requests');
  }

  return result.data;
};

/**
 * Accept a pickup request (R, S, SR, D users)
 */
export const acceptPickupRequest = async (
  orderId: number | string,
  user_id: number,
  user_type: 'R' | 'S' | 'SR' | 'D'
): Promise<{ order_id: number; order_number: number; status: number }> => {
  const response = await fetch(
    `${API_BASE_URL}/v2/orders/pickup-request/${orderId}/accept`,
    {
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id,
        user_type,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to accept pickup request: ${response.statusText}`);
  }

  const result = await response.json();
  
  if (result.status === 'error') {
    throw new Error(result.msg || 'Failed to accept pickup request');
  }

  return result.data;
};

/**
 * Get active pickup order for a user (R, S, SR, D)
 */
export const getActivePickup = async (
  userId: number,
  user_type: 'R' | 'S' | 'SR' | 'D'
): Promise<ActivePickup | null> => {
  const response = await fetch(
    `${API_BASE_URL}/v2/orders/active-pickup/${userId}?user_type=${user_type}`,
    {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch active pickup: ${response.statusText}`);
  }

  const result = await response.json();
  
  if (result.status === 'error') {
    throw new Error(result.msg || 'Failed to fetch active pickup');
  }

  return result.data;
};

/**
 * Get customer orders
 */
export const getCustomerOrders = async (customerId: number): Promise<CustomerOrder[]> => {
  const response = await fetch(
    `${API_BASE_URL}/customer_orders/${customerId}`,
    {
      method: 'GET',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'x-app-type': 'customer_app',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch customer orders: ${response.statusText}`);
  }

  const result = await response.json();
  
  if (result.status === 'error') {
    throw new Error(result.msg || 'Failed to fetch customer orders');
  }

  return result.data || [];
};

/**
 * Start pickup (vendor clicks "Myself Pickup")
 */
export const startPickup = async (
  orderId: number | string,
  user_id: number,
  user_type: 'R' | 'S' | 'SR' | 'D'
): Promise<{ order_id: number; order_number: number; status: number }> => {
  const response = await fetch(
    `${API_BASE_URL}/v2/orders/pickup-request/${orderId}/start-pickup`,
    {
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id,
        user_type,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to start pickup: ${response.statusText}`);
  }

  const result = await response.json();
  
  if (result.status === 'error') {
    throw new Error(result.msg || 'Failed to start pickup');
  }

  return result.data;
};
