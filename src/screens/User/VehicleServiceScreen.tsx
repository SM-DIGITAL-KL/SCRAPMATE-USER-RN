import React, { useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTabBar } from '../../context/TabBarContext';
import LinearGradient from 'react-native-linear-gradient';
import { useTranslation } from 'react-i18next';
import { CategoryWithSubcategories, Subcategory } from '../../services/api/v2/categories';
import { useCategoriesWithSubcategories } from '../../hooks/useCategories';

const VehicleServiceScreen = () => {
  const { theme, isDark, themeName } = useTheme();
  const { setTabBarVisible } = useTabBar();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();

  const styles = useMemo(() => getStyles(theme, themeName, isDark), [theme, themeName, isDark]);

  // Hide tab bar when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      setTabBarVisible(false);
      return () => {
        setTabBarVisible(true);
      };
    }, [setTabBarVisible])
  );

  // Fetch categories with subcategories
  const { 
    data: categoriesWithSubcategoriesData, 
    isLoading: loadingCategories
  } = useCategoriesWithSubcategories(undefined, true, false);

  // Find vehicle/automobile category
  const vehicleCategory: CategoryWithSubcategories | undefined = useMemo(() => {
    const categories: CategoryWithSubcategories[] = categoriesWithSubcategoriesData?.data || [];
    return categories.find(category => {
      const name = category.name.toLowerCase();
      return name.includes('automobile') || name.includes('vehicle') || name.includes('auto');
    });
  }, [categoriesWithSubcategoriesData]);

  // Get vehicle subcategories
  const vehicleSubcategories: Subcategory[] = useMemo(() => {
    return vehicleCategory?.subcategories || [];
  }, [vehicleCategory]);

  // Header gradient colors
  const getHeaderGradient = () => {
    if (themeName === 'darkGreen') return ['#1B5E20', '#2E7D32'];
    if (themeName === 'whitePurple') return ['#6A1B9A', '#8E24AA'];
    return [theme.primary, theme.primary];
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />

      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerContent}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <AutoText style={styles.headerTitle}>{t('vehicleService.title')}</AutoText>
            <AutoText style={styles.headerSubtitle}>{t('vehicleService.subtitle')}</AutoText>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroIconContainer}>
            <Image
              source={require('../../assets/images/Scrapvehicle.png')}
              style={styles.heroIcon}
              resizeMode="contain"
            />
          </View>
          <AutoText style={styles.heroTitle}>{t('vehicleService.heroTitle')}</AutoText>
          <AutoText style={styles.heroDescription} numberOfLines={0}>
            {t('vehicleService.heroDescription')}
          </AutoText>
        </View>

        {/* Benefits Section */}
        <View style={styles.benefitsSection}>
          {/* Top Row: Best Price and Certified Process */}
          <View style={styles.benefitsTopRow}>
            <View style={styles.benefitCard}>
              <View style={styles.benefitIconContainer}>
                <MaterialCommunityIcons name="cash-multiple" size={24} color={theme.primary} />
              </View>
              <AutoText style={styles.benefitTitle}>{t('vehicleService.benefits.bestPrice.title')}</AutoText>
              <AutoText style={styles.benefitDescription} numberOfLines={0}>
                {t('vehicleService.benefits.bestPrice.description')}
              </AutoText>
            </View>
            <View style={styles.benefitCard}>
              <View style={styles.benefitIconContainer}>
                <MaterialCommunityIcons name="shield-check" size={24} color={theme.primary} />
              </View>
              <AutoText style={styles.benefitTitle}>{t('vehicleService.benefits.certified.title')}</AutoText>
              <AutoText style={styles.benefitDescription} numberOfLines={0}>
                {t('vehicleService.benefits.certified.description')}
              </AutoText>
            </View>
          </View>
          {/* Bottom Row: Quick Service */}
          <View style={styles.benefitsBottomRow}>
            <View style={styles.benefitCardBottom}>
              <View style={styles.benefitIconContainer}>
                <MaterialCommunityIcons name="clock-fast" size={24} color={theme.primary} />
              </View>
              <AutoText style={styles.benefitTitle}>{t('vehicleService.benefits.quickService.title')}</AutoText>
              <AutoText style={styles.benefitDescription} numberOfLines={0}>
                {t('vehicleService.benefits.quickService.description')}
              </AutoText>
            </View>
          </View>
        </View>

        {/* Price List Section */}
        <View style={styles.priceSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <MaterialCommunityIcons name="currency-inr" size={24} color={theme.primary} />
              <AutoText style={styles.sectionTitle}>{t('vehicleService.priceList.title')}</AutoText>
            </View>
            <AutoText style={styles.sectionSubtitle}>
              {t('vehicleService.priceList.itemsAvailable', { count: vehicleSubcategories.length })}
            </AutoText>
          </View>

          {loadingCategories ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <AutoText style={styles.loadingText}>{t('vehicleService.priceList.loading')}</AutoText>
            </View>
          ) : vehicleSubcategories.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="car-off" size={48} color={theme.textSecondary} />
              <AutoText style={styles.emptyText}>{t('vehicleService.priceList.empty')}</AutoText>
            </View>
          ) : (
            <View style={styles.priceListContainer}>
              {vehicleSubcategories.map((subcategory, index) => (
                <View key={subcategory.id} style={styles.priceCard}>
                  <View style={styles.priceCardLeft}>
                    <View style={styles.priceItemIcon}>
                      <MaterialCommunityIcons 
                        name="car" 
                        size={20} 
                        color={theme.primary} 
                      />
                    </View>
                    <View style={styles.priceItemInfo}>
                      <AutoText style={styles.priceItemName} numberOfLines={2}>
                        {subcategory.name}
                      </AutoText>
                      <AutoText style={styles.priceItemUnit}>
                        {t('vehicleService.priceList.perUnit', { unit: subcategory.price_unit || 'kg' })}
                      </AutoText>
                    </View>
                  </View>
                  <View style={styles.priceCardRight}>
                    <AutoText style={styles.priceAmount}>
                      ₹{subcategory.default_price || '0'}
                    </AutoText>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Additional Info Section */}
        <View style={styles.infoSection}>
          <AutoText style={styles.infoTitle}>{t('vehicleService.whyChoose.title')}</AutoText>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="leaf" size={20} color={theme.primary} />
            <View style={styles.infoTextContainer}>
              <AutoText style={styles.infoCardTitle}>{t('vehicleService.whyChoose.ecoFriendly.title')}</AutoText>
              <AutoText style={styles.infoCardDescription} numberOfLines={0}>
                {t('vehicleService.whyChoose.ecoFriendly.description')}
              </AutoText>
            </View>
          </View>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="certificate" size={20} color={theme.primary} />
            <View style={styles.infoTextContainer}>
              <AutoText style={styles.infoCardTitle}>{t('vehicleService.whyChoose.governmentCertified.title')}</AutoText>
              <AutoText style={styles.infoCardDescription} numberOfLines={0}>
                {t('vehicleService.whyChoose.governmentCertified.description')}
              </AutoText>
            </View>
          </View>
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="truck-delivery" size={20} color={theme.primary} />
            <View style={styles.infoTextContainer}>
              <AutoText style={styles.infoCardTitle}>{t('vehicleService.whyChoose.freePickup.title')}</AutoText>
              <AutoText style={styles.infoCardDescription} numberOfLines={0}>
                {t('vehicleService.whyChoose.freePickup.description')}
              </AutoText>
            </View>
          </View>
        </View>

        {/* Process Section */}
        <View style={styles.processSection}>
          <AutoText style={styles.sectionTitle}>{t('vehicleService.process.title')}</AutoText>
          <View style={styles.processCard}>
            <View style={styles.processStep}>
              <View style={styles.processNumber}>
                <AutoText style={styles.processNumberText}>1</AutoText>
              </View>
              <View style={styles.processContent}>
                <AutoText style={styles.processStepTitle}>{t('vehicleService.process.step1.title')}</AutoText>
                <AutoText style={styles.processStepDescription} numberOfLines={0}>
                  {t('vehicleService.process.step1.description')}
                </AutoText>
              </View>
            </View>
          </View>
          <View style={styles.processCard}>
            <View style={styles.processStep}>
              <View style={styles.processNumber}>
                <AutoText style={styles.processNumberText}>2</AutoText>
              </View>
              <View style={styles.processContent}>
                <AutoText style={styles.processStepTitle}>{t('vehicleService.process.step2.title')}</AutoText>
                <AutoText style={styles.processStepDescription} numberOfLines={0}>
                  {t('vehicleService.process.step2.description')}
                </AutoText>
              </View>
            </View>
          </View>
          <View style={styles.processCard}>
            <View style={styles.processStep}>
              <View style={styles.processNumber}>
                <AutoText style={styles.processNumberText}>3</AutoText>
              </View>
              <View style={styles.processContent}>
                <AutoText style={styles.processStepTitle}>{t('vehicleService.process.step3.title')}</AutoText>
                <AutoText style={styles.processStepDescription} numberOfLines={0}>
                  {t('vehicleService.process.step3.description')}
                </AutoText>
              </View>
            </View>
          </View>
          <View style={styles.processCard}>
            <View style={styles.processStep}>
              <View style={styles.processNumber}>
                <AutoText style={styles.processNumberText}>4</AutoText>
              </View>
              <View style={styles.processContent}>
                <AutoText style={styles.processStepTitle}>{t('vehicleService.process.step4.title')}</AutoText>
                <AutoText style={styles.processStepDescription} numberOfLines={0}>
                  {t('vehicleService.process.step4.description')}
                </AutoText>
              </View>
            </View>
          </View>
        </View>

        {/* Additional Benefits Section */}
        <View style={styles.additionalBenefitsSection}>
          <AutoText style={styles.sectionTitle}>{t('vehicleService.additionalBenefits.title')}</AutoText>
          <View style={styles.additionalBenefitCard}>
            <MaterialCommunityIcons name="recycle" size={24} color={theme.primary} />
            <View style={styles.additionalBenefitContent}>
              <AutoText style={styles.additionalBenefitTitle}>{t('vehicleService.additionalBenefits.recycling.title')}</AutoText>
              <AutoText style={styles.additionalBenefitDescription} numberOfLines={0}>
                {t('vehicleService.additionalBenefits.recycling.description')}
              </AutoText>
            </View>
          </View>
          <View style={styles.additionalBenefitCard}>
            <MaterialCommunityIcons name="file-document-check" size={24} color={theme.primary} />
            <View style={styles.additionalBenefitContent}>
              <AutoText style={styles.additionalBenefitTitle}>{t('vehicleService.additionalBenefits.documentation.title')}</AutoText>
              <AutoText style={styles.additionalBenefitDescription} numberOfLines={0}>
                {t('vehicleService.additionalBenefits.documentation.description')}
              </AutoText>
            </View>
          </View>
          <View style={styles.additionalBenefitCard}>
            <MaterialCommunityIcons name="account-group" size={24} color={theme.primary} />
            <View style={styles.additionalBenefitContent}>
              <AutoText style={styles.additionalBenefitTitle}>{t('vehicleService.additionalBenefits.expertTeam.title')}</AutoText>
              <AutoText style={styles.additionalBenefitDescription} numberOfLines={0}>
                {t('vehicleService.additionalBenefits.expertTeam.description')}
              </AutoText>
            </View>
          </View>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <TouchableOpacity
            style={styles.ctaButton}
            activeOpacity={0.8}
            onPress={() => {
              // Navigate to material selection with vehicle category pre-selected
              if (vehicleCategory) {
                (navigation as any).navigate('MaterialSelection', {
                  selectedCategories: [vehicleCategory.id],
                  allCategoriesWithSubcategories: categoriesWithSubcategoriesData?.data || [],
                });
              } else {
                navigation.goBack();
              }
            }}
          >
            <LinearGradient
              colors={getHeaderGradient()}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <AutoText style={styles.ctaButtonText}>{t('vehicleService.cta.startScrapping')}</AutoText>
              <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
};

const getStyles = (theme: any, themeName?: string, isDark?: boolean) =>
  ScaledSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerContainer: {
      backgroundColor: theme.background,
      paddingHorizontal: '20@s',
      paddingBottom: '20@vs',
      paddingTop: '10@vs',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: '40@s',
      height: '40@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleContainer: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '22@s',
      color: theme.textPrimary,
      marginBottom: '4@vs',
    },
    headerSubtitle: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: '16@s',
      paddingTop: '24@vs',
      paddingBottom: '24@vs',
    },
    heroSection: {
      alignItems: 'center',
      marginBottom: '32@vs',
    },
    heroIconContainer: {
      width: '120@s',
      height: '120@vs',
      borderRadius: '20@ms',
      backgroundColor: theme.accent || `${theme.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '20@vs',
    },
    heroIcon: {
      width: '100@s',
      height: '100@vs',
    },
    heroTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '24@s',
      color: theme.textPrimary,
      marginBottom: '12@vs',
      textAlign: 'center',
    },
    heroDescription: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: '20@vs',
      paddingHorizontal: '20@s',
    },
    benefitsSection: {
      marginBottom: '32@vs',
    },
    benefitsTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: '12@vs',
      gap: '12@vs',
    },
    benefitsBottomRow: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    benefitIconContainer: {
      width: '48@s',
      height: '48@vs',
      borderRadius: '24@ms',
      backgroundColor: theme.accent || `${theme.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '12@vs',
    },
    benefitTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '13@s',
      color: theme.textPrimary,
      marginBottom: '8@vs',
      textAlign: 'center',
      flexWrap: 'wrap',
    },
    benefitDescription: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.textSecondary,
      textAlign: 'center',
      lineHeight: '16@vs',
      flexWrap: 'wrap',
      flexShrink: 1,
    },
    benefitCard: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '14@s',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      minHeight: '150@vs',
      justifyContent: 'flex-start',
    },
    benefitCardBottom: {
      width: '100%',
      maxWidth: '400@s',
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '14@s',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      minHeight: '150@vs',
      justifyContent: 'flex-start',
    },
    priceSection: {
      marginBottom: '32@vs',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '16@vs',
    },
    sectionTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '8@s',
    },
    sectionTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '20@s',
      color: theme.textPrimary,
    },
    sectionSubtitle: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
    },
    loadingContainer: {
      paddingVertical: '48@vs',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12@s',
    },
    loadingText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    emptyContainer: {
      paddingVertical: '48@vs',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12@s',
    },
    emptyText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    priceListContainer: {
      gap: '12@vs',
    },
    priceCard: {
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: '10@vs',
    },
    priceCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: '12@s',
    },
    priceItemIcon: {
      width: '40@s',
      height: '40@vs',
      borderRadius: '8@ms',
      backgroundColor: theme.accent || `${theme.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    priceItemInfo: {
      flex: 1,
    },
    priceItemName: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '4@vs',
    },
    priceItemUnit: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.textSecondary,
    },
    priceCardRight: {
      alignItems: 'flex-end',
    },
    priceAmount: {
      fontFamily: 'Poppins-Bold',
      fontSize: '18@s',
      color: theme.primary,
    },
    infoSection: {
      marginBottom: '32@vs',
    },
    infoTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '20@s',
      color: theme.textPrimary,
      marginBottom: '20@vs',
    },
    infoCard: {
      flexDirection: 'row',
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      marginBottom: '12@vs',
      borderWidth: 1,
      borderColor: theme.border,
      gap: '12@s',
    },
    infoTextContainer: {
      flex: 1,
    },
    infoCardTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.textPrimary,
      marginBottom: '6@vs',
    },
    infoCardDescription: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      lineHeight: '18@vs',
    },
    ctaSection: {
      marginBottom: '20@vs',
    },
    ctaButton: {
      borderRadius: '12@ms',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    ctaGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: '16@vs',
      paddingHorizontal: '24@s',
      gap: '10@s',
    },
    ctaButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: '#FFFFFF',
    },
    processSection: {
      marginBottom: '32@vs',
    },
    processCard: {
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      marginBottom: '12@vs',
      borderWidth: 1,
      borderColor: theme.border,
    },
    processStep: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: '16@s',
    },
    processNumber: {
      width: '36@s',
      height: '36@vs',
      borderRadius: '18@ms',
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    processNumberText: {
      fontFamily: 'Poppins-Bold',
      fontSize: '16@s',
      color: '#FFFFFF',
    },
    processContent: {
      flex: 1,
    },
    processStepTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '15@s',
      color: theme.textPrimary,
      marginBottom: '6@vs',
    },
    processStepDescription: {
      fontFamily: 'Poppins-Regular',
      fontSize: '13@s',
      color: theme.textSecondary,
      lineHeight: '20@vs',
    },
    additionalBenefitsSection: {
      marginBottom: '32@vs',
    },
    additionalBenefitCard: {
      flexDirection: 'row',
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      marginBottom: '12@vs',
      borderWidth: 1,
      borderColor: theme.border,
      gap: '16@s',
      alignItems: 'flex-start',
    },
    additionalBenefitContent: {
      flex: 1,
    },
    additionalBenefitTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '15@s',
      color: theme.textPrimary,
      marginBottom: '6@vs',
    },
    additionalBenefitDescription: {
      fontFamily: 'Poppins-Regular',
      fontSize: '13@s',
      color: theme.textSecondary,
      lineHeight: '20@vs',
    },
  });

export default VehicleServiceScreen;