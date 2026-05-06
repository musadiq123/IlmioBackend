const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Firebase (this would normally be done in server.js)
const serviceAccount = require('./src/config/firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

async function testFirebaseUpload() {
  try {
    // Create a dummy MP4 file for testing
    const testFilePath = '/tmp/test-recording.mp4';
    const testContent = 'dummy mp4 content'; // In real scenario, this would be actual video data
    fs.writeFileSync(testFilePath, testContent);

    const bucket = admin.storage().bucket();
    const fileName = `test-recordings/test-${Date.now()}.mp4`;
    const file = bucket.file(fileName);

    console.log('Uploading test file to Firebase Storage...');

    // Upload file
    await bucket.upload(testFilePath, {
      destination: fileName,
      metadata: {
        contentType: 'video/mp4',
      },
    });

    console.log('Upload successful!');

    // Get signed URL
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    console.log('Signed URL:', signedUrl);

    // Clean up
    fs.unlinkSync(testFilePath);

    // Optional: Delete from Firebase after test
    // await file.delete();

    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run test if this script is executed directly
if (require.main === module) {
  testFirebaseUpload();
}

module.exports = { testFirebaseUpload };