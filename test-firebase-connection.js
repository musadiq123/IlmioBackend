const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Firebase
const serviceAccount = require('./src/config/firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

async function testFirebaseConnection() {
  console.log('🔍 Testing Firebase Connection...\n');

  try {
    // Test 1: Check if Firebase app is initialized
    console.log('✅ Firebase Admin SDK initialized successfully');

    // Test 2: Check bucket configuration
    const bucket = admin.storage().bucket();
    console.log(`📦 Bucket configured: ${bucket.name}`);

    // Test 3: Try to get bucket metadata (this will fail if bucket doesn't exist)
    console.log('🔍 Checking bucket existence...');
    const [metadata] = await bucket.getMetadata();
    console.log('✅ Firebase Storage bucket exists and is accessible!');
    console.log(`📊 Bucket location: ${metadata.location}`);
    console.log(`🔒 Storage class: ${metadata.storageClass}`);

    // Test 4: Try to upload a small test file
    console.log('\n📤 Testing file upload...');
    const testFilePath = '/tmp/firebase-test.txt';
    const testContent = `Firebase test - ${new Date().toISOString()}`;
    fs.writeFileSync(testFilePath, testContent);

    const fileName = `test-connection/test-${Date.now()}.txt`;
    const file = bucket.file(fileName);

    await bucket.upload(testFilePath, {
      destination: fileName,
      metadata: {
        contentType: 'text/plain',
      },
    });

    console.log('✅ File uploaded successfully!');

    // Test 5: Generate signed URL
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 1000, // 1 minute
    });

    console.log('✅ Signed URL generated successfully!');
    console.log(`🔗 Signed URL: ${signedUrl}`);

    // Clean up
    await file.delete();
    fs.unlinkSync(testFilePath);

    console.log('✅ Test file cleaned up successfully!');
    console.log('\n🎉 All Firebase Storage tests passed! Ready for production use.');

  } catch (error) {
    console.log('\n❌ Firebase Storage Test Failed:');
    console.log('Error:', error.message);

    if (error.message.includes('bucket does not exist')) {
      console.log('\n🔧 SOLUTION: Enable Firebase Storage in Firebase Console');
      console.log('1. Go to https://console.firebase.google.com/');
      console.log('2. Select your project: educonnect-academy-7ab29');
      console.log('3. Click "Storage" in the left sidebar');
      console.log('4. Click "Get started" to enable Cloud Storage');
      console.log('5. Choose "Start in test mode" or configure security rules');
      console.log('6. Run this test again');
    } else if (error.message.includes('permission')) {
      console.log('\n🔧 SOLUTION: Check service account permissions');
      console.log('- Ensure the service account has Storage Admin role');
      console.log('- Verify the JSON key is correct');
    } else {
      console.log('\n🔧 SOLUTION: Check Firebase configuration');
      console.log('- Verify FIREBASE_STORAGE_BUCKET in .env file');
      console.log('- Check service account JSON file');
    }
  }
}

// Run test
testFirebaseConnection();