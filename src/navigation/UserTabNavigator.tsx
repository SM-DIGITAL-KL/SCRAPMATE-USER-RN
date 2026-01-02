import React, { useMemo, useEffect, useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, Animated, Easing, DeviceEventEmitter } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../components/ThemeProvider';
import { useTabBar } from '../context/TabBarContext';
import { useLocation } from '../context/LocationContext';
import UserDashboardScreen from '../screens/User/UserDashboardScreen';
import RateListScreen from '../screens/User/RateListScreen';
import MaterialSelectionScreen from '../screens/User/MaterialSelectionScreen';
import UploadImagesScreen from '../screens/User/UploadImagesScreen';
import RequestSummaryScreen from '../screens/User/RequestSummaryScreen';
import VehicleServiceScreen from '../screens/User/VehicleServiceScreen';
import PlaceholderScreen from '../screens/Placeholder/PlaceholderScreen';
import UserProfileScreen from '../screens/User/UserProfileScreen';
import EditProfileScreen from '../screens/User/EditProfileScreen';
import SelectLanguageScreen from '../screens/Common/SelectLanguageScreen';
import PrivacyPolicyScreen from '../screens/Common/PrivacyPolicyScreen';
import TermsScreen from '../screens/Common/TermsScreen';

export type UserTabParamList = {
  Home: undefined;
  RateList: undefined;
  Profile: undefined;
};

export type UserRootStackParamList = {
  MainTabs: undefined;
  MaterialSelection: { 
    selectedCategories?: number[];
    allCategoriesWithSubcategories?: any[];
  } | undefined;
  UploadImages: { selectedSubcategories?: number[] } | undefined;
  RequestSummary: {
    selectedMaterials?: any[];
    uploadedImages?: any[];
    note?: string;
    pickupLocation?: string;
    pickupAddress?: string;
    pickupDate?: string;
  } | undefined;
  EditProfile: undefined;
  SelectLanguage: undefined;
  PrivacyPolicy: undefined;
  Terms: undefined;
  VehicleService: undefined;
};

const Tab = createBottomTabNavigator<UserTabParamList>();
const RootStack = createNativeStackNavigator<UserRootStackParamList>();

const UserTabs = () => {
  const { theme, isDark, themeName } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTabBarVisible } = useTabBar();
  const { isLocationLoading } = useLocation();
  const tabBarHeight = Platform.OS === 'ios' ? 72 + insets.bottom : 72;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const disabledOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isTabBarVisible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: tabBarHeight,
          duration: 500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isTabBarVisible, translateY, opacity, tabBarHeight]);

  // Update disabled opacity based on location loading state
  useEffect(() => {
    Animated.timing(disabledOpacity, {
      toValue: isLocationLoading ? 0.5 : 1,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isLocationLoading, disabledOpacity]);

  const animatedTabBarStyle = useMemo(() => {
    const isHidden = !isTabBarVisible;
    const isDisabled = isLocationLoading;
    return {
      height: isHidden ? 0 : tabBarHeight,
      borderTopWidth: 0,
      paddingTop: isHidden ? 0 : 8,
      paddingBottom: isHidden ? 0 : (Platform.OS === 'ios' ? insets.bottom : 16),
      backgroundColor: themeName === 'whitePurple' ? '#FFFFFF' : theme.card,
      transform: [{ translateY }],
      opacity: Animated.multiply(opacity, disabledOpacity), // Combine visibility and disabled opacity
      pointerEvents: (isTabBarVisible && !isDisabled) ? 'auto' : 'none' as 'auto' | 'none',
      elevation: isTabBarVisible ? 8 : 0,
      shadowOpacity: isHidden ? 0 : 0.1,
      overflow: 'hidden' as const,
    };
  }, [tabBarHeight, insets.bottom, theme.card, themeName, translateY, opacity, disabledOpacity, isTabBarVisible, isLocationLoading]);

  const tabBarStyle = animatedTabBarStyle as any;

  const screenOptions = useMemo(() => ({
    headerShown: false,
    tabBarActiveTintColor: isDark ? '#f0fef4' : theme.primary,
    tabBarInactiveTintColor: isDark ? '#feffff' : theme.textSecondary,
    tabBarStyle,
    tabBarLabelStyle: {
      fontFamily: 'Poppins-Medium',
      fontSize: 12,
    },
  }), [isDark, theme.primary, theme.textSecondary, tabBarStyle]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...screenOptions,
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<keyof UserTabParamList, string> = {
            Home: 'home-variant',
            RateList: 'currency-inr',
            Profile: 'account',
          };

          const iconName = iconMap[route.name as keyof UserTabParamList];

          return (
            <MaterialCommunityIcons name={iconName} size={size ?? 24} color={color} />
          );
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={UserDashboardScreen}
        options={{
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen 
        name="RateList" 
        component={RateListScreen}
        options={{
          tabBarLabel: 'Rate List',
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={UserProfileScreen}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

const UserTabNavigator = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  // Listen for navigation events from FCM
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('navigateToMyOrders', (data) => {
      console.log('📱 UserTabNavigator: Received navigateToMyOrders event:', data);
      navigation.navigate('MyOrders');
    });

    return () => {
      subscription.remove();
    };
  }, [navigation]);

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: {
        backgroundColor: theme.background,
      },
    }),
    [theme.background],
  );

  return (
    <RootStack.Navigator screenOptions={screenOptions}>
      <RootStack.Screen name="MainTabs" component={UserTabs} />
      <RootStack.Screen name="MaterialSelection" component={MaterialSelectionScreen} />
      <RootStack.Screen name="UploadImages" component={UploadImagesScreen} />
      <RootStack.Screen name="RequestSummary" component={RequestSummaryScreen} />
      <RootStack.Screen name="VehicleService" component={VehicleServiceScreen} />
      <RootStack.Screen name="EditProfile" component={EditProfileScreen} />
      <RootStack.Screen name="SelectLanguage" component={SelectLanguageScreen} />
      <RootStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <RootStack.Screen name="Terms" component={TermsScreen} />
      <RootStack.Screen name="MyOrders" component={require('../screens/User/MyOrdersScreen').default} />
      <RootStack.Screen name="OrderTracking" component={require('../screens/User/OrderTrackingScreen').default} />
    </RootStack.Navigator>
  );
};

export default UserTabNavigator;
