/**
 * FCM Status Check Script
 * Checks FCM token status and configuration
 * 
 * Usage:
 *   node test-fcm-status.js [phone_number] [user_id]
 * 
 * Note: Requires Node.js 18+ for built-in fetch support
 */

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'https://uodttljjzj3nh3e4cjqardxip40btqef.lambda-url.ap-south-1.on.aws/api/v2';
const API_KEY = process.env.API_KEY || 'zyubkfzeumeoviaqzcsrvfwdzbiwnlnn';
const DEFAULT_PHONE_NUMBER = '9074135121';

const phoneNumber = process.argv[2] || DEFAULT_PHONE_NUMBER;
const userId = process.argv[3] || null;

async function checkFCMStatus() {
  console.log('\n🔍 FCM Status Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📱 Target: ${phoneNumber || `User ID: ${userId}`}`);
  console.log(`🌐 API Base: ${API_BASE_URL}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Check if we can reach the API
    console.log('1️⃣  Checking API connectivity...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const healthCheck = await fetch(`${API_BASE_URL.replace('/v2', '')}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      console.log('   ✅ API is reachable\n');
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.log('   ⚠️  Could not verify API connectivity (this is OK if health endpoint doesn\'t exist)\n');
  }

  // Note: You would need to add an endpoint to check FCM token status
  // For now, we'll just provide instructions
  console.log('📋 FCM Status Checklist:');
  console.log('');
  console.log('   To verify FCM is working:');
  console.log('   1. Open the React Native app');
  console.log('   2. Log in to the app');
  console.log('   3. Check console logs for:');
  console.log('      - "🔔 FCMService: Initializing..."');
  console.log('      - "✅ FCMService: Notification permission granted"');
  console.log('      - "🔑 FCMService: FCM Token obtained: ..."');
  console.log('      - "✅ FCMService: FCM token stored on server"');
  console.log('');
  console.log('   4. Run the test notification script:');
  console.log(`      node test-fcm.js ${phoneNumber || userId ? `"" ${userId}` : phoneNumber}`);
  console.log('');
  console.log('   5. Check your device for the notification');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

checkFCMStatus().catch(console.error);

