import React, { useState, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, Modal, StatusBar, Platform, Alert, DeviceEventEmitter, Image, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n/config';
import { getUserData, logout } from '../../services/auth/authService';
import { useProfile } from '../../hooks/useProfile';
import { deleteAccount } from '../../services/api/v2/profile';

const UserProfileScreen = ({ navigation, route }: any) => {
  const { theme, isDark, themeName, setTheme } = useTheme();
  
  const buttonTextColor = themeName === 'darkGreen' ? '#FF6B6B' : '#FF4C4C';
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const currentLanguage = i18n.language;
  const isEnglish = currentLanguage === 'en';
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showB2CNetworkModal, setShowB2CNetworkModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const styles = useMemo(() => getStyles(theme, isEnglish, isDark, themeName), [theme, isEnglish, isDark, themeName]);

  const profileDataFromParams = route?.params?.profileData;

  useFocusEffect(
    React.useCallback(() => {
      const loadUserData = async () => {
        const data = await getUserData();
        setUserData(data);
      };
      loadUserData();
    }, [])
  );

  const { data: profileFromQuery, refetch: refetchProfile } = useProfile(userData?.id, !!userData?.id);
  
  useFocusEffect(
    React.useCallback(() => {
      if (userData?.id) {
        refetchProfile();
      }
    }, [userData?.id, refetchProfile])
  );
  
  const profile = profileFromQuery || profileDataFromParams;
  const completionPercentage = profile?.completion_percentage || 32;

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
    if (item.action === 'EditProfile') {
      navigation.navigate('EditProfile');
    } else if (item.action === 'MyOrders') {
      navigation.navigate('MyOrders');
    } else if (item.action === 'Appearance') {
      setShowThemeModal(true);
    } else if (item.action === 'ChangeLanguage') {
      navigation.navigate('SelectLanguage');
    } else if (item.action === 'JoinB2CNetwork') {
      setShowB2CNetworkModal(true);
    } else if (item.action === 'PrivacyPolicy') {
      navigation.navigate('PrivacyPolicy');
    } else if (item.action === 'Terms') {
      navigation.navigate('Terms');
    }
  };

  const menuItems = [
    { icon: 'account', label: t('userProfile.yourProfile') || 'Your Profile', subtitle: `${completionPercentage}% completed`, action: 'EditProfile' },
    { icon: 'package-variant', label: t('userProfile.myOrders') || 'My Orders', subtitle: '', action: 'MyOrders' },
    { icon: 'weather-sunny', label: t('userProfile.appearance'), subtitle: getThemeSubtitle(), action: 'Appearance' },
    { icon: 'star', label: t('userProfile.changeLanguage'), action: 'ChangeLanguage' },
    { icon: 'account-group', label: t('userProfile.joinB2CNetwork') || 'Join our B2C Network', subtitle: '', action: 'JoinB2CNetwork' },
    { icon: 'shield', label: t('userProfile.privacyPolicy'), action: 'PrivacyPolicy' },
    { icon: 'file-document', label: t('userProfile.terms'), action: 'Terms' },
  ];

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
        <AutoText style={styles.headerTitle} numberOfLines={2}>
          {t('userProfile.title')}
        </AutoText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          {Platform.OS === 'ios' ? (
            <>
              <View style={styles.iosGradientWrapper}>
                <LinearGradient
                  colors={isDark ? ['#1B3E1F', '#2D5A32', '#1B3E1F'] : ['#E8F5E9', '#C8E6C9', '#A5D6A7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradientIOS}
                />
              </View>
              <View style={styles.profileHeader}>
                <View style={styles.avatar}>
                  {profileImage ? (
                    <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                  ) : (
                    <AutoText style={styles.avatarText} numberOfLines={1}>
                      {userInitial}
                    </AutoText>
                  )}
                </View>
                <View style={styles.profileInfo}>
                  <AutoText style={styles.name} numberOfLines={1}>
                    {userName}
                  </AutoText>
                </View>
              </View>
            </>
          ) : (
            <LinearGradient
              colors={isDark ? ['#1B3E1F', '#2D5A32', '#1B3E1F'] : ['#E8F5E9', '#C8E6C9', '#A5D6A7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradient}
            >
              <View style={styles.profileHeader}>
                <View style={styles.avatar}>
                  {profileImage ? (
                    <Image source={{ uri: profileImage }} style={styles.avatarImage} />
                  ) : (
                    <AutoText style={styles.avatarText} numberOfLines={1}>
                      {userInitial}
                    </AutoText>
                  )}
                </View>
                <View style={styles.profileInfo}>
                  <AutoText style={styles.name} numberOfLines={1}>
                    {userName}
                  </AutoText>
                </View>
              </View>
            </LinearGradient>
          )}
        </View>

        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.menuRow}
            activeOpacity={0.7}
            onPress={() => handleMenuItemPress(item)}
          >
            <MaterialCommunityIcons
              name={item.icon as any}
              size={20}
              color={theme.primary}
            />
            <View style={styles.menuItemContent}>
              <AutoText style={styles.menuLabel} numberOfLines={2}>
                {item.label}
              </AutoText>
              {item.subtitle && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: item.action === 'EditProfile' ? `${completionPercentage}%` : '0%' },
                      ]}
                    />
                  </View>
                  <AutoText style={styles.progressText} numberOfLines={1}>
                    {item.subtitle}
                  </AutoText>
                </View>
              )}
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        ))}

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

        <View style={styles.appInfoContainer}>
          <AutoText style={styles.appInfoText}>
            Scrapmate v1.7.1
          </AutoText>
        </View>
      </ScrollView>

      {/* Theme Modal */}
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

            {['light', 'dark', 'darkGreen', 'whitePurple'].map((themeOption) => (
              <TouchableOpacity
                key={themeOption}
                style={[
                  styles.themeOption,
                  themeName === themeOption && styles.themeOptionSelected,
                ]}
                onPress={() => {
                  setTheme(themeOption as any);
                  setShowThemeModal(false);
                }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={themeOption === 'light' ? 'weather-sunny' : themeOption === 'dark' ? 'weather-night' : themeOption === 'darkGreen' ? 'leaf' : 'palette'}
                  size={24}
                  color={themeName === themeOption ? theme.primary : theme.textSecondary}
                />
                <View style={styles.themeOptionContent}>
                  <AutoText
                    style={[
                      styles.themeOptionLabel,
                      themeName === themeOption && styles.themeOptionLabelSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {themeOption === 'light' ? t('userProfile.light') : themeOption === 'dark' ? t('userProfile.dark') : themeOption === 'darkGreen' ? (t('userProfile.darkGreen') || 'Forest Night') : (t('userProfile.whitePurple') || 'Lavender Dream')}
                  </AutoText>
                </View>
                {themeName === themeOption && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={24}
                    color={theme.primary}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* Logout Modal */}
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

      {/* Join B2C Network Modal */}
      <Modal
        visible={showB2CNetworkModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowB2CNetworkModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              onPress={() => setShowB2CNetworkModal(false)}
              style={styles.b2cCloseButton}
            >
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={theme.textPrimary}
              />
            </TouchableOpacity>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.b2cModalContent}
            >
              <View style={styles.b2cIconContainer}>
                <MaterialCommunityIcons
                  name="account-group"
                  size={64}
                  color={theme.primary}
                />
              </View>

              <AutoText style={styles.b2cModalTitle} numberOfLines={2}>
                {t('userProfile.b2cNetworkTitle') || 'Join our B2C Network'}
              </AutoText>

              <AutoText style={styles.b2cModalDescription} numberOfLines={3}>
                {t('userProfile.b2cNetworkDescription') || 'An aadhar card and driving license is enough to join collecting scraps from customer areas.'}
              </AutoText>

              <View style={styles.b2cStepsContainer}>
                <View style={styles.b2cStepItem}>
                  <View style={styles.b2cStepNumber}>
                    <AutoText style={styles.b2cStepNumberText}>1</AutoText>
                  </View>
                  <AutoText style={styles.b2cStepText} numberOfLines={2}>
                    {t('userProfile.b2cStep1') || 'Download Scrapmate Partner App'}
                  </AutoText>
                </View>

                <View style={styles.b2cStepDivider}>
                  <MaterialCommunityIcons
                    name="arrow-down"
                    size={20}
                    color={theme.primary}
                  />
                </View>

                <View style={styles.b2cStepItem}>
                  <View style={styles.b2cStepNumber}>
                    <AutoText style={styles.b2cStepNumberText}>2</AutoText>
                  </View>
                  <AutoText style={styles.b2cStepText} numberOfLines={2}>
                    {t('userProfile.b2cStep2') || 'Join as B2C'}
                  </AutoText>
                </View>

                <View style={styles.b2cStepDivider}>
                  <MaterialCommunityIcons
                    name="arrow-down"
                    size={20}
                    color={theme.primary}
                  />
                </View>

                <View style={styles.b2cStepItem}>
                  <View style={styles.b2cStepNumber}>
                    <AutoText style={styles.b2cStepNumberText}>3</AutoText>
                  </View>
                  <AutoText style={styles.b2cStepText} numberOfLines={2}>
                    {t('userProfile.b2cStep3') || 'Upload Documents'}
                  </AutoText>
                </View>

                <View style={styles.b2cStepDivider}>
                  <MaterialCommunityIcons
                    name="arrow-down"
                    size={20}
                    color={theme.primary}
                  />
                </View>

                <View style={styles.b2cStepItem}>
                  <View style={styles.b2cStepNumber}>
                    <AutoText style={styles.b2cStepNumberText}>4</AutoText>
                  </View>
                  <AutoText style={styles.b2cStepText} numberOfLines={2}>
                    {t('userProfile.b2cStep4') || 'Start Collecting Scrap from Customers with Live Tracking'}
                  </AutoText>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.b2cModalButton, { backgroundColor: theme.primary }]}
              onPress={async () => {
                const url = 'https://play.google.com/store/apps/details?id=com.app.scrapmatepartner';
                try {
                  const supported = await Linking.canOpenURL(url);
                  if (supported) {
                    await Linking.openURL(url);
                  } else {
                    Alert.alert('Error', 'Unable to open Play Store');
                  }
                } catch (error) {
                  Alert.alert('Error', 'Failed to open Play Store');
                }
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="download"
                size={20}
                color="#FFFFFF"
                style={{ marginRight: 8 }}
              />
              <AutoText style={styles.b2cModalButtonText} numberOfLines={1}>
                {t('userProfile.downloadApp') || 'Download'}
              </AutoText>
            </TouchableOpacity>
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
      paddingHorizontal: '18@s',
      paddingTop: '18@vs',
      paddingBottom: '32@vs',
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
      borderColor: theme.textSecondary,
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
    b2cCloseButton: {
      position: 'absolute',
      top: '24@vs',
      right: '18@s',
      zIndex: 10,
      padding: '8@s',
    },
    b2cModalContent: {
      paddingBottom: '20@vs',
      paddingTop: '8@vs',
    },
    b2cIconContainer: {
      alignItems: 'center',
      marginBottom: '20@vs',
    },
    b2cModalTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '20@s',
      color: theme.textPrimary,
      textAlign: 'center',
      marginBottom: '16@vs',
    },
    b2cModalDescription: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: '20@vs',
      marginBottom: '24@vs',
    },
    b2cStepsContainer: {
      marginBottom: '24@vs',
    },
    b2cStepItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: '12@vs',
    },
    b2cStepNumber: {
      width: '32@s',
      height: '32@s',
      borderRadius: '16@s',
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: '14@s',
    },
    b2cStepNumberText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: '#FFFFFF',
    },
    b2cStepText: {
      flex: 1,
      fontFamily: 'Poppins-Medium',
      fontSize: '14@s',
      color: theme.textPrimary,
      lineHeight: '20@vs',
    },
    b2cStepDivider: {
      alignItems: 'center',
      marginVertical: '4@vs',
      marginLeft: '16@s',
    },
    b2cModalButton: {
      flexDirection: 'row',
      paddingVertical: '16@vs',
      paddingHorizontal: '24@s',
      borderRadius: '12@ms',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: '16@vs',
    },
    b2cModalButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: '#FFFFFF',
    },
  });

export default UserProfileScreen;
