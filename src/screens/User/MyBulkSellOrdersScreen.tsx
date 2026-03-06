import React, { useMemo, useState } from 'react';
import { 
  View, 
  ScrollView, 
  TouchableOpacity, 
  StatusBar, 
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTranslation } from 'react-i18next';
import { useBulkSellOrders, useRefreshBulkSellOrders } from '../../hooks/useBulkSell';
import { getUserData } from '../../services/auth/authService';
import { useFocusEffect } from '@react-navigation/native';
import { 
  BulkSellOrder, 
  getBulkSellStatusText, 
  getBulkSellStatusColor,
  getPaymentStatusText,
  cancelBulkSellOrder 
} from '../../services/api/v2/bulkSell';


const MyBulkSellOrdersScreen = () => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  
  const [userId, setUserId] = useState<number | undefined>();
  const { refresh } = useRefreshBulkSellOrders();

  // Load user data
  useFocusEffect(
    React.useCallback(() => {
      const loadUserData = async () => {
        const data = await getUserData();
        if (data?.id) {
          setUserId(Number(data.id));
        }
      };
      loadUserData();
    }, [])
  );

  // Fetch bulk sell orders
  const { 
    orders, 
    isLoading, 
    isError, 
    error, 
    refetch 
  } = useBulkSellOrders(userId);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleCancelOrder = (order: BulkSellOrder) => {
    Alert.alert(
      t('common.cancel') || 'Cancel Order',
      t('bulkSellOrders.cancelConfirm') || 'Are you sure you want to cancel this order?',
      [
        { text: t('common.no') || 'No', style: 'cancel' },
        {
          text: t('common.yes') || 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!userId) return;
              await cancelBulkSellOrder(order.id, userId);
              refresh(userId);
              Alert.alert(
                t('common.success') || 'Success',
                t('bulkSellOrders.cancelled') || 'Order cancelled successfully'
              );
            } catch (err: any) {
              Alert.alert(
                t('common.error') || 'Error',
                err.message || 'Failed to cancel order'
              );
            }
          },
        },
      ]
    );
  };

  const renderOrderCard = (order: BulkSellOrder) => {
    const statusColor = getBulkSellStatusColor(order.status);
    const statusText = getBulkSellStatusText(order.status);
    const paymentStatusText = getPaymentStatusText(order.payment_status);
    const createdDate = order.created_at 
      ? new Date(order.created_at).toLocaleDateString('en-IN', { 
          day: '2-digit', 
          month: 'short', 
          year: 'numeric' 
        })
      : '';
    
    const totalCommitted = order.total_committed_quantity || 0;
    const remainingQuantity = order.quantity - totalCommitted;
    const hasAcceptedBuyers = order.accepted_buyers && order.accepted_buyers.length > 0;
    const buyerCount = order.accepted_buyers?.length || 0;

    return (
      <TouchableOpacity
        key={order.id}
        style={styles.orderCard}
        activeOpacity={0.7}
        onPress={() => {
          // Navigate to order detail screen
          navigation.navigate('BulkSellOrderDetail', { orderId: order.id });
        }}
      >
        {/* Order Header */}
        <View style={styles.orderHeader}>
          <View style={styles.orderIdContainer}>
            <MaterialCommunityIcons name="package-variant" size={20} color={theme.primary} />
            <AutoText style={styles.orderIdText}>
              #{order.id}
            </AutoText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <AutoText style={[styles.statusText, { color: statusColor }]}>
              {statusText}
            </AutoText>
          </View>
        </View>

        {/* Order Details */}
        <View style={styles.orderDetails}>
          {/* Scrap Type */}
          {order.scrap_type && (
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="recycle" size={16} color={theme.textSecondary} />
              <AutoText style={styles.detailText} numberOfLines={1}>
                {order.scrap_type}
              </AutoText>
            </View>
          )}

          {/* Quantity */}
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="weight-kilogram" size={16} color={theme.textSecondary} />
            <AutoText style={styles.detailText}>
              {order.quantity} kg total
              {totalCommitted > 0 && (
                <AutoText style={styles.subText}>
                  {' '}({remainingQuantity} kg remaining)
                </AutoText>
              )}
            </AutoText>
          </View>

          {/* Asking Price */}
          {order.asking_price && (
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="currency-inr" size={16} color={theme.textSecondary} />
              <AutoText style={styles.detailText}>
                ₹{order.asking_price}/kg
              </AutoText>
            </View>
          )}

          {/* Location */}
          {order.location && (
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="map-marker" size={16} color={theme.textSecondary} />
              <AutoText style={styles.detailText} numberOfLines={1}>
                {order.location}
              </AutoText>
            </View>
          )}

          {/* Date */}
          <View style={styles.detailRow}>
            <MaterialCommunityIcons name="calendar" size={16} color={theme.textSecondary} />
            <AutoText style={styles.detailText}>
              {createdDate}
            </AutoText>
          </View>

          {/* Accepted Buyers Count */}
          {hasAcceptedBuyers && (
            <View style={[styles.detailRow, styles.buyerRow]}>
              <MaterialCommunityIcons name="account-group" size={16} color={theme.primary} />
              <AutoText style={[styles.detailText, { color: theme.primary }]}>
                {buyerCount} {buyerCount === 1 ? 'buyer' : 'buyers'} interested
              </AutoText>
            </View>
          )}
        </View>

        {/* Payment Status */}
        <View style={styles.paymentStatusContainer}>
          <AutoText style={styles.paymentLabel}>Payment:</AutoText>
          <AutoText style={[
            styles.paymentStatus,
            { 
              color: order.payment_status === 'paid' 
                ? '#4CAF50' 
                : order.payment_status === 'pending'
                ? '#FF9800'
                : '#F44336'
            }
          ]}>
            {paymentStatusText}
          </AutoText>
          {order.payment_amount && (
            <AutoText style={styles.paymentAmount}>
              ₹{order.payment_amount.toFixed(2)}
            </AutoText>
          )}
        </View>

        {/* Action Buttons */}
        {(order.status === 'pending' || order.status === 'active') && (
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => handleCancelOrder(order)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="close-circle" size={16} color="#F44336" />
              <AutoText style={styles.cancelButtonText}>
                {t('common.cancel') || 'Cancel'}
              </AutoText>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons 
        name="package-variant-remove" 
        size={80} 
        color={theme.textSecondary} 
      />
      <AutoText style={styles.emptyTitle}>
        {t('bulkSellOrders.noOrders') || 'No Bulk Sell Orders'}
      </AutoText>
      <AutoText style={styles.emptySubtitle}>
        {t('bulkSellOrders.noOrdersSubtitle') || 'You have not created any bulk sell orders yet.'}
      </AutoText>
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate('BulkSellRequest')}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
        <AutoText style={styles.createButtonText}>
          {t('bulkSellOrders.createOrder') || 'Create Order'}
        </AutoText>
      </TouchableOpacity>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons 
        name="alert-circle" 
        size={80} 
        color="#F44336" 
      />
      <AutoText style={styles.emptyTitle}>
        {t('common.error') || 'Error'}
      </AutoText>
      <AutoText style={styles.emptySubtitle}>
        {(error as Error)?.message || 'Failed to load orders'}
      </AutoText>
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => refetch()}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
        <AutoText style={styles.createButtonText}>
          {t('common.retry') || 'Retry'}
        </AutoText>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? theme.background : '#FFFFFF'}
      />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={theme.textPrimary}
          />
        </TouchableOpacity>
        <AutoText style={styles.headerTitle}>
          {t('bulkSellOrders.title') || 'My Bulk Sell Orders'}
        </AutoText>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <AutoText style={styles.loadingText}>
            {t('common.loading') || 'Loading...'}
          </AutoText>
        </View>
      ) : isError ? (
        renderErrorState()
      ) : orders.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {renderEmptyState()}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 16 }
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Orders Count */}
          <View style={styles.countContainer}>
            <AutoText style={styles.countText}>
              {orders.length} {orders.length === 1 ? 'order' : 'orders'}
            </AutoText>
          </View>

          {/* Order Cards */}
          {orders.map(renderOrderCard)}
        </ScrollView>
      )}
    </View>
  );
};

const getStyles = (theme: any, isDark: boolean) =>
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
    headerTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '18@s',
      color: theme.textPrimary,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: '12@vs',
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    scrollContent: {
      padding: '16@s',
    },
    countContainer: {
      marginBottom: '12@vs',
    },
    countText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    orderCard: {
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      marginBottom: '12@vs',
      borderWidth: 1,
      borderColor: theme.border,
    },
    orderHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '12@vs',
    },
    orderIdContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '8@s',
    },
    orderIdText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: theme.textPrimary,
    },
    statusBadge: {
      paddingHorizontal: '10@s',
      paddingVertical: '4@vs',
      borderRadius: '16@ms',
    },
    statusText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
    },
    orderDetails: {
      gap: '8@vs',
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '10@s',
    },
    buyerRow: {
      backgroundColor: theme.primary + '10',
      paddingHorizontal: '8@s',
      paddingVertical: '4@vs',
      borderRadius: '6@ms',
      marginTop: '4@vs',
    },
    detailText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
      flex: 1,
    },
    subText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
    },
    paymentStatusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: '12@vs',
      paddingTop: '12@vs',
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    paymentLabel: {
      fontFamily: 'Poppins-Regular',
      fontSize: '13@s',
      color: theme.textSecondary,
    },
    paymentStatus: {
      fontFamily: 'Poppins-Medium',
      fontSize: '13@s',
      marginLeft: '6@s',
    },
    paymentAmount: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '13@s',
      color: theme.textPrimary,
      marginLeft: 'auto',
    },
    actionContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: '12@vs',
      paddingTop: '12@vs',
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '6@s',
      paddingHorizontal: '12@s',
      paddingVertical: '6@vs',
      borderRadius: '6@ms',
    },
    cancelButton: {
      backgroundColor: '#F4433615',
    },
    cancelButtonText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: '#F44336',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: '60@vs',
      paddingHorizontal: '32@s',
    },
    emptyTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '18@s',
      color: theme.textPrimary,
      marginTop: '16@vs',
      marginBottom: '8@vs',
    },
    emptySubtitle: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: '24@vs',
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '8@s',
      backgroundColor: theme.primary,
      paddingHorizontal: '20@s',
      paddingVertical: '12@vs',
      borderRadius: '8@ms',
    },
    createButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: '#FFFFFF',
    },
  });

export default MyBulkSellOrdersScreen;
