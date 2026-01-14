import React, { useEffect, useMemo } from 'react';
import { StatusBar, Platform, NativeModules, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../components/ThemeProvider';
import { TabBarProvider } from '../context/TabBarContext';
import { UserModeProvider } from '../context/UserModeContext';
import { LocationProvider } from '../context/LocationContext';
import { AppNavigator } from '../navigation/AppNavigator';
import { getStoredLanguage } from '../i18n/config';
import { KeyboardProvider } from '../components/KeyboardProvider';
import { networkService } from '../services/network/networkService';
import { offlineQueue } from '../services/offline/offlineQueue';
import { fcmService } from '../services/fcm/fcmService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import firebase from '@react-native-firebase/app';
import '../i18n/config';

const { NavigationBarModule } = NativeModules;

const AppContent = () => {
  const { isDark, theme } = useTheme();

  useEffect(() => {
    if (Platform.OS === 'android' && NavigationBarModule?.setNavigationBarColor) {
      const navBarColor = isDark ? theme.background : '#FFFFFF';
      NavigationBarModule.setNavigationBarColor(navBarColor);
    }
  }, [isDark, theme.background]);

  // Make NavigationContainer theme reactive to theme changes
  const navigationTheme = useMemo(() => ({
    dark: isDark,
    colors: {
      primary: theme.primary,
      background: theme.background,
      card: theme.card,
      text: theme.textPrimary,
      border: theme.border,
      notification: theme.primary,
    },
    fonts: {
      regular: {
        fontFamily: 'Poppins-Regular',
        fontWeight: '400' as any,
      },
      medium: {
        fontFamily: 'Poppins-Medium',
        fontWeight: '500' as any,
      },
      bold: {
        fontFamily: 'Poppins-SemiBold',
        fontWeight: '600' as any,
      },
      heavy: {
        fontFamily: 'Poppins-Bold',
        fontWeight: '700' as any,
      },
    },
  }), [isDark, theme.primary, theme.background, theme.card, theme.textPrimary, theme.border]);

  const statusBarBackground = isDark ? theme.background : '#FFFFFF';
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaProvider>
        <StatusBar 
          barStyle={statusBarStyle}
          backgroundColor={statusBarBackground}
          translucent={false}
        />
        <NavigationContainer 
          theme={navigationTheme}
          style={{ backgroundColor: theme.background }}
        >
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </View>
  );
};

const App = () => {
  useEffect(() => {
    // Initialize offline-first services
    const initializeOfflineServices = async () => {
      try {
        // Ensure Firebase is initialized first
        try {
          if (!firebase.apps.length) {
            // Firebase should auto-initialize from native config files
            // But check if it's ready
            console.log('🔥 Firebase: Checking initialization...');
            // Wait a bit for native initialization to complete
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          console.log('🔥 Firebase: Ready');
        } catch (firebaseError) {
          console.error('❌ Firebase: Initialization error:', firebaseError);
          // Continue anyway - Firebase might still work from native initialization
        }

        // Initialize network monitoring
        await networkService.initialize();
        
        // Initialize offline queue
        offlineQueue.initialize();
        
        // Initialize language from storage
        await getStoredLanguage();
        
        // Initialize FCM service (requires Firebase to be ready)
        try {
          await fcmService.initialize();
        } catch (fcmError) {
          console.error('❌ FCM Service: Initialization error:', fcmError);
          // Continue anyway - app should work without FCM
        }
      } catch (error) {
        console.error('Error initializing offline services:', error);
        // Continue even if initialization fails
      }
    };

    initializeOfflineServices();

    // Cleanup FCM service on unmount
    return () => {
      fcmService.cleanup();
    };
  }, []);

  // Persistent Query Client - 365 days
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 365 * 24 * 60 * 60 * 1000, // 365 days - data is considered fresh for 365 days
        gcTime: 365 * 24 * 60 * 60 * 1000, // 365 days - cache persists for 365 days
      },
    },
  });

  const asyncStoragePersister = createAsyncStoragePersister({
    storage: AsyncStorage,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <ThemeProvider>
              <UserModeProvider>
                <LocationProvider>
                <TabBarProvider>
                  <AppContent />
                </TabBarProvider>
                </LocationProvider>
              </UserModeProvider>
            </ThemeProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;

