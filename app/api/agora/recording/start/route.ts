import { NextResponse } from "next/server";
import {
  getAgoraCloudRecordingApiUrl,
  getAgoraRegionCode,
} from "@/lib/agora-utils";

export async function POST(req: Request) {
  const { channelName, uid, resourceId } = await req.json();

  if (!channelName || uid === undefined || !resourceId) {
    return NextResponse.json(
      { error: "Channel name, UID, and resourceId are required" },
      { status: 400 }
    );
  }

  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const awsRegion = process.env.AWS_REGION || "ap-southeast-1";
  const awsS3BucketName = process.env.AWS_S3_BUCKET_NAME;

  if (!appId || !customerId || !customerSecret) {
    return NextResponse.json(
      { error: "Agora App ID, Customer ID, or Customer Secret not configured" },
      { status: 500 }
    );
  }
  if (
    !awsAccessKeyId ||
    !awsSecretAccessKey ||
    !awsRegion ||
    !awsS3BucketName
  ) {
    return NextResponse.json(
      { error: "AWS S3 credentials or bucket name not configured" },
      { status: 500 }
    );
  }

  const agoraRegionCode = getAgoraRegionCode(awsRegion);
  const agoraApiUrl = getAgoraCloudRecordingApiUrl(agoraRegionCode);

  // ✅ MODE IS WEB NOW
  const url = `${agoraApiUrl}/${appId}/cloud_recording/resourceid/${resourceId}/mode/web/start`;
  const authorization = `Basic ${Buffer.from(
    `${customerId}:${customerSecret}`
  ).toString("base64")}`;

  try {
    const fileNamePrefix = ["recordings", channelName, String(uid)];

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
          token: "", // Leave empty for testing if channel is not secured
          recordingConfig: {
            channelType: 1,
            streamTypes: 2,
            streamMode: "default", // ✅ NOT "web"
            videoStreamType: 0,
            maxIdleTime: 30,
            subscribeUidGroup: 0,
            transcodingConfig: {
              width: 360,
              height: 640,
              fps: 15,
              bitrate: 500,
              maxResolutionUid: String(uid),
              mixedVideoLayout: 0,
              backgroundColor: "#000000",
            },
          },
          recordingFileConfig: {
            avFileType: ["hls"],
          },
          storageConfig: {
            vendor: 1,
            region: agoraRegionCode,
            bucket: awsS3BucketName,
            accessKey: awsAccessKeyId,
            secretKey: awsSecretAccessKey,
            fileNamePrefix: ["recordings"],
          },
        },
      }),
    });

    const data = await response.json();
    console.log("Start response body:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error("Agora Start Recording API Error:", {
        status: response.status,
        error: data,
        request: {
          url,
          channelName,
          uid,
          resourceId,
        },
      });
      return NextResponse.json(
        {
          error: data.message || "Failed to start recording",
          details: data,
        },
        { status: response.status }
      );
    }

    if (!data.sid) {
      throw new Error("No recording SID returned from Agora API");
    }

    return NextResponse.json({
      sid: data.sid,
      resourceId,
      serverResponse: data,
    });
  } catch (error) {
    console.error("Error starting Agora recording:", {
      error,
      channelName,
      uid,
      resourceId,
    });
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
