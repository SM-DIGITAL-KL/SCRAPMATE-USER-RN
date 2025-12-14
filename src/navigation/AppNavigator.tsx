import React, { useEffect, useState, useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthStack, AuthStackParamList } from './AuthStack';
import { isLoggedIn, getUserData } from '../services/auth/authService';
import { View, DeviceEventEmitter } from 'react-native';
import UserTabNavigator from './UserTabNavigator';

type RootStackParamList = {
  AuthFlow: undefined;
  MainApp: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

const MainAppScreen = () => {
  // Simplified - only render UserTabNavigator for user type 'U'
  return <UserTabNavigator />;
};

export const AppNavigator = () => {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [showAuthFlow, setShowAuthFlow] = useState(true);
  const [initialAuthRoute, setInitialAuthRoute] =
    useState<keyof AuthStackParamList>('SelectLanguage');

  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Read all AsyncStorage items in parallel for faster loading
        const [languageSet, storedLanguage, joinAsShown, userLoggedIn] = await Promise.all([
          AsyncStorage.getItem('@app_language_set'),
          AsyncStorage.getItem('@app_language'),
          AsyncStorage.getItem('@join_as_shown'),
          isLoggedIn()
        ]);

        if (userLoggedIn) {
          setShowAuthFlow(false);
        } else if (languageSet !== 'true' && storedLanguage === null) {
          setInitialAuthRoute('SelectLanguage');
          setShowAuthFlow(true);
        } else if (!userLoggedIn) {
          setInitialAuthRoute('Login');
          setShowAuthFlow(true);
        } else {
          setShowAuthFlow(false);
        }
      } catch (error) {
        setInitialAuthRoute('SelectLanguage');
        setShowAuthFlow(true);
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrap();
  }, []);

  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('FORCE_LOGOUT', () => {
      setShowAuthFlow(true);
      setInitialAuthRoute('Login');
    });
    
    return () => {
      sub1.remove();
    };
  }, []);

  const handleAuthComplete = useCallback(() => {
    setShowAuthFlow(false);
  }, []);

  // Keep screen blank while bootstrapping to avoid flashing auth screens
  if (isBootstrapping) {
    return null;
  }

  if (showAuthFlow) {
  return (
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="AuthFlow">
          {() => (
            <AuthStack
              initialRouteName={initialAuthRoute}
              onAuthComplete={handleAuthComplete}
            />
          )}
        </RootStack.Screen>
      </RootStack.Navigator>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="MainApp" component={MainAppScreen} />
    </RootStack.Navigator>
  );
};
