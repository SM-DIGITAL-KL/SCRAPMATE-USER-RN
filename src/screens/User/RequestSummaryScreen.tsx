import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../components/ThemeProvider';
import { AutoText } from '../../components/AutoText';
import { ScaledSheet } from 'react-native-size-matters';
import { useTabBar } from '../../context/TabBarContext';
import { getSubcategories, Subcategory } from '../../services/api/v2/categories';
import { useApiQuery } from '../../hooks';
import type { UserRootStackParamList } from '../../navigation/UserTabNavigator';

interface UploadedImage {
  uri: string;
  type?: string;
  fileName?: string;
}

const RequestSummaryScreen = () => {
  const { theme, isDark, themeName } = useTheme();
  const { setTabBarVisible } = useTabBar();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = route.params as UserRootStackParamList['RequestSummary'];
  
  const selectedMaterialIds = routeParams?.selectedMaterials || [];
  const [uploadedImages] = useState<UploadedImage[]>(routeParams?.uploadedImages || []);
  const [note] = useState(routeParams?.note || '');
  const [pickupLocation] = useState(routeParams?.pickupLocation || 'Your Location');
  const [pickupAddress] = useState(routeParams?.pickupAddress || 'Shop No 15, Katraj, Bengaluru');
  const [pickupDate] = useState(routeParams?.pickupDate || 'Monday, 15 December 2025');
  
  // Fetch all subcategories to get details for selected materials
  const { data: subcategoriesData, isLoading: loadingMaterials } = useApiQuery({
    queryKey: ['subcategories', 'b2c'],
    queryFn: () => getSubcategories(undefined, 'b2c'),
    enabled: selectedMaterialIds.length > 0,
  });

  // Filter to get only selected materials
  const selectedMaterials = useMemo(() => {
    if (!subcategoriesData?.data || selectedMaterialIds.length === 0) {
      return [];
    }
    return subcategoriesData.data.filter((sub: Subcategory) => 
      selectedMaterialIds.includes(sub.id)
    );
  }, [subcategoriesData, selectedMaterialIds]);
  
  const styles = useMemo(() => getStyles(theme, themeName, isDark), [theme, themeName, isDark]);

  useFocusEffect(
    React.useCallback(() => {
      setTabBarVisible(false);
      return () => {
        setTabBarVisible(true);
      };
    }, [setTabBarVisible])
  );




  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={isDark ? theme.background : '#FFFFFF'}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <AutoText style={styles.headerTitle} numberOfLines={1}>
          Review Request
        </AutoText>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Selected Materials Section */}
        <View style={styles.section}>
          <AutoText style={styles.sectionTitleSmall}>Selected Materials</AutoText>
          {loadingMaterials ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
              <AutoText style={styles.loadingText}>Loading materials...</AutoText>
            </View>
          ) : selectedMaterials.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.materialsScroll}>
              {selectedMaterials.map((material: Subcategory) => (
                <View key={material.id} style={styles.materialCard}>
                  {material.image ? (
                    <Image source={{ uri: material.image }} style={styles.materialImage} />
                  ) : (
                    <View style={styles.materialImagePlaceholder}>
                      <MaterialCommunityIcons name="package-variant" size={24} color={theme.textSecondary} />
                    </View>
                  )}
                  <AutoText style={styles.materialName} numberOfLines={1}>
                    {material.name || 'Material'}
                  </AutoText>
                  <AutoText style={styles.materialPrice}>
                    ₹{material.default_price || 0}/{material.price_unit || 'kg'}
                  </AutoText>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyMaterialsContainer}>
              <MaterialCommunityIcons name="package-variant" size={48} color={theme.textSecondary} />
              <AutoText style={styles.emptyMaterialsText}>No materials selected</AutoText>
            </View>
          )}
        </View>

        {/* Uploaded Images Section */}
        {uploadedImages.length > 0 && (
          <View style={styles.section}>
            <AutoText style={styles.sectionTitleSmall}>Uploaded Images</AutoText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesScroll}>
              {uploadedImages.map((image, index) => (
                <View key={index} style={styles.imageCard}>
                  <Image source={{ uri: image.uri }} style={styles.uploadedImageThumbnail} />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Note Section */}
        {note && (
          <View style={styles.section}>
            <AutoText style={styles.sectionTitle}>Additional Notes</AutoText>
            <View style={styles.noteCard}>
              <MaterialCommunityIcons name="note-text-outline" size={20} color={theme.primary} />
              <AutoText style={styles.noteText}>{note}</AutoText>
            </View>
          </View>
        )}

        {/* Pickup Location Section */}
        <View style={styles.section}>
          <AutoText style={styles.sectionLabel}>Pickup Location</AutoText>
          <TouchableOpacity style={styles.locationCard} activeOpacity={0.7}>
            <MaterialCommunityIcons name="map-marker" size={24} color={theme.primary} />
            <View style={styles.locationContent}>
              <AutoText style={styles.locationTitle}>{pickupLocation}</AutoText>
              <AutoText style={styles.locationAddress}>{pickupAddress}</AutoText>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Pickup Date Section */}
        <View style={styles.section}>
          <AutoText style={styles.sectionLabel}>Scheduled Pickup</AutoText>
          <View style={styles.dateCard}>
            <View style={styles.dateContent}>
              <AutoText style={styles.dateDay}>Monday</AutoText>
              <AutoText style={styles.dateFull}>{pickupDate}</AutoText>
            </View>
            <TouchableOpacity style={styles.changeButton} activeOpacity={0.7}>
              <MaterialCommunityIcons name="clock-outline" size={18} color={theme.primary} />
              <AutoText style={styles.changeButtonText}>Change</AutoText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Spacing */}
        <View style={{ height: 100 }} />
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
    backButton: {
      width: '40@s',
      height: '40@vs',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      fontFamily: 'Poppins-Bold',
      fontSize: '20@s',
      color: theme.textPrimary,
      textAlign: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: '16@s',
      paddingTop: '20@vs',
      paddingBottom: '24@vs',
    },
    section: {
      marginBottom: '20@vs',
    },
    sectionTitle: {
      fontFamily: 'Poppins-Bold',
      fontSize: '18@s',
      color: theme.textPrimary,
      marginBottom: '12@vs',
    },
    sectionTitleSmall: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: theme.textPrimary,
      marginBottom: '8@vs',
    },
    sectionLabel: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '14@s',
      color: theme.textSecondary,
      marginBottom: '8@vs',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '6@s',
      marginBottom: '8@vs',
    },
    materialsScroll: {
      marginHorizontal: '-16@s',
      paddingHorizontal: '16@s',
    },
    materialCard: {
      width: '90@s',
      marginRight: '10@s',
      backgroundColor: theme.card,
      borderRadius: '10@ms',
      padding: '8@s',
      alignItems: 'center',
    },
    materialImage: {
      width: '70@s',
      height: '70@vs',
      borderRadius: '6@ms',
      marginBottom: '6@vs',
    },
    materialImagePlaceholder: {
      width: '70@s',
      height: '70@vs',
      borderRadius: '6@ms',
      backgroundColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '6@vs',
    },
    materialName: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: theme.textPrimary,
      marginBottom: '3@vs',
    },
    materialPrice: {
      fontFamily: 'Poppins-Regular',
      fontSize: '11@s',
      color: theme.primary,
    },
    addMaterialCard: {
      width: '120@s',
      height: '140@vs',
      marginRight: '12@s',
      borderWidth: 2,
      borderColor: theme.border,
      borderStyle: 'dashed',
      borderRadius: '12@ms',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.card,
    },
    addMaterialText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '12@s',
      color: theme.textSecondary,
      marginTop: '8@vs',
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20@vs',
      gap: '12@s',
    },
    loadingText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    emptyMaterialsContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40@vs',
    },
    emptyMaterialsText: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
      marginTop: '12@vs',
    },
    imagesScroll: {
      marginHorizontal: '-16@s',
      paddingHorizontal: '16@s',
    },
    imageCard: {
      width: '80@s',
      height: '80@vs',
      marginRight: '10@s',
      borderRadius: '10@ms',
      overflow: 'hidden',
    },
    uploadedImageThumbnail: {
      width: '100%',
      height: '100%',
    },
    noteCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      gap: '12@s',
    },
    noteText: {
      flex: 1,
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textPrimary,
      lineHeight: '20@vs',
    },
    locationCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: '12@ms',
      padding: '16@s',
      gap: '12@s',
    },
    locationContent: {
      flex: 1,
    },
    locationTitle: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: '16@s',
      color: theme.textPrimary,
      marginBottom: '4@vs',
    },
    locationAddress: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    dateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.accent || `${theme.primary}15`,
      borderRadius: '12@ms',
      padding: '16@s',
    },
    dateContent: {
      flex: 1,
    },
    dateDay: {
      fontFamily: 'Poppins-Bold',
      fontSize: '16@s',
      color: theme.textPrimary,
      marginBottom: '4@vs',
    },
    dateFull: {
      fontFamily: 'Poppins-Regular',
      fontSize: '14@s',
      color: theme.textSecondary,
    },
    changeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: '4@s',
      paddingHorizontal: '12@s',
      paddingVertical: '6@vs',
      backgroundColor: theme.primary,
      borderRadius: '8@ms',
    },
    changeButtonText: {
      fontFamily: 'Poppins-Medium',
      fontSize: '12@s',
      color: '#FFFFFF',
    },
  });

export default RequestSummaryScreen;

