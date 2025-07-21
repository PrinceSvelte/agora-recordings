import { NextResponse } from "next/server";
import {
  getAgoraCloudRecordingApiUrl,
  getAgoraRegionCode,
} from "@/lib/agora-utils";

export async function POST(req: Request) {
  const { channelName, uid } = await req.json();

  if (!channelName || uid === undefined) {
    return NextResponse.json(
      { error: "Channel name and UID are required" },
      { status: 400 }
    );
  }

  const appId = process.env.AGORA_APP_ID; // Still needed for the URL path
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  const awsRegion = process.env.AWS_REGION || "ap-southeast-1"; // Default to us-east-1

  // --- DEBUGGING LOGS START ---
  console.log("--- Agora Acquire API Debugging ---");
  console.log("AGORA_APP_ID (for URL path):", appId);
  console.log("AGORA_CUSTOMER_ID:", customerId);
  console.log(
    "AGORA_CUSTOMER_SECRET (first 5 chars):",
    customerSecret ? customerSecret.substring(0, 5) + "..." : "Not set"
  );
  console.log("AWS_REGION:", awsRegion);
  // --- DEBUGGING LOGS END ---

  if (!appId || !customerId || !customerSecret) {
    return NextResponse.json(
      {
        error:
          "Agora App ID, Customer ID, or Customer Secret not configured in environment variables.",
      },
      { status: 500 }
    );
  }

  const agoraRegionCode = getAgoraRegionCode(awsRegion);
  const agoraApiUrl = getAgoraCloudRecordingApiUrl(agoraRegionCode);

  // Corrected URL construction: agoraApiUrl already includes /v1/apps
  const url = `${agoraApiUrl}/${appId}/cloud_recording/acquire`;
  // Corrected Authorization: using Customer ID and Customer Secret
  const authorization = `Basic ${Buffer.from(
    `${customerId}:${customerSecret}`
  ).toString("base64")}`;

  // --- DEBUGGING LOGS START ---
  console.log("Constructed Agora API URL:", url);
  console.log(
    "Authorization Header Prefix:",
    authorization.substring(0, 20) + "...",
    url
  );
  console.log("--- End Debugging ---");
  // --- DEBUGGING LOGS END ---

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        cname: channelName,
        uid: String(uid),
        clientRequest: {
          scene: 0,
          resourceExpiredHour: 24,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Agora Acquire API Error Response:", data);
      return NextResponse.json(
        { error: data.message || "Failed to acquire recording resource" },
        { status: response.status }
      );
    }

    return NextResponse.json({ resourceId: data.resourceId });
  } catch (error) {
    console.error(
      "Error acquiring Agora recording resource (network/fetch issue):",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
