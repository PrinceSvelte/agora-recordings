import { NextResponse } from "next/server";
import { getAgoraCloudRecordingApiUrl } from "@/lib/agora-utils";

export async function POST(req: Request) {
  const { channelName, uid, resourceId, sid } = await req.json();

  // Validate input
  if (!channelName || uid === undefined || !resourceId || !sid) {
    return NextResponse.json(
      { error: "Channel name, UID, resourceId, and SID are required" },
      { status: 400 }
    );
  }

  // Get environment variables
  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;

  if (!appId || !customerId || !customerSecret) {
    return NextResponse.json(
      { error: "Agora credentials not configured" },
      { status: 500 }
    );
  }

  const agoraApiUrl = getAgoraCloudRecordingApiUrl(6);
  const queryUrl = `${agoraApiUrl}/${appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/query`;
  const stopUrl = `${agoraApiUrl}/${appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`;

  const authorization = `Basic ${Buffer.from(
    `${customerId}:${customerSecret}`
  ).toString("base64")}`;

  try {
    // Retry query with delay to handle worker initialization
    let queryData: any = null;
    let queryAttempts = 0;
    const maxAttempts = 3;
    const retryDelay = 2000; // 2 seconds

    while (queryAttempts < maxAttempts) {
      const queryResponse = await fetch(queryUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
        },
      });

      queryData = await queryResponse.json();

      if (queryResponse.ok) {
        console.log("Recording status:", queryData);
        break;
      }

      console.warn(`Query attempt ${queryAttempts + 1} failed:`, queryData);
      queryAttempts++;
      if (queryAttempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    if (queryData.code !== 0 || !queryData.serverResponse) {
      console.error("Agora Query Recording API Error:", queryData);
      return NextResponse.json(
        {
          error: queryData?.reason || "Recording session not found",
          details: queryData,
        },
        { status: 404 }
      );
    }

    // Stop recording
    const stopResponse = await fetch(stopUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify({
        cname: channelName,
        uid: String(uid),
        clientRequest: {
          async_stop: false,
        },
      }),
    });

    const stopData = await stopResponse.json();

    if (!stopResponse.ok) {
      console.error("Agora Stop Recording API Error:", stopData);
      return NextResponse.json(
        {
          error: stopData.reason || "Failed to stop recording",
          details: stopData,
        },
        { status: stopResponse.status }
      );
    }

    return NextResponse.json({
      code: stopData.code,
      fileList: queryData.fileList || [],
    });
  } catch (error) {
    console.error("Error in Agora recording stop process:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
