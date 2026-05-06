const {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  GCPUpload,
  AzureBlobUpload,
  WebhookReceiver,
  EgressStatus,
} = require('livekit-server-sdk');
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const normalizeLivekitHost = (value) => {
  const host = String(value || '').trim();
  if (!host) return '';
  if (host.startsWith('wss://')) return host.replace('wss://', 'https://');
  if (host.startsWith('ws://')) return host.replace('ws://', 'http://');
  return host;
};

const getLivekitCredentials = () => {
  const host = normalizeLivekitHost(process.env.LIVEKIT_URL);
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();

  const missing = [];
  if (!host) missing.push('LIVEKIT_URL');
  if (!apiKey) missing.push('LIVEKIT_API_KEY');
  if (!apiSecret) missing.push('LIVEKIT_API_SECRET');

  return { host, apiKey, apiSecret, missing };
};

const getStorageProvider = () => {
  const explicitProvider = String(
    process.env.LIVEKIT_RECORDING_STORAGE_PROVIDER || process.env.RECORDING_STORAGE_PROVIDER || ''
  ).trim().toLowerCase();

  if (explicitProvider) return explicitProvider;

  if (process.env.AWS_S3_BUCKET || process.env.S3_BUCKET) return 's3';
  if (process.env.GCP_STORAGE_BUCKET || process.env.GCS_BUCKET) return 'gcp';
  if (process.env.AZURE_STORAGE_CONTAINER || process.env.AZURE_BLOB_CONTAINER) return 'azure';

  return '';
};

const getStorageConfig = () => {
  const provider = getStorageProvider();

  if (provider === 's3') {
    const accessKey = String(process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || '').trim();
    const secret = String(process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY || '').trim();
    const region = String(process.env.AWS_REGION || process.env.S3_REGION || '').trim();
    const bucket = String(process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || '').trim();
    const endpoint = String(process.env.AWS_S3_ENDPOINT || process.env.S3_ENDPOINT || '').trim();
    const forcePathStyle = String(
      process.env.AWS_S3_FORCE_PATH_STYLE || process.env.S3_FORCE_PATH_STYLE || 'false'
    ).trim().toLowerCase() === 'true';

    const missing = [];
    if (!accessKey) missing.push('AWS_ACCESS_KEY_ID (or S3_ACCESS_KEY)');
    if (!secret) missing.push('AWS_SECRET_ACCESS_KEY (or S3_SECRET_KEY)');
    if (!bucket) missing.push('AWS_S3_BUCKET (or S3_BUCKET)');

    return {
      provider,
      missing,
      upload: new S3Upload({
        accessKey,
        secret,
        region,
        bucket,
        endpoint,
        forcePathStyle,
      }),
      bucket,
      region,
      endpoint,
      accessKey,
      secret,
      forcePathStyle,
    };
  }

  if (provider === 'gcp' || provider === 'gcs') {
    const bucket = String(process.env.GCP_STORAGE_BUCKET || process.env.GCS_BUCKET || '').trim();
    const credentialsJson = String(process.env.GCP_SERVICE_ACCOUNT_JSON || '').trim();
    const credentialsBase64 = String(process.env.GCP_SERVICE_ACCOUNT_BASE64 || '').trim();

    let credentials = credentialsJson;
    if (!credentials && credentialsBase64) {
      try {
        credentials = Buffer.from(credentialsBase64, 'base64').toString('utf8');
      } catch (err) {
        credentials = '';
      }
    }

    const missing = [];
    if (!bucket) missing.push('GCP_STORAGE_BUCKET (or GCS_BUCKET)');
    if (!credentials) missing.push('GCP_SERVICE_ACCOUNT_JSON (or GCP_SERVICE_ACCOUNT_BASE64)');

    return {
      provider: 'gcp',
      missing,
      upload: new GCPUpload({ credentials, bucket }),
      bucket,
      credentials,
    };
  }

  if (provider === 'azure') {
    const accountName = String(
      process.env.AZURE_STORAGE_ACCOUNT_NAME || process.env.AZURE_ACCOUNT_NAME || ''
    ).trim();
    const accountKey = String(
      process.env.AZURE_STORAGE_ACCOUNT_KEY || process.env.AZURE_ACCOUNT_KEY || ''
    ).trim();
    const containerName = String(
      process.env.AZURE_STORAGE_CONTAINER || process.env.AZURE_BLOB_CONTAINER || ''
    ).trim();

    const missing = [];
    if (!accountName) missing.push('AZURE_STORAGE_ACCOUNT_NAME');
    if (!accountKey) missing.push('AZURE_STORAGE_ACCOUNT_KEY');
    if (!containerName) missing.push('AZURE_STORAGE_CONTAINER');

    return {
      provider,
      missing,
      upload: new AzureBlobUpload({ accountName, accountKey, containerName }),
      accountName,
      accountKey,
      containerName,
    };
  }

  return {
    provider,
    missing: ['RECORDING_STORAGE_PROVIDER (s3, gcp, azure) and provider credentials'],
    upload: null,
  };
};

