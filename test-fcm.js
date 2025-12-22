/**
 * FCM Push Notification Test Script
 * Tests FCM push notification functionality for the Scrapmate React Native app
 * 
 * Usage:
 *   node test-fcm.js [phone_number] [user_id]
 * 
 * Examples:
 *   node test-fcm.js 9074135121
 *   node test-fcm.js "" 123
 * 
 * Note: Requires Node.js 18+ for built-in fetch support
 */

// Configuration - Update these if needed
const API_BASE_URL = process.env.API_BASE_URL || 'https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws/api/v2';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';
const DEFAULT_PHONE_NUMBER = '9074135121';

// Get command line arguments
const phoneNumber = process.argv[2] || DEFAULT_PHONE_NUMBER;
const userId = process.argv[3] || null;

async function testFCMNotification() {
  console.log('\n🧪 FCM Push Notification Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📱 Target: ${phoneNumber || `User ID: ${userId}`}`);
  console.log(`🌐 API Endpoint: ${API_BASE_URL}/notifications/send`);
  console.log(`🔑 API Key: ${API_KEY.substring(0, 8)}...`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Build request body
  const requestBody = {
    title: '🧪 Test Notification',
    body: `This is a test push notification sent at ${new Date().toLocaleString()}`,
    data: {
      type: 'test',
      timestamp: new Date().toISOString(),
      test_id: `fcm-test-${Date.now()}`,
      source: 'test-script'
    }
  };

  // Add phone_number or user_id
  if (phoneNumber && phoneNumber.trim() !== '') {
    requestBody.phone_number = phoneNumber;
  } else if (userId) {
    requestBody.user_id = parseInt(userId);
  } else {
    console.error('❌ Error: Either phone_number or user_id must be provided');
    process.exit(1);
  }

  try {
    console.log('📤 Sending test notification...');
    console.log('📦 Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(
      `${API_BASE_URL}/notifications/send`,
      {
        method: 'POST',
        headers: {
          'api-key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    const responseData = await response.json();

    console.log('✅ Response Status:', response.status);
    console.log('📥 Response Data:', JSON.stringify(responseData, null, 2));
    console.log('');

    if (responseData.status === 'success') {
      console.log('🎉 SUCCESS: Notification sent successfully!');
      console.log(`   📨 Message ID: ${responseData.data?.messageId || 'N/A'}`);
      console.log(`   👤 User ID: ${responseData.data?.user_id || 'N/A'}`);
      console.log(`   📱 Phone: ${responseData.data?.phone_number || 'N/A'}`);
      console.log('');
      console.log('✅ Check your device for the notification!');
      console.log('   - If app is in foreground: You should see an alert');
      console.log('   - If app is in background: You should see a notification');
      console.log('   - If app is closed: You should see a notification');
    } else {
      console.log('⚠️  Response indicates an issue:');
      console.log(`   Message: ${responseData.msg || 'Unknown error'}`);
    }

  } catch (error) {
    console.error('\n❌ Error occurred:');
    
    if (error.name === 'AbortError') {
      console.error('   Request timed out after 30 seconds');
      console.error('\n💡 Tip: Make sure:');
      console.error('   - The server is running and accessible');
      console.error('   - The API_BASE_URL is correct');
      console.error('   - You have internet connection');
    } else if (error.response || (error.status && error.status >= 400)) {
      // Server responded with error status
      const status = error.status || (error.response ? error.response.status : null);
      const errorData = error.data || (error.response ? error.response.data : null);
      
      console.error(`   Status: ${status}`);
      console.error(`   Message: ${errorData?.msg || error.message}`);
      if (errorData) {
        console.error(`   Data:`, JSON.stringify(errorData, null, 2));
      }
      
      // Provide helpful error messages
      if (status === 404) {
        console.error('\n💡 Tip: User not found. Make sure:');
        console.error('   - The phone number or user_id exists in the database');
        console.error('   - The user has app_type = "customer_app"');
      } else if (status === 400) {
        const msg = errorData?.msg || '';
        if (msg.includes('FCM token')) {
          console.error('\n💡 Tip: FCM token issue. Make sure:');
          console.error('   - User has logged in to the mobile app');
          console.error('   - FCM token was stored during login');
          console.error('   - Try logging in again to refresh the token');
        }
      }
    } else {
      // Error setting up request or network error
      console.error(`   Error: ${error.message}`);
      console.error('\n💡 Tip: Make sure:');
      console.error('   - The server is running and accessible');
      console.error('   - The API_BASE_URL is correct');
      console.error('   - You have internet connection');
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 Testing Checklist:');
  console.log('   ✅ FCM token is registered (user logged in)');
  console.log('   ✅ User has app_type = "customer_app"');
  console.log('   ✅ Firebase Admin SDK is configured');
  console.log('   ✅ Device has internet connection');
  console.log('   ✅ App has notification permissions');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Run the test
testFCMNotification().catch(console.error);

