const { AccessToken } = require('livekit-server-sdk');

/**
 * POST /api/livekit/token
 * Body: { roomName: string, participantName?: string }
 *
 * Returns a LiveKit JWT the frontend passes to the room SDK.
 * Requires LIVEKIT_API_KEY and LIVEKIT_API_SECRET in env.
 */
exports.getToken = async (req, res) => {
  try {
    const apiKey    = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({
        message: 'LiveKit credentials not configured on server (LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing)',
      });
    }

    const { roomName } = req.body;
    if (!roomName) {
      return res.status(400).json({ message: 'roomName is required' });
    }

    // Use the authenticated user's name as the participant identity
    const participantIdentity = req.user._id.toString();
    const participantName     = req.body.participantName || req.user.name || participantIdentity;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name:     participantName,
      ttl:      '2h',
    });

    at.addGrant({
      roomJoin:     true,
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