const getEgressClient = () => {
  const livekit = getLivekitCredentials();
  if (livekit.missing.length > 0) {
    const err = new Error(`Missing LiveKit env vars: ${livekit.missing.join(', ')}`);
    err.code = 'LIVEKIT_NOT_CONFIGURED';
    throw err;
  }

  return {
    client: new EgressClient(livekit.host, livekit.apiKey, livekit.apiSecret),
    livekit,
  };
};

const safeFileToken = (value) => String(value || '').replace(/[^a-zA-Z0-9._/-]+/g, '-');

const createFilePath = ({ classCode, classObjectId, fileNamePrefix }) => {
  const prefix = safeFileToken(fileNamePrefix || process.env.LIVEKIT_RECORDING_FILE_PREFIX || 'recordings');
  const now = new Date();
  const datePath = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const classKey = safeFileToken(classCode || classObjectId || 'class');
  return `${prefix}/${classKey}/${datePath}/${stamp}.mp4`;
};

const buildEncodedFileOutput = ({ filePath, storageConfig }) => {
  if (!storageConfig || storageConfig.missing.length > 0 || !storageConfig.upload) {
    const missing = storageConfig ? storageConfig.missing : ['recording storage provider config'];
    const err = new Error(`Recording storage is not configured. Missing: ${missing.join(', ')}`);
    err.code = 'RECORDING_STORAGE_NOT_CONFIGURED';
    throw err;
  }

  let outputCase = 's3';
  if (storageConfig.provider === 'gcp') outputCase = 'gcp';
  if (storageConfig.provider === 'azure') outputCase = 'azure';

  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: filePath,
    output: {
      case: outputCase,
      value: storageConfig.upload,
    },
  });
};

const egressStatusToRecordingStatus = (status) => {
  if (status === EgressStatus.EGRESS_STARTING) return 'starting';
  if (status === EgressStatus.EGRESS_ACTIVE) return 'recording';
  if (status === EgressStatus.EGRESS_ENDING) return 'processing';
  if (status === EgressStatus.EGRESS_COMPLETE) return 'completed';
  return 'failed';
};

const parseBigIntLike = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cast = Number(value);
  return Number.isFinite(cast) ? cast : 0;
};

const getPrimaryFileResult = (egressInfo) => {
  if (!egressInfo) return null;
  if (Array.isArray(egressInfo.fileResults) && egressInfo.fileResults.length > 0) {
    return egressInfo.fileResults[0];
  }
  if (egressInfo.result && egressInfo.result.case === 'file' && egressInfo.result.value) {
    return egressInfo.result.value;
  }
  return null;
};

const inferFormat = (filename, fallback = 'mp4') => {
  const value = String(filename || '').trim();
  if (!value.includes('.')) return fallback;
  return value.split('.').pop().toLowerCase() || fallback;
};

