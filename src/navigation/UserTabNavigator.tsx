import React, { useMemo, useEffect, useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, Animated, Easing } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../components/ThemeProvider';
import { useTabBar } from '../context/TabBarContext';
import UserDashboardScreen from '../screens/User/UserDashboardScreen';
import PlaceholderScreen from '../screens/Placeholder/PlaceholderScreen';
import UserProfileScreen from '../screens/B2C/UserProfileScreen';
import EditProfileScreen from '../screens/B2C/EditProfileScreen';
import SelectLanguageScreen from '../screens/B2C/SelectLanguageScreen';
import PrivacyPolicyScreen from '../screens/Common/PrivacyPolicyScreen';
import TermsScreen from '../screens/Common/TermsScreen';

export type UserTabParamList = {
  Home: undefined;
  RateList: undefined;
  Profile: undefined;
};

export type UserRootStackParamList = {
  MainTabs: undefined;
  EditProfile: undefined;
  SelectLanguage: undefined;
  PrivacyPolicy: undefined;
  Terms: undefined;
};

const Tab = createBottomTabNavigator<UserTabParamList>();
const RootStack = createNativeStackNavigator<UserRootStackParamList>();

const UserTabs = () => {
  const { theme, isDark, themeName } = useTheme();
  const insets = useSafeAreaInsets();
  const { isTabBarVisible } = useTabBar();
  const tabBarHeight = Platform.OS === 'ios' ? 72 + insets.bottom : 72;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

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

  const animatedTabBarStyle = useMemo(() => {
    const isHidden = !isTabBarVisible;
    return {
      height: isHidden ? 0 : tabBarHeight,
      borderTopWidth: 0,
      paddingTop: isHidden ? 0 : 8,
      paddingBottom: isHidden ? 0 : (Platform.OS === 'ios' ? insets.bottom : 16),
      backgroundColor: themeName === 'whitePurple' ? '#FFFFFF' : theme.card,
      transform: [{ translateY }],
      opacity,
      pointerEvents: isTabBarVisible ? 'auto' : 'none' as 'auto' | 'none',
      elevation: isTabBarVisible ? 8 : 0,
      shadowOpacity: isHidden ? 0 : 0.1,
      overflow: 'hidden' as const,
    };
  }, [tabBarHeight, insets.bottom, theme.card, themeName, translateY, opacity, isTabBarVisible]);

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
        component={PlaceholderScreen}
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
      <RootStack.Screen name="EditProfile" component={EditProfileScreen} />
      <RootStack.Screen name="SelectLanguage" component={SelectLanguageScreen} />
      <RootStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <RootStack.Screen name="Terms" component={TermsScreen} />
    </RootStack.Navigator>
  );
};

export default UserTabNavigator;
