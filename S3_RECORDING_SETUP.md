S3 Recording Setup

Backend env values to add in .env:

RECORDING_STORAGE_PROVIDER=s3
AWS_ACCESS_KEY_ID=YOUR_IAM_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_IAM_SECRET_KEY
AWS_S3_BUCKET=YOUR_BUCKET_NAME
AWS_REGION=YOUR_BUCKET_REGION
RECORDING_PLAYBACK_STRATEGY=private
RECORDING_PLAYBACK_URL_TTL_SECONDS=600
LIVEKIT_WEBHOOK_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_WEBHOOK_API_SECRET=YOUR_LIVEKIT_API_SECRET

What to create in AWS:

1. Create one private S3 bucket.
2. Turn off public access for the bucket.
3. Create one IAM user for backend access.
4. Generate an access key for that IAM user.
5. Give the IAM user bucket permissions for:
   - s3:PutObject
   - s3:GetObject
   - s3:DeleteObject
   - s3:ListBucket
6. If you want lower cost later, add a lifecycle rule to archive or delete old recordings.

Suggested bucket policy approach:

- Keep the bucket private.
- Do not enable public read.
- Let the backend generate signed playback URLs.

LiveKit webhook setup:

1. In LiveKit Cloud, set webhook URL to:
   https://YOUR_DOMAIN/api/recordings/livekit/webhook
2. Use the same LiveKit API key/secret for webhook verification unless you want separate values.

Notes:

- For local testing, use a public tunnel URL such as ngrok or Cloudflare Tunnel.
- The backend already supports S3 start, stop, finalize, play, and delete flow once these env values are set.