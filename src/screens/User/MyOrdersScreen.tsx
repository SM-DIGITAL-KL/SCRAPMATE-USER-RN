import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { GreenButton } from '../../components/GreenButton';
import { ScaledSheet } from 'react-native-size-matters';
import { useTranslation } from 'react-i18next';
import { getUserData } from '../../services/auth/authService';
import { getCustomerOrders, CustomerOrder } from '../../services/api/v2/orders';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../services/api/queryKeys';

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
  const { data: orders, isLoading, refetch, isRefetching } = useQuery<CustomerOrder[]>({
    queryKey: queryKeys.orders.byUser(customerId || 0),
    queryFn: () => getCustomerOrders(customerId!),
    enabled: !!customerId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

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
      case 4: // Completed
        return 'green';
      case 1: // Pending
      case 2: // Assigned
      case 3: // Accepted
        return 'mint';
      case 5: // Cancelled
        return 'dark';
      default:
        return 'mint';
    }
  };

  const getStatusText = (status: number) => {
    switch (status) {
      case 1:
        return t('orders.status.pending') || 'Pending';
      case 2:
        return t('orders.status.assigned') || 'Assigned';
      case 3:
        return t('orders.status.accepted') || 'Accepted';
      case 4:
        return t('orders.status.completed') || 'Completed';
      case 5:
        return t('orders.status.cancelled') || 'Cancelled';
      default:
        return t('orders.status.unknown') || 'Unknown';
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
            return (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
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
                  <AutoText style={styles.orderDate} numberOfLines={1}>
                    {formatDate(order.created_at)}
                  </AutoText>
                </View>
                <AutoText style={styles.amount} numberOfLines={1}>
                  {formatAmount(order.estim_price || 0)}
                </AutoText>
                <AutoText style={styles.earningsDescription} numberOfLines={2}>
                  {t('myOrders.earningsForPickup') || 'Earnings for pickup'}
                </AutoText>
                <View style={styles.orderActions}>
                  <TouchableOpacity style={styles.invoiceButton}>
                    <MaterialCommunityIcons
                      name="file-document-outline"
                      size={16}
                      color={theme.primary}
                    />
                    <AutoText style={styles.invoiceText} numberOfLines={2}>
                      {t('myOrders.viewInvoice') || 'View Invoice'}
                    </AutoText>
                  </TouchableOpacity>
                  <GreenButton
                    title={t('myOrders.rebookPickup') || 'Rebook Pickup'}
                    onPress={() => {
                      // Navigate to rebook pickup flow
                      // navigation.navigate('MaterialSelection');
                    }}
                    style={styles.rebookButton}
                  />
                </View>
              </View>
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
      padding: '12@s',
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: '12@vs',
    },
    orderHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '10@vs',
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
      fontSize: '12@s',
      color: theme.textSecondary,
    },
    amount: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '18@s',
      fontWeight: '700',
      color: theme.textPrimary,
      marginBottom: '3@vs',
    },
    earningsDescription: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.textSecondary,
      marginBottom: '12@vs',
    },
    orderActions: {
      flexDirection: 'row',
      gap: '10@s',
      alignItems: 'center',
    },
    invoiceButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '5@s',
      paddingVertical: '8@vs',
      paddingHorizontal: '10@s',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: '10@ms',
      backgroundColor: theme.card,
      flexShrink: 1,
      minWidth: 0,
      maxWidth: '45%',
    },
    invoiceText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: theme.textPrimary,
      flexShrink: 1,
      minWidth: 0,
    },
    rebookButton: {
      flex: 1,
      paddingVertical: '8@vs',
    },
  });

export default MyOrdersScreen;
