/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// Fallback to 'Scrapmate' if app.json name is not found
const registeredAppName = appName || 'Scrapmate';

AppRegistry.registerComponent(registeredAppName, () => App);
