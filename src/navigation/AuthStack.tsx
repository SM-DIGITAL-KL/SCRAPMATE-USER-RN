import React, { useMemo, useCallback } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../components/ThemeProvider';
import SelectLanguageScreen from '../screens/B2C/SelectLanguageScreen';
import { LoginScreen } from '../screens/Auth/LoginScreen';
import { setAuthToken } from '../services/auth/authService';

export type AuthStackParamList = {
  SelectLanguage: undefined;
  Login: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

interface AuthStackProps {
  initialRouteName: keyof AuthStackParamList;
  onAuthComplete: () => void;
}

export const AuthStack: React.FC<AuthStackProps> = ({
  initialRouteName,
  onAuthComplete,
}) => {
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

  const handleLoginSuccess = useCallback(
    async (
      phoneNumber: string, 
      dashboardType: 'b2b' | 'b2c' | 'delivery',
      allowedDashboards?: ('b2b' | 'b2c' | 'delivery')[]
    ) => {
      // Simplified for user type 'U' - just complete auth and go to dashboard
      const { getUserData } = await import('../services/auth/authService');
      const userData = await getUserData();
      const userType = userData?.user_type;
      
      // For user type 'U', always go to dashboard
      if (userType === 'U') {
        console.log('✅ AuthStack: User type is U - routing to user dashboard');
        onAuthComplete();
        return;
      }
      
      // Fallback for other user types (shouldn't happen in this app)
      console.log('⚠️ AuthStack: Unknown user type, completing auth anyway');
      onAuthComplete();
    },
    [onAuthComplete],
  );

  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={screenOptions}
    >
      <Stack.Screen name="SelectLanguage" component={SelectLanguageScreen} />
      <Stack.Screen name="Login">
        {(props) => (
          <LoginScreen
            {...props}
            onLoginSuccess={handleLoginSuccess}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
};