const convertStorageLocationToPublicUrl = (location, provider, storageConfig) => {
  const value = String(location || '').trim();
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;

  if (provider === 's3' && value.startsWith('s3://')) {
    const withoutScheme = value.slice('s3://'.length);
    const [bucket, ...rest] = withoutScheme.split('/');
    const key = rest.join('/');
    const endpoint = String(storageConfig.endpoint || '').trim();
    if (endpoint) {
      const endpointHost = endpoint.replace(/\/+$/, '');
      if (storageConfig.forcePathStyle) return `${endpointHost}/${bucket}/${key}`;
      const protocol = endpointHost.startsWith('http') ? '' : 'https://';
      const host = endpointHost.replace(/^https?:\/\//, '');
      return `${protocol}${bucket}.${host}/${key}`;
    }

    const region = String(storageConfig.region || '').trim();
    if (region) return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }

  if (provider === 'gcp' && value.startsWith('gs://')) {
    const withoutScheme = value.slice('gs://'.length);
    return `https://storage.googleapis.com/${withoutScheme}`;
  }

  return value;
};

const parseS3Location = (location, fallbackBucket) => {
  const value = String(location || '').trim();
  if (!value) return null;

  if (value.startsWith('s3://')) {
    const withoutScheme = value.slice('s3://'.length);
    const [bucket, ...rest] = withoutScheme.split('/');
    return { bucket, key: rest.join('/') };
  }

  try {
    const parsed = new URL(value);
    const hostParts = parsed.hostname.split('.');
    if (hostParts.length >= 4 && hostParts[1] === 's3') {
      const bucket = hostParts[0];
      const key = parsed.pathname.replace(/^\//, '');
      return { bucket, key };
    }

    if (fallbackBucket) {
      return {
        bucket: fallbackBucket,
        key: parsed.pathname.replace(/^\//, ''),
      };
    }
  } catch (err) {
    return null;
  }

  return null;
};

const buildSignedS3PlaybackUrl = async ({ location, storageConfig, ttlSeconds }) => {
  const parsed = parseS3Location(location, storageConfig.bucket);
  if (!parsed || !parsed.bucket || !parsed.key) return '';

  const client = new S3Client({
    region: storageConfig.region || undefined,
    endpoint: storageConfig.endpoint || undefined,
    forcePathStyle: Boolean(storageConfig.forcePathStyle),
    credentials: {
      accessKeyId: storageConfig.accessKey,
      secretAccessKey: storageConfig.secret,
    },
  });

  const command = new GetObjectCommand({
    Bucket: parsed.bucket,
    Key: parsed.key,
  });

  return getSignedUrl(client, command, { expiresIn: ttlSeconds });
};

const deleteS3Object = async ({ location, storageConfig }) => {
  const parsed = parseS3Location(location, storageConfig.bucket);
  if (!parsed || !parsed.bucket || !parsed.key) return false;

  const client = new S3Client({
    region: storageConfig.region || undefined,
    endpoint: storageConfig.endpoint || undefined,
    forcePathStyle: Boolean(storageConfig.forcePathStyle),
    credentials: {
      accessKeyId: storageConfig.accessKey,
      secretAccessKey: storageConfig.secret,
    },
  });

  await client.send(new DeleteObjectCommand({
    Bucket: parsed.bucket,
    Key: parsed.key,
  }));

  return true;
};

const getPlaybackStrategy = () => {
  const value = String(process.env.RECORDING_PLAYBACK_STRATEGY || 'public').trim().toLowerCase();
  return value === 'private' ? 'private' : 'public';
};

const getPlaybackUrl = async (recording) => {
  const strategy = getPlaybackStrategy();
  if (strategy !== 'private') {
    return {
      url: recording.playbackUrl || recording.secureUrl || recording.url || recording.playUrl || '',
      signed: false,
    };
  }

  if (recording.provider === 's3') {
    const storageConfig = getStorageConfig();
    const ttlSeconds = Number(process.env.RECORDING_PLAYBACK_URL_TTL_SECONDS || 600);
    const signedUrl = await buildSignedS3PlaybackUrl({
      location: recording.outputUrl || recording.playbackUrl || recording.url,
      storageConfig,
      ttlSeconds: Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : 600,
    });

    if (signedUrl) {
      return { url: signedUrl, signed: true };
    }
  }

  return {
    url: recording.playbackUrl || recording.secureUrl || recording.url || recording.playUrl || '',
    signed: false,
  };
};

const createWebhookReceiver = () => {
  const apiKey = String(process.env.LIVEKIT_WEBHOOK_API_KEY || process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_WEBHOOK_API_SECRET || process.env.LIVEKIT_API_SECRET || '').trim();

  if (!apiKey || !apiSecret) {
    const err = new Error('Missing webhook verification env vars: LIVEKIT_WEBHOOK_API_KEY/LIVEKIT_WEBHOOK_API_SECRET or LIVEKIT_API_KEY/LIVEKIT_API_SECRET');
    err.code = 'LIVEKIT_WEBHOOK_NOT_CONFIGURED';
    throw err;
  }

  return new WebhookReceiver(apiKey, apiSecret);
};

module.exports = {
  getLivekitCredentials,
  getStorageConfig,
  getEgressClient,
  createFilePath,
  buildEncodedFileOutput,
  egressStatusToRecordingStatus,
  parseBigIntLike,
  getPrimaryFileResult,
  inferFormat,
  convertStorageLocationToPublicUrl,
  getPlaybackUrl,
  createWebhookReceiver,
  deleteS3Object,
};