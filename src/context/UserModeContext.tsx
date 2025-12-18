import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Simplified: Only 'user' mode for common users (category U)
export type UserMode = 'user';

interface UserModeContextValue {
  mode: UserMode;
  isModeReady: boolean;
  setMode: (mode: UserMode) => Promise<void>;
}

const UserModeContext = createContext<UserModeContextValue | undefined>(
  undefined,
);

export const UserModeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Always set to 'user' mode for common users app
  const [mode, setModeState] = useState<UserMode>('user');
  const [isModeReady, setIsModeReady] = useState(false);

  useEffect(() => {
    // For common users app, always use 'user' mode
    console.log('✅ UserModeContext: Setting mode to "user" for common users app');
    setModeState('user');
    setIsModeReady(true);
  }, []);

  const setMode = useCallback(async (newMode: UserMode) => {
    // Always set to 'user' mode for common users app
    console.log('✅ UserModeContext.setMode: Setting mode to "user"');
    setModeState('user');
  }, []);

  return (
    <UserModeContext.Provider value={{ mode, isModeReady, setMode }}>
      {children}
    </UserModeContext.Provider>
  );
};

export const useUserMode = () => {
  const context = useContext(UserModeContext);
  if (!context) {
    throw new Error('useUserMode must be used within UserModeProvider');
  }
  return context;
};

