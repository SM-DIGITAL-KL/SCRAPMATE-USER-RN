import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StatusBar, Platform, Alert, DeviceEventEmitter, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/config';
import { useUserMode } from '../../context/UserModeContext';
import { getUserData, logout } from '../../services/auth/authService';
import { useProfile } from '../../hooks/useProfile';
import { deleteAccount } from '../../services/api/v2/profile';

const UserProfileScreen = ({ navigation, route }: any) => {
  const { theme, isDark, themeName, setTheme } = useTheme();
  
  // Get button text color based on theme
  const getButtonTextColor = () => {
    if (themeName === 'darkGreen') {
      return '#FF6B6B'; // Lighter red for better contrast on black
    }
    return '#FF4C4C'; // Standard red for other themes
  };
  
  const buttonTextColor = getButtonTextColor();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const currentLanguage = i18n.language;
  const isEnglish = currentLanguage === 'en';
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const { mode } = useUserMode();
  const styles = useMemo(() => getStyles(theme, isEnglish, isDark, themeName), [theme, isEnglish, isDark, themeName]);

  // Get profile data from route params (passed from dashboard)
  const profileDataFromParams = route?.params?.profileData;

  // Load user data
  useFocusEffect(
    React.useCallback(() => {
      const loadUserData = async () => {
        const data = await getUserData();
        setUserData(data);
      };
      loadUserData();
    }, [])
  );

  // Use React Query hook for profile - always enabled to get fresh data
  const { data: profileFromQuery, refetch: refetchProfile } = useProfile(userData?.id, !!userData?.id);
  
  // Refetch profile when screen comes into focus to get latest updates
  useFocusEffect(
    React.useCallback(() => {
      if (userData?.id) {
        refetchProfile();
      }
    }, [userData?.id, refetchProfile])
  );
  
  // Prioritize query result over params to ensure fresh data
  const profile = profileFromQuery || profileDataFromParams;
  const completionPercentage = profile?.completion_percentage || 32;

  // Sync AsyncStorage with latest approval status when profile is fetched
  React.useEffect(() => {
    const syncB2CStatus = async () => {
      if (profile?.shop?.approval_status && userData?.id) {
        try {
          const approvalStatus = profile.shop.approval_status;
          await AsyncStorage.setItem('@b2c_approval_status', approvalStatus);
          console.log('✅ UserProfileScreen: Synced @b2c_approval_status to AsyncStorage:', approvalStatus);
        } catch (error) {
          console.error('❌ Error syncing B2C status:', error);
        }
      }
    };
    
    syncB2CStatus();
  }, [profile?.shop?.approval_status, userData?.id]);
  
  // Get user's name from profile or userData
  const userName = profile?.name || userData?.name || 'User';
  const userInitial = userName.charAt(0).toUpperCase();
  const profileImage = profile?.profile_image || null;

  const getThemeSubtitle = () => {
    switch (themeName) {
      case 'light':
        return t('userProfile.light');
      case 'dark':
        return t('userProfile.dark');
      case 'darkGreen':
        return t('userProfile.darkGreen') || 'Forest Night';
      case 'whitePurple':
        return t('userProfile.whitePurple') || 'Lavender Dream';
      default:
        return t('userProfile.light');
    }
  };

  // Check if B2C signup is complete (has all required fields)
  const hasCompletedSignup = React.useMemo(() => {
    if (!profile) return false;
    const shop = profile.shop;
    if (!shop || !shop.id) return false;
    
    // Check if all required B2C signup fields are present
    const hasName = profile.name && profile.name.trim() !== '';
    const hasEmail = profile.email && profile.email.trim() !== '';
    const hasAddress = shop.address && shop.address.trim() !== '';
    const hasContact = shop.contact && shop.contact.trim() !== '';
    const hasAadhar = shop.aadhar_card && shop.aadhar_card.trim() !== '';
    
    return hasName && hasEmail && hasAddress && hasContact && hasAadhar;
  }, [profile]);

  // Get approval status label
  const getApprovalStatusLabel = () => {
    const approvalStatus = profile?.shop?.approval_status;
    if (approvalStatus === 'approved') {
      return t('userProfile.approved') || 'Approved';
    } else if (approvalStatus === 'pending') {
      return t('userProfile.pending') || 'Pending';
    } else if (approvalStatus === 'rejected') {
      return t('userProfile.rejected') || 'Rejected';
    }
    return t('userProfile.pending') || 'Pending';
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    try {
      await logout();
      setShowLogoutModal(false);
      DeviceEventEmitter.emit('FORCE_LOGOUT');
    } catch (error: any) {
      console.error('Error logging out:', error);
      setShowLogoutModal(false);
      Alert.alert('Error', error.message || 'Failed to logout');
    }
  };

  const handleDeleteAccount = () => {
    setShowDeleteAccountModal(true);
  };

  const confirmDeleteAccount = async () => {
    if (!userData?.id) {
      Alert.alert('Error', 'User ID not found');
      return;
    }

    setIsDeletingAccount(true);
    try {
      await deleteAccount(userData.id);
      // Clear all data and logout
      await logout();
      setShowDeleteAccountModal(false);
      DeviceEventEmitter.emit('FORCE_LOGOUT');
    } catch (error: any) {
      console.error('Error deleting account:', error);
      setIsDeletingAccount(false);
      Alert.alert('Error', error.message || 'Failed to delete account');
    }
  };

  const handleMenuItemPress = async (item: {
    icon: string;
    label: string;
    subtitle?: string;
    action: string | null;
  }) => {
    if (item.action === 'MyOrders') {
      navigation.navigate('MyOrders');
    } else if (item.action === 'EditProfile') {
      navigation.navigate('EditProfile');
    } else if (item.action === 'Appearance') {
      setShowThemeModal(true);
    } else if (item.action === 'ChangeLanguage') {
      navigation.navigate('SelectLanguage');
    } else if (item.action === 'PrivacyPolicy') {
      navigation.navigate('PrivacyPolicy');
    } else if (item.action === 'Terms') {
      navigation.navigate('Terms');
    } else if (item.action === 'JoinB2BNetwork') {
      navigation.navigate('DealerSignup');
    } else if (item.action === 'ApprovalStatus') {
      navigation.navigate('ApprovalWorkflow', { fromProfile: true });
    }
  };

  // Get current language display name
  const getCurrentLanguageName = () => {
    return currentLanguage === 'en' ? 'English' : currentLanguage === 'hi' ? 'हिंदी' : currentLanguage.toUpperCase();
  };

  const menuItems = [
    { icon: 'web', label: t('userProfile.changeLanguage') || 'Language', value: getCurrentLanguageName(), action: 'ChangeLanguage' },
    { icon: 'help-circle-outline', label: 'Help & Support', value: '', action: null },
    { icon: 'shield-check-outline', label: t('userProfile.privacyPolicy') || 'Privacy Policy', value: '', action: 'PrivacyPolicy' },
    { icon: 'file-document-outline', label: t('userProfile.terms') || 'Terms & Conditions', value: '', action: 'Terms' },
    { icon: 'weather-sunny', label: t('userProfile.appearance') || 'Appearance', value: getThemeSubtitle(), action: 'Appearance' },
  ];


  // Get header background color based on theme
  const getHeaderBackgroundColor = () => {
    if (themeName === 'dark') return theme.background;
    if (themeName === 'darkGreen') return '#2E7D32';
    if (themeName === 'whitePurple') return '#7B1FA2';
    return theme.primary;
  };

  const headerBgColor = getHeaderBackgroundColor();
  const isLoggedIn = !!userData;

  // Determine status bar style based on theme
  const getStatusBarStyle = () => {
    if (themeName === 'dark') return 'light-content';
    if (themeName === 'darkGreen') return 'light-content';
    if (themeName === 'whitePurple') return 'light-content';
    return 'dark-content';
  };

  // Use useFocusEffect to ensure StatusBar persists when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      const statusBarStyle = getStatusBarStyle();
      
      // Set StatusBar for this screen
      StatusBar.setBarStyle(statusBarStyle, true);
      
      // On Android, set the background color to match header
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor(headerBgColor, true);
      }
    }, [headerBgColor, themeName])
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={getStatusBarStyle()}
        backgroundColor={headerBgColor}
        translucent={false}
      />

      {/* Header Section with App Branding */}
      <View style={[styles.headerSection, { backgroundColor: headerBgColor }]}>
        <AutoText style={styles.appName}>Scrapmate</AutoText>
        <AutoText style={styles.appTagline}>India's Scrap Collection App</AutoText>
        {isLoggedIn ? (
          <TouchableOpacity
            style={styles.userInfoButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <View style={styles.userInfoContent}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.userAvatar} />
              ) : (
                <View style={styles.userAvatarPlaceholder}>
                  <AutoText style={styles.userAvatarText}>{userInitial}</AutoText>
                </View>
              )}
              <AutoText style={styles.userName} numberOfLines={1}>
                {userName}
              </AutoText>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.loginButton}
            activeOpacity={0.8}
            onPress={() => {
              // Navigate to login - this will be handled by the app's auth flow
              DeviceEventEmitter.emit('FORCE_LOGOUT');
            }}
          >
            <AutoText style={styles.loginButtonText}>Login / Signup</AutoText>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Settings Card */}
        <View style={styles.settingsCard}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.settingsItem,
                index < menuItems.length - 1 && styles.settingsItemBorder,
              ]}
              activeOpacity={0.7}
              onPress={() => item.action && handleMenuItemPress(item)}
              disabled={!item.action}
            >
              <MaterialCommunityIcons
                name={item.icon as any}
                size={22}
                color={theme.primary}
              />
              <View style={styles.settingsItemContent}>
                <AutoText style={styles.settingsItemLabel} numberOfLines={1}>
                  {item.label}
                </AutoText>
                {item.value && (
                  <AutoText style={styles.settingsItemValue} numberOfLines={1}>
                    {item.value}
                  </AutoText>
                )}
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Additional Actions (if logged in) */}
        {isLoggedIn && (
          <>
            <TouchableOpacity style={styles.menuRow} activeOpacity={0.7} onPress={handleDeleteAccount}>
              <MaterialCommunityIcons
                name="delete-outline"
                size={20}
                color={buttonTextColor}
              />
              <View style={styles.menuItemContent}>
                <AutoText style={[styles.menuLabel, { color: buttonTextColor }]} numberOfLines={2}>
                  {t('userProfile.deleteAccount') !== 'userProfile.deleteAccount' ? t('userProfile.deleteAccount') : 'Delete Account'}
                </AutoText>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={theme.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.logoutRow} activeOpacity={0.7} onPress={handleLogout}>
              <MaterialCommunityIcons
                name="logout"
                size={20}
                color={buttonTextColor}
              />
              <AutoText style={[styles.logoutText, { color: buttonTextColor, opacity: 1 }]} numberOfLines={1}>
                {t('common.logout')}
              </AutoText>
            </TouchableOpacity>
          </>
        )}

        {/* App Version */}
        <View style={styles.appInfoContainer}>
          <AutoText style={styles.appInfoText}>
            App Version v1.0.4 (64)
          </AutoText>
        </View>
      </ScrollView>

      <Modal
        visible={showThemeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowThemeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <AutoText style={styles.modalTitle} numberOfLines={1}>
                {t('userProfile.appearance')}
              </AutoText>
              <TouchableOpacity
                onPress={() => setShowThemeModal(false)}
                style={styles.closeButton}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color={theme.textPrimary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.themeOption,
                themeName === 'light' && styles.themeOptionSelected,
              ]}
              onPress={() => {
                setTheme('light');
                setShowThemeModal(false);
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="weather-sunny"
                size={24}
                color={themeName === 'light' ? theme.primary : theme.textSecondary}
              />
              <View style={styles.themeOptionContent}>
                <AutoText
                  style={[
                    styles.themeOptionLabel,
                    themeName === 'light' && styles.themeOptionLabelSelected,
                  ]}
                  numberOfLines={1}
                >
                  {t('userProfile.light')}
                </AutoText>
              </View>
              {themeName === 'light' && (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={24}
                  color={theme.primary}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themeOption,
                themeName === 'dark' && styles.themeOptionSelected,
              ]}
              onPress={() => {
                setTheme('dark');
                setShowThemeModal(false);
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="weather-night"
                size={24}
                color={themeName === 'dark' ? theme.primary : theme.textSecondary}
              />
              <View style={styles.themeOptionContent}>
                <AutoText
                  style={[
                    styles.themeOptionLabel,
                    themeName === 'dark' && styles.themeOptionLabelSelected,
                  ]}
                  numberOfLines={1}
                >
                  {t('userProfile.dark')}
                </AutoText>
              </View>
              {themeName === 'dark' && (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={24}
                  color={theme.primary}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themeOption,
                themeName === 'darkGreen' && styles.themeOptionSelected,
              ]}
              onPress={() => {
                setTheme('darkGreen');
                setShowThemeModal(false);
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="leaf"
                size={24}
                color={themeName === 'darkGreen' ? theme.primary : theme.textSecondary}
              />
              <View style={styles.themeOptionContent}>
                <AutoText
                  style={[
                    styles.themeOptionLabel,
                    themeName === 'darkGreen' && styles.themeOptionLabelSelected,
                  ]}
                  numberOfLines={1}
                >
                  {t('userProfile.darkGreen') || 'Forest Night'}
                </AutoText>
              </View>
              {themeName === 'darkGreen' && (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={24}
                  color={theme.primary}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.themeOption,
                themeName === 'whitePurple' && styles.themeOptionSelected,
              ]}
              onPress={() => {
                setTheme('whitePurple');
                setShowThemeModal(false);
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="palette"
                size={24}
                color={themeName === 'whitePurple' ? theme.primary : theme.textSecondary}
              />
              <View style={styles.themeOptionContent}>
                <AutoText
                  style={[
                    styles.themeOptionLabel,
                    themeName === 'whitePurple' && styles.themeOptionLabelSelected,
                  ]}
                  numberOfLines={1}
                >
                  {t('userProfile.whitePurple') || 'Lavender Dream'}
                </AutoText>
              </View>
              {themeName === 'whitePurple' && (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={24}
                  color={theme.primary}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <AutoText style={styles.modalTitle} numberOfLines={1}>
                {t('userProfile.logoutTitle') !== 'userProfile.logoutTitle' ? t('userProfile.logoutTitle') : 'Confirm Logout'}
              </AutoText>
              <TouchableOpacity
                onPress={() => setShowLogoutModal(false)}
                style={styles.closeButton}
              >
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color={theme.textPrimary}
                />
              </TouchableOpacity>
            </View>

            <AutoText style={styles.logoutModalMessage} numberOfLines={2}>
              {t('userProfile.logoutMessage') !== 'userProfile.logoutMessage' ? t('userProfile.logoutMessage') : 'Are you sure you want to logout?'}
            </AutoText>

            <View style={styles.logoutModalButtons}>
              <TouchableOpacity
                style={[styles.logoutModalButton, styles.logoutModalButtonCancel]}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.7}
              >
                <AutoText style={styles.logoutModalButtonTextCancel} numberOfLines={1}>
                  {t('common.cancel') || 'Cancel'}
                </AutoText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.logoutModalButton, styles.logoutModalButtonConfirm]}
                onPress={confirmLogout}
                activeOpacity={0.7}
              >
                <AutoText style={styles.logoutModalButtonTextConfirm} numberOfLines={1}>
                  {t('common.logout') || 'Logout'}
                </AutoText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteAccountModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !isDeletingAccount && setShowDeleteAccountModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <AutoText style={styles.modalTitle} numberOfLines={1}>
                {t('userProfile.deleteAccountTitle') !== 'userProfile.deleteAccountTitle' ? t('userProfile.deleteAccountTitle') : 'Delete Account'}
              </AutoText>
              <TouchableOpacity
                onPress={() => !isDeletingAccount && setShowDeleteAccountModal(false)}
                style={styles.closeButton}
                disabled={isDeletingAccount}
              >
                <MaterialCommunityIcons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <AutoText style={styles.logoutModalMessage} numberOfLines={4}>
              {t('userProfile.deleteAccountMessage') !== 'userProfile.deleteAccountMessage' ? t('userProfile.deleteAccountMessage') : 'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.'}
            </AutoText>
            <View style={styles.logoutModalButtons}>
              <TouchableOpacity
                style={[styles.logoutModalButton, styles.logoutModalButtonCancel]}
                onPress={() => setShowDeleteAccountModal(false)}
                disabled={isDeletingAccount}
                activeOpacity={0.7}
              >
                <AutoText style={styles.logoutModalButtonTextCancel} numberOfLines={1}>
                  {t('common.cancel') || 'Cancel'}
                </AutoText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.logoutModalButton, styles.logoutModalButtonConfirm]}
                onPress={confirmDeleteAccount}
                disabled={isDeletingAccount}
                activeOpacity={0.7}
              >
                <AutoText style={styles.logoutModalButtonTextConfirm} numberOfLines={1}>
                  {isDeletingAccount ? (t('common.deleting') || 'Deleting...') : (t('userProfile.deleteAccount') !== 'userProfile.deleteAccount' ? t('userProfile.deleteAccount') : 'Delete Account')}
                </AutoText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const getStyles = (theme: any, isEnglish: boolean, isDark: boolean, themeName?: string) =>
  ScaledSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerSection: {
      paddingHorizontal: '18@s',
      paddingTop: '24@vs',
      paddingBottom: '32@vs',
      alignItems: 'center',
    },
    appName: {
      fontFamily: 'Poppins-Bold',
      fontSize: '28@s',
      color: '#FFFFFF',
      marginBottom: '4@vs',
      textAlign: 'center',
    },
    appTagline: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: 'rgba(255, 255, 255, 0.9)',
      marginBottom: '24@vs',
      textAlign: 'center',
    },
    loginButton: {
      backgroundColor: '#FFFFFF',
      paddingVertical: '12@vs',
      paddingHorizontal: '32@s',
      borderRadius: '8@ms',
      minWidth: '200@s',
      alignItems: 'center',
      justifyContent: 'center',
    },
    loginButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: themeName === 'darkGreen' ? '#2E7D32' : (themeName === 'whitePurple' ? '#7B1FA2' : theme.primary),
    },
    userInfoButton: {
      width: '100%',
    },
    userInfoContent: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      paddingVertical: '12@vs',
      paddingHorizontal: '16@s',
      borderRadius: '8@ms',
      gap: '12@s',
    },
    userAvatar: {
      width: '40@s',
      height: '40@vs',
      borderRadius: '20@s',
    },
    userAvatarPlaceholder: {
      width: '40@s',
      height: '40@vs',
      borderRadius: '20@s',
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    userAvatarText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '18@s',
      color: themeName === 'darkGreen' ? '#2E7D32' : (themeName === 'whitePurple' ? '#7B1FA2' : theme.primary),
    },
    userName: {
      flex: 1,
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: '#FFFFFF',
    },
    scrollContent: {
      paddingHorizontal: '18@s',
      paddingTop: '20@vs',
      paddingBottom: '32@vs',
    },
    settingsCard: {
      backgroundColor: theme.card,
      borderRadius: '16@ms',
      marginBottom: '20@vs',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
      overflow: 'hidden',
    },
    settingsItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: '16@vs',
      paddingHorizontal: '18@s',
      gap: '14@s',
    },
    settingsItemBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    settingsItemContent: {
      flex: 1,
    },
    settingsItemLabel: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '2@vs',
    },
    settingsItemValue: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
    },
    headerCard: {
      height: '120@vs',
      borderRadius: '18@ms',
      marginBottom: '18@vs',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
      overflow: 'hidden',
      borderWidth: Platform.OS === 'ios' ? '1@ms' : 0,
      borderColor: Platform.OS === 'ios' ? theme.border : 'transparent',
      padding: Platform.OS === 'ios' ? '18@s' : 0,
    },
    iosGradientWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: '17@ms',
      overflow: 'hidden',
    },
    gradientIOS: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    gradient: {
      flex: 1,
      width: '100%',
      height: '100%',
      padding: '18@s',
      justifyContent: 'center',
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '14@s',
    },
    avatar: {
      width: '64@s',
      height: '64@s',
      borderRadius: '32@s',
      backgroundColor: '#FFD700',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor:  theme.textSecondary,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    avatarText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '28@s',
      color: theme.textPrimary,
    },
    profileInfo: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '20@s',
      color: theme.textPrimary,
      marginBottom: '8@vs',
    },
    upgradeButton: {
      marginTop: '8@vs',
      borderRadius: '8@ms',
      overflow: 'hidden',
    },
    upgradeGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: '8@vs',
      paddingHorizontal: '16@s',
      borderRadius: '8@ms',
      flexWrap: 'wrap',
    },
    upgradeText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '12@s',
      color: themeName === 'darkGreen' ? '#000000' : '#FFFFFF',
      flexShrink: 1,
      textAlign: 'center',
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: '16@vs',
      paddingHorizontal: '18@s',
      borderBottomWidth: 1,
      borderColor: theme.border,
      gap: '14@s',
    },
    menuItemContent: {
      flex: 1,
    },
    menuLabel: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
    },
    progressContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '8@s',
      marginTop: '4@vs',
    },
    progressBar: {
      flex: 1,
      height: '6@vs',
      backgroundColor: theme.border,
      borderRadius: '3@vs',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: theme.primary,
      borderRadius: '3@vs',
    },
    progressText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.textSecondary,
    },
    logoutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: '16@vs',
      paddingHorizontal: '18@s',
      gap: '14@s',
      marginTop: '8@vs',
    },
    logoutText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
      opacity: 0.3,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.card,
      borderTopLeftRadius: '20@ms',
      borderTopRightRadius: '20@ms',
      paddingTop: '20@vs',
      paddingBottom: '32@vs',
      paddingHorizontal: '18@s',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '24@vs',
    },
    modalTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.textPrimary,
    },
    closeButton: {
      padding: '4@s',
    },
    themeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: '16@vs',
      paddingHorizontal: '16@s',
      borderRadius: '12@ms',
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: '12@vs',
      backgroundColor: theme.background,
    },
    themeOptionSelected: {
      borderColor: theme.primary,
      borderWidth: 2,
      backgroundColor: theme.accent + '33',
    },
    themeOptionContent: {
      flex: 1,
      marginLeft: '14@s',
    },
    themeOptionLabel: {
      fontFamily: 'Poppins-Medium',
      fontSize: '16@s',
      color: theme.textSecondary,
    },
    themeOptionLabelSelected: {
      color: theme.primary,
      fontFamily: 'Poppins-SemiBold',
    },
    logoutModalMessage: {
      fontFamily: 'Poppins-Medium',
      fontSize: '13@s',
      color: theme.textPrimary,
      textAlign: 'center',
      marginBottom: '24@vs',
    },
    logoutModalButtons: {
      flexDirection: 'row',
      gap: '12@s',
    },
    logoutModalButton: {
      flex: 1,
      paddingVertical: '16@vs',
      paddingHorizontal: '16@s',
      borderRadius: '12@ms',
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoutModalButtonCancel: {
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    logoutModalButtonConfirm: {
      backgroundColor: themeName === 'darkGreen' ? '#FF6B6B' : '#FF4C4C',
    },
    logoutModalButtonTextCancel: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '13@s',
      color: theme.textPrimary,
    },
    logoutModalButtonTextConfirm: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '13@s',
      color: '#FFFFFF',
    },
    appInfoContainer: {
      alignItems: 'center',
      paddingVertical: '24@vs',
      paddingBottom: '32@vs',
    },
    appInfoText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.textSecondary,
      opacity: 0.6,
      fontWeight: '300',
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: '16@vs',
      paddingHorizontal: '18@s',
      borderBottomWidth: 1,
      borderColor: theme.border,
      gap: '14@s',
      backgroundColor: theme.card,
      borderRadius: '16@ms',
      marginBottom: '12@vs',
    },
    menuItemContent: {
      flex: 1,
    },
    menuLabel: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
    },
    logoutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: '16@vs',
      paddingHorizontal: '18@s',
      gap: '14@s',
      backgroundColor: theme.card,
      borderRadius: '16@ms',
      marginBottom: '20@vs',
    },
    logoutText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
      opacity: 0.3,
    },
  });

export default UserProfileScreen;

