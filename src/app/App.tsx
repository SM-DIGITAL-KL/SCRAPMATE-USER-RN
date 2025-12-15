import React, { useEffect, useMemo } from 'react';
import { StatusBar, Platform, NativeModules, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../components/ThemeProvider';
import { TabBarProvider } from '../context/TabBarContext';
import { UserModeProvider } from '../context/UserModeContext';
import { AppNavigator } from '../navigation/AppNavigator';
import { getStoredLanguage } from '../i18n/config';
import { queryClient, asyncStoragePersister } from '../services/api/queryClient';
import { KeyboardProvider } from '../components/KeyboardProvider';
import { networkService } from '../services/network/networkService';
import { offlineQueue } from '../services/offline/offlineQueue';
import '../i18n/config';

// Use PersistQueryClientProvider for offline-first support
let PersistQueryClientProvider: React.ComponentType<any> | null = null;

try {
  // Try direct import first
  const persistModule = require('@tanstack/react-query-persist-client');
  if (persistModule?.PersistQueryClientProvider) {
    PersistQueryClientProvider = persistModule.PersistQueryClientProvider;
    if (__DEV__) {
      console.log('✅ PersistQueryClientProvider loaded successfully');
    }
  } else {
    if (__DEV__) {
      console.warn('⚠️ PersistQueryClientProvider not found in module');
    }
  }
} catch (e: any) {
  // Persistence not available, will use regular QueryClientProvider
  if (__DEV__) {
    console.warn('⚠️ PersistQueryClientProvider not available:', e?.message || 'Unknown error');
    console.warn('   Using standard QueryClientProvider instead');
  }
}

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
        // Initialize network monitoring
        await networkService.initialize();
        
        // Initialize offline queue
        offlineQueue.initialize();
        
        // Initialize language from storage
        await getStoredLanguage();
      } catch (error) {
        console.error('Error initializing offline services:', error);
        // Continue even if initialization fails
      }
    };

    initializeOfflineServices();
  }, []);

  // KeyboardProvider is always available from our custom module
  const AppWrapper = KeyboardProvider;

  // Safety check: Ensure queryClient is available
  if (!queryClient) {
    console.error('QueryClient is not initialized!');
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          {/* Error state - should not happen */}
        </View>
      </GestureHandlerRootView>
    );
  }

  // Determine if we should use persistence - ensure both are available
  const usePersistence = Boolean(PersistQueryClientProvider && asyncStoragePersister);
  const [isCacheHydrated, setIsCacheHydrated] = React.useState(!usePersistence);

  // Debug log to verify provider is set
  if (__DEV__) {
    console.log('🔍 QueryProvider Setup:');
    console.log('  - Using:', usePersistence ? 'PersistQueryClientProvider' : 'QueryClientProvider');
    console.log('  - QueryClient available:', !!queryClient);
    console.log('  - PersistQueryClientProvider available:', !!PersistQueryClientProvider);
    console.log('  - asyncStoragePersister available:', !!asyncStoragePersister);
    console.log('  - usePersistence:', usePersistence);
    console.log('  - Cache hydrated:', isCacheHydrated);
  }

  // For now, always use QueryClientProvider to ensure context is available
  // TODO: Re-enable PersistQueryClientProvider once we confirm base works
  // The cache-first behavior still works with in-memory cache
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AppWrapper>
          <ThemeProvider>
            <UserModeProvider>
              <TabBarProvider>
                <AppContent />
              </TabBarProvider>
            </UserModeProvider>
          </ThemeProvider>
        </AppWrapper>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;

