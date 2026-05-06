# Firebase Storage Setup for Recordings

## Prerequisites

1. Create a Firebase project at https://console.firebase.google.com/
2. Enable Firebase Storage in your project
3. Generate a service account key

## Setup Steps

### 1. Download Service Account Key
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Place it at `src/config/firebase-service-account.json`

### 2. Update Environment Variables
Update your `.env` file with your Firebase project details:

```env
FIREBASE_STORAGE_BUCKET=your-firebase-project.appspot.com
```

Replace `your-firebase-project` with your actual Firebase project ID.

### 3. Firebase Storage Rules
Make sure your Firebase Storage rules allow uploads. Example rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

For testing purposes, you can use more permissive rules, but secure them for production.

### 4. Test the Setup
Run the test script to verify Firebase connectivity:

```bash
node test-firebase.js
```

## Migration Notes

- The backend now uses Firebase Storage instead of Cloudinary
- Direct uploads from frontend work with signed URLs
- Server-side uploads from temp files are supported
- All existing API endpoints remain compatible

## Troubleshooting

- Ensure the service account has Storage Admin permissions
- Check that FIREBASE_STORAGE_BUCKET matches your Firebase project
- Verify the service account JSON file is correctly placed and formatted