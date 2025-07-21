import { NextResponse } from "next/server";
import {
  RtcTokenBuilder,
  RtmTokenBuilder,
  RtcRole,
  RtmRole,
} from "agora-access-token";

export async function POST(req: Request) {
  const { channelName, uid } = await req.json();

  if (!channelName || uid === undefined) {
    return NextResponse.json(
      { error: "Channel name and UID are required" },
      { status: 400 }
    );
  }

  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return NextResponse.json(
      { error: "Agora App ID or App Certificate not configured" },
      { status: 500 }
    );
  }

  const expirationTimeInSeconds = 3600; // 1 hour
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  try {
    // For RTC Token
    const rtcToken = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      Number(uid),
      RtcRole.PUBLISHER,
      privilegeExpiredTs
    );

    // For RTM Token - now requires role and privilegeExpiredTs
    const rtmToken = RtmTokenBuilder.buildToken(
      appId,
      appCertificate,
      String(uid),
      RtmRole.Rtm_User, // Added RTM role
      privilegeExpiredTs
    );

    return NextResponse.json({ rtcToken, rtmToken });
  } catch (error) {
    console.error("Error generating Agora tokens:", error);
    return NextResponse.json(
      { error: "Failed to generate Agora tokens" },
      { status: 500 }
    );
  }
}
