const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const getLivekitCredentials = () => {
  const apiKey = (process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();

  if (!apiKey || !apiSecret) {
    throw new Error('LiveKit credentials not configured on server (LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing)');
  }

  return { apiKey, apiSecret };
};

const getLivekitServiceUrl = () => {
  const livekitUrl = (process.env.LIVEKIT_URL || '').trim();
  if (!livekitUrl) return null;
  return livekitUrl.replace(/^wss?:\/\//i, 'https://');
};

/**
 * POST /api/livekit/token
 * Body: { roomName: string, participantName?: string }
 *
 * Returns a LiveKit JWT the frontend passes to the room SDK.
 * Requires LIVEKIT_API_KEY and LIVEKIT_API_SECRET in env.
 */
exports.getToken = async (req, res) => {
  try {
    const { apiKey, apiSecret } = getLivekitCredentials();

    const roomName = (req.body.roomName || '').trim();
    if (!roomName) {
      return res.status(400).json({ message: 'roomName is required' });
    }

    // Use the authenticated user's name as the participant identity
    const participantIdentity = req.user._id.toString();
    const participantName     = req.body.participantName || req.user.name || participantIdentity;

    const serviceUrl = getLivekitServiceUrl();
    if (serviceUrl) {
      const roomService = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
      try {
        await roomService.createRoom({ name: roomName, emptyTimeout: 600 });
      } catch (roomErr) {
        // LiveKit returns ALREADY_EXISTS when room already exists.
        const alreadyExists = String(roomErr.message || '').toUpperCase().includes('ALREADY_EXISTS');
        if (!alreadyExists) {
          throw roomErr;
        }
      }
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name:     participantName,
      ttl:      '2h',
    });

    at.addGrant({
      roomJoin:     true,
      roomCreate:   true,
      room:         roomName,
      canPublish:   true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
