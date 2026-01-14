/**
 * @format
 */

import {AppRegistry} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import {name as appName} from './app.json';

// Fallback to 'Scrapmate' if app.json name is not found
const registeredAppName = appName || 'Scrapmate';

// Register background message handler for Android
// This function must be called outside of any component lifecycle
// Wrap in try-catch to prevent crashes if Firebase isn't ready
try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('📨 Background message received:', remoteMessage);
    // Background messages are handled automatically by the system
    // You can add custom logic here if needed
  });
} catch (error) {
  console.error('❌ Error setting up background message handler:', error);
  // Continue anyway - app should still work, background messages will be handled by native code
}

// Always register the component, even if Firebase setup fails
AppRegistry.registerComponent(registeredAppName, () => App);
