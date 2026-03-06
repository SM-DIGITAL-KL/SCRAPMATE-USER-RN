import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getMyBulkSellOrders, BulkSellOrder, getBulkSellOrderDetails } from '../services/api/v2/bulkSell';

const BULK_SELL_ORDERS_KEY = 'bulkSellOrders';

/**
 * Hook to fetch B2C user's bulk sell orders
 */
export const useBulkSellOrders = (userId?: number, options?: { enabled?: boolean }) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [BULK_SELL_ORDERS_KEY, userId],
    queryFn: async () => {
      if (!userId) throw new Error('User ID is required');
      return getMyBulkSellOrders(userId);
    },
    enabled: !!userId && (options?.enabled !== false),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Prefetch order details when orders are loaded
  useEffect(() => {
    if (query.data && query.data.length > 0) {
      query.data.forEach((order: BulkSellOrder) => {
        // Prefetch each order's details
        queryClient.prefetchQuery({
          queryKey: [BULK_SELL_ORDERS_KEY, 'detail', order.id],
          queryFn: () => getBulkSellOrderDetails(order.id),
          staleTime: 5 * 60 * 1000,
        });
      });
    }
  }, [query.data, queryClient]);

  return {
    ...query,
    orders: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};

/**
 * Hook to fetch details of a specific bulk sell order
 */
export const useBulkSellOrderDetails = (orderId?: number, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: [BULK_SELL_ORDERS_KEY, 'detail', orderId],
    queryFn: async () => {
      if (!orderId) throw new Error('Order ID is required');
      return getBulkSellOrderDetails(orderId);
    },
    enabled: !!orderId && (options?.enabled !== false),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};

/**
 * Hook to refresh bulk sell orders
 */
export const useRefreshBulkSellOrders = () => {
  const queryClient = useQueryClient();

  return {
    refresh: (userId?: number) => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: [BULK_SELL_ORDERS_KEY, userId] });
      } else {
        queryClient.invalidateQueries({ queryKey: [BULK_SELL_ORDERS_KEY] });
      }
    },
    refreshOrderDetail: (orderId?: number) => {
      if (orderId) {
        queryClient.invalidateQueries({ queryKey: [BULK_SELL_ORDERS_KEY, 'detail', orderId] });
      }
    },
  };
};
