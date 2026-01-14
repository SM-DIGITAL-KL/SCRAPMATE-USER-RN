import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTranslation } from 'react-i18next';
import { getUserData } from '../../services/auth/authService';
import { getCustomerOrders, CustomerOrder } from '../../services/api/v2/orders';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../services/api/queryKeys';
import { useSubcategories } from '../../hooks/useCategories';

const MyOrdersScreen = ({ navigation }: any) => {
  const { theme, isDark, themeName } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const styles = useMemo(() => getStyles(theme, themeName), [theme, themeName]);

  const [userData, setUserData] = useState<any>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);

  useEffect(() => {
    const loadUserData = async () => {
      const data = await getUserData();
      setUserData(data);
      if (data?.id) {
        setCustomerId(data.id);
      }
    };
    loadUserData();
  }, []);

  // Fetch customer orders
  const { data: ordersData, isLoading, refetch, isRefetching } = useQuery<CustomerOrder[]>({
    queryKey: queryKeys.orders.byUser(customerId || 0),
    queryFn: () => getCustomerOrders(customerId!),
    enabled: !!customerId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Ensure orders is always an array to prevent .map() errors
  const orders = Array.isArray(ordersData) ? ordersData : [];

  // Fetch subcategories for item images
  const { data: subcategoriesData } = useSubcategories(undefined, 'b2c', true);

  // Refresh on focus
  useFocusEffect(
    React.useCallback(() => {
      if (customerId) {
        refetch();
      }
    }, [customerId, refetch])
  );

  const getStatusColor = (status: number): string => {
    switch (status) {
      case 5: // Pickup Completed
        return 'green';
      case 1: // Pending
      case 2: // Assigned
      case 3: // Pickup Started
      case 4: // Arrived Location
        return 'mint';
      default:
        return 'mint';
    }
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 1: {
        const text = t('orders.status.pending');
        return text && text !== 'orders.status.pending' ? text : 'Pending';
      }
      case 2: {
        const text = t('orders.status.assigned');
        return text && text !== 'orders.status.assigned' ? text : 'Assigned';
      }
      case 3: {
        const text = t('orders.status.pickupStarted') || t('orders.status.accepted');
        return text && text !== 'orders.status.pickupStarted' && text !== 'orders.status.accepted' ? text : 'Pickup Started';
      }
      case 4: {
        const text = t('orders.status.arrived');
        return text && text !== 'orders.status.arrived' ? text : 'Arrived';
      }
      case 5: {
        const text = t('orders.status.completed');
        return text && text !== 'orders.status.completed' ? text : 'Completed';
      }
      default: {
        const text = t('orders.status.unknown');
        return text && text !== 'orders.status.unknown' ? text : 'Unknown';
      }
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const formatAmount = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatAddress = (address: string | object | null | undefined): string => {
    if (!address) return '';
    
    if (typeof address === 'string') {
      try {
        const parsed = JSON.parse(address);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed.address || parsed.formattedAddress || parsed.full_address || JSON.stringify(parsed);
        }
      } catch {
        return address;
      }
      return address;
    }
    
    if (typeof address === 'object') {
      return (address as any).address || (address as any).formattedAddress || (address as any).full_address || JSON.stringify(address);
    }
    
    return String(address);
  };

  // Parse order items from orderdetails
  const parseOrderItems = (order: CustomerOrder) => {
    try {
      const orderdetails = (order as any).orderdetails;
      if (!orderdetails) return [];

      let items: any[] = [];
      if (typeof orderdetails === 'string') {
        items = JSON.parse(orderdetails);
      } else if (Array.isArray(orderdetails)) {
        items = orderdetails;
      } else if (typeof orderdetails === 'object') {
        items = [orderdetails];
      }

      const subcategories = Array.isArray(subcategoriesData?.data) ? subcategoriesData.data : [];

      return items.map((item: any, index: number) => {
        const materialName = item.material_name || item.name || item.category_name || 'Unknown';
        
        // Find matching subcategory for image
        const subcategory = subcategories.find((sub: any) => {
          const subName = (sub.name || '').toLowerCase().trim();
          const itemName = materialName.toLowerCase().trim();
          return subName === itemName || subName.includes(itemName) || itemName.includes(subName);
        });

        return {
          name: materialName,
          image: subcategory?.image || null,
          weight: item.expected_weight_kg || item.weight || 0,
          quantity: item.quantity || item.qty || 0,
          pricePerKg: item.price_per_kg || 0,
        };
      });
    } catch (error) {
      console.error('Error parsing order items:', error);
      return [];
    }
  };

  const getStatusStyle = (statusColor: string) => {
    switch (statusColor) {
      case 'green':
        return styles.statusChipCompleted;
      case 'mint':
        return styles.statusChipPending;
      case 'dark':
        return styles.statusChipCancelled;
      default:
        return styles.statusChipCompleted;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? theme.background : '#FFFFFF'}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
        <AutoText style={styles.headerTitle} numberOfLines={1}>
          {t('myOrders.title') || t('userProfile.myOrders') || 'My Orders'}
        </AutoText>
        <TouchableOpacity>
          <MaterialCommunityIcons
            name="filter"
            size={24}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.primary}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AutoText style={styles.loadingText}>
              {t('common.loading') || 'Loading orders...'}
            </AutoText>
          </View>
        ) : !orders || orders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="package-variant-closed"
              size={64}
              color={theme.textSecondary}
            />
            <AutoText style={styles.emptyText}>
              {t('orders.noOrders') || 'No orders found'}
            </AutoText>
            <AutoText style={styles.emptySubtext}>
              {t('orders.noOrdersSubtext') || 'Your orders will appear here'}
            </AutoText>
          </View>
        ) : (
          orders.map((order) => {
            const statusColor = getStatusColor(order.status);
            const orderItems = parseOrderItems(order);
            return (
              <TouchableOpacity
                key={order.id}
                style={styles.orderCard}
                onPress={() => {
                  navigation.navigate('OrderTracking' as never, { order } as never);
                }}
                activeOpacity={0.7}
              >
                {/* Order ID and Status Header */}
                <View style={styles.orderHeader}>
                  <View style={styles.orderIdContainer}>
                    <MaterialCommunityIcons
                      name="receipt"
                      size={16}
                      color={theme.primary}
                    />
                    <AutoText style={styles.orderIdText} numberOfLines={1}>
                      {t('orders.orderNumber') || 'Order'}: #{order?.order_number || order?.order_no}
                    </AutoText>
                  </View>
                  <View style={getStatusStyle(statusColor)}>
                    <AutoText
                      style={[
                        styles.statusText,
                        statusColor === 'mint' && styles.statusTextPending,
                        statusColor === 'dark' && styles.statusTextCancelled,
                      ]}
                      numberOfLines={1}
                    >
                      {getStatusText(order.status)}
                    </AutoText>
                  </View>
                </View>

                {/* Date */}
                <AutoText style={styles.orderDate} numberOfLines={1}>
                  {formatDate(order.created_at)}
                </AutoText>

                {/* Amount */}
                <View style={styles.amountContainer}>
                  <AutoText style={styles.amount} numberOfLines={1}>
                    {formatAmount(order.estim_price || 0)}
                  </AutoText>
                  <AutoText style={styles.earningsDescription} numberOfLines={1}>
                    {t('myOrders.earningsForPickup') || 'Earnings for this pickup'}
                  </AutoText>
                </View>

                {/* Shop Name and Address (Beautiful UI) */}
                {order.status >= 2 && (order.shop_name || order.shop_address) && (
                  <View style={styles.shopNameSection}>
                    <View style={styles.shopIconContainer}>
                      <MaterialCommunityIcons
                        name="store"
                        size={18}
                        color={theme.primary}
                      />
                    </View>
                    <View style={styles.shopInfoContainer}>
                      <AutoText style={styles.shopNameLabel} numberOfLines={1}>
                        {t('orders.shopName') || 'Shop'}
                      </AutoText>
                      <AutoText style={styles.shopNameText} numberOfLines={3}>
                        {[order.shop_name, order.shop_address && formatAddress(order.shop_address)]
                          .filter(Boolean)
                          .join('\n')}
                      </AutoText>
                    </View>
                  </View>
                )}

                {/* Items to Pickup */}
                {orderItems.length > 0 && (
                  <View style={styles.itemsSection}>
                    <AutoText style={styles.itemsTitle} numberOfLines={1}>
                      {t('deliveryTracking.itemsForPickup') || 'Items for Pickup'}:
                    </AutoText>
                    <View style={styles.itemsList}>
                      {orderItems.slice(0, 3).map((item, index) => (
                        <View key={index} style={styles.itemRow}>
                          <View style={styles.itemImageContainer}>
                            {item.image ? (
                              <Image
                                source={{ uri: item.image }}
                                style={styles.itemImage}
                                resizeMode="cover"
                              />
                            ) : (
                              <View style={styles.itemImagePlaceholder}>
                                <MaterialCommunityIcons
                                  name="package-variant"
                                  size={16}
                                  color={theme.textSecondary}
                                />
                              </View>
                            )}
                          </View>
                          <View style={styles.itemInfo}>
                            <AutoText style={styles.itemName} numberOfLines={1}>
                              {item.name}
                            </AutoText>
                            {(item.weight > 0 || item.quantity > 0) && (
                              <AutoText style={styles.itemDetails} numberOfLines={1}>
                                {item.quantity > 0 && `${item.quantity} × `}
                                {item.weight > 0 && `${item.weight} kg`}
                              </AutoText>
                            )}
                          </View>
                        </View>
                      ))}
                      {orderItems.length > 3 && (
                        <AutoText style={styles.moreItemsText} numberOfLines={1}>
                          +{orderItems.length - 3} more items
                        </AutoText>
                      )}
                    </View>
                  </View>
                )}

                {/* Track Order indicator when pickup is started (status 3) */}
                {order.status === 3 && (
                  <View style={styles.trackIndicator}>
                    <MaterialCommunityIcons
                      name="map-marker-path"
                      size={16}
                      color={theme.primary}
                    />
                    <AutoText style={styles.trackIndicatorText} numberOfLines={1}>
                      {t('myOrders.trackOrder') || 'Track Order'}
                    </AutoText>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const getStyles = (theme: any, themeName?: string) =>
  ScaledSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: '18@s',
      paddingVertical: '16@vs',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: themeName === 'whitePurple' ? '#FFFFFF' : theme.card,
    },
    headerTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '18@s',
      color: theme.textPrimary,
    },
    scrollContent: {
      paddingHorizontal: '14@s',
      paddingTop: '14@vs',
      paddingBottom: '24@vs',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: '40@vs',
    },
    loadingText: {
      marginTop: '12@vs',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: '40@vs',
    },
    emptyText: {
      marginTop: '16@vs',
      fontSize: '18@s',
      fontWeight: '600',
      color: theme.text,
    },
    emptySubtext: {
      marginTop: '8@vs',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    orderCard: {
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: '12@vs',
    },
    orderHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8@vs',
    },
    orderIdContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '6@s',
      flex: 1,
    },
    orderIdText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.textPrimary,
    },
    statusChipCompleted: {
      paddingHorizontal: '10@s',
      paddingVertical: '5@vs',
      borderRadius: '10@ms',
      backgroundColor: theme.accent,
    },
    statusChipPending: {
      paddingHorizontal: '10@s',
      paddingVertical: '5@vs',
      borderRadius: '10@ms',
      backgroundColor: theme.accent,
    },
    statusChipCancelled: {
      paddingHorizontal: '10@s',
      paddingVertical: '5@vs',
      borderRadius: '10@ms',
      backgroundColor: theme.accent,
    },
    statusText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '11@s',
      color: theme.textPrimary,
    },
    statusTextPending: {
      fontFamily: 'Poppins-Medium',
      fontSize: '11@s',
      color: theme.textPrimary,
    },
    statusTextCancelled: {
      fontFamily: 'Poppins-Medium',
      fontSize: '11@s',
      color: theme.textPrimary,
    },
    orderDate: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.textSecondary,
      marginBottom: '12@vs',
    },
    amountContainer: {
      marginBottom: '12@vs',
    },
    amount: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '20@s',
      fontWeight: '700',
      color: theme.textPrimary,
      marginBottom: '2@vs',
    },
    earningsDescription: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.textSecondary,
    },
    trackIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '6@s',
      marginTop: '8@vs',
      paddingVertical: '6@vs',
      paddingHorizontal: '10@s',
      backgroundColor: theme.background,
      borderRadius: '8@ms',
      alignSelf: 'flex-start',
    },
    trackIndicatorText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: theme.primary,
    },
    shopNameSection: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: '10@s',
      paddingVertical: '12@vs',
      paddingHorizontal: '12@s',
      backgroundColor: theme.background,
      borderRadius: '10@ms',
      marginBottom: '12@vs',
      borderWidth: 1,
      borderColor: theme.border,
    },
    shopIconContainer: {
      width: '36@s',
      height: '36@s',
      borderRadius: '18@s',
      backgroundColor: theme.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: '2@vs',
    },
    shopInfoContainer: {
      flex: 1,
    },
    shopNameLabel: {
      fontFamily: 'Poppins-Regular',
      fontSize: '10@s',
      color: theme.textSecondary,
      marginBottom: '4@vs',
    },
    shopNameText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      lineHeight: '18@vs',
    },
    itemsSection: {
      marginBottom: '12@vs',
      paddingTop: '12@vs',
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    itemsTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: theme.textPrimary,
      marginBottom: '10@vs',
    },
    itemsList: {
      gap: '8@vs',
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '10@s',
    },
    itemImageContainer: {
      width: '40@s',
      height: '40@s',
      borderRadius: '8@ms',
      backgroundColor: theme.background,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.border,
    },
    itemImage: {
      width: '100%',
      height: '100%',
    },
    itemImagePlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    itemInfo: {
      flex: 1,
    },
    itemName: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: theme.textPrimary,
      marginBottom: '2@vs',
    },
    itemDetails: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.textSecondary,
    },
    moreItemsText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.primary,
      fontStyle: 'italic',
      marginTop: '4@vs',
    },
  });

export default MyOrdersScreen;
