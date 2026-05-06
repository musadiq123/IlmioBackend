const admin = require('firebase-admin');
require('dotenv').config();

// Initialize Firebase
const serviceAccount = require('./src/config/firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

async function checkFirebaseStorageStatus() {
  console.log('🔍 Checking Firebase Storage Status...\n');

  try {
    const bucket = admin.storage().bucket();
    console.log(`📦 Target Bucket: ${bucket.name}`);

    // Try to get bucket metadata - this will fail if bucket doesn't exist
    console.log('🔍 Checking if bucket exists...');
    const [metadata] = await bucket.getMetadata();

    console.log('✅ SUCCESS: Firebase Storage is ENABLED and ACCESSIBLE!');
    console.log(`📍 Location: ${metadata.location}`);
    console.log(`🔒 Storage Class: ${metadata.storageClass}`);
    console.log(`📅 Created: ${metadata.timeCreated}`);
    console.log('\n🎉 Your Firebase Storage is ready for use!');
    console.log('You can now upload recordings to Firebase Storage.');

  } catch (error) {
    console.log('\n❌ Firebase Storage is NOT ENABLED');

    if (error.code === 404 || error.message.includes('does not exist')) {
      console.log('\n📋 ACTION REQUIRED:');
      console.log('1. Go to https://console.firebase.google.com/');
      console.log('2. Select project: educonnect-academy-7ab29');
      console.log('3. Click "Storage" in the left sidebar');
      console.log('4. Click "Get started" to enable Cloud Storage');
      console.log('5. Choose "Start in test mode" (recommended)');
      console.log('6. Run this check again');
    } else {
      console.log('\n⚠️  Unexpected error:', error.message);
      console.log('This might be a permissions issue. Check your service account.');
    }
  }
}

checkFirebaseStorageStatus();