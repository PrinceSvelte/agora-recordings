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

  const url = `${agoraApiUrl}/${appId}/cloud_recording/resourceid/${resourceId}/mode/mix/start`;
  const authorization = `Basic ${Buffer.from(
    `${customerId}:${customerSecret}`
  ).toString("base64")}`;

  try {
    // Generate unique filename prefix with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileNamePrefix = `recordings/${channelName}/${uid}/${timestamp}`;

    const requestBody = {
      cname: channelName,
      uid: String(uid),
      clientRequest: {
        token:
          "007eJxTYPglWi3mWxLsPcFU6PuT3jv5vk3fvyYzT17+LTBSa2qhaoQCQ5JBirFhSqqphYmxpYmhcVKiZUpqqmmyQZJlapKJhUXKpLqGjIZARoZWlauMjAwQCOLzM6SkpiWW5pToJmck5uWl5jAwAACz9yOv", // Use your actual token if channel is secured
        recordingConfig: {
          maxIdleTime: 120, // Stop recording after 2 minutes of inactivity
          streamTypes: 2, // Audio and video
          audioProfile: 1, // Music quality
          channelType: 1, // Live broadcast
          videoStreamType: 0, // High stream
          transcodingConfig: {
            width: 1280, // Better resolution for Singapore region
            height: 720,
            fps: 30,
            bitrate: 2000, // Higher bitrate for better quality
            mixedVideoLayout: 1, // Floating layout
            backgroundColor: "#000000",
            defaultUserBackground: "#808080",
          },
        },
        recordingFileConfig: {
          avFileType: ["hls", "mp4"], // Generate both HLS and MP4
        },
        storageConfig: {
          vendor: 1, // AWS S3
          region: 4, // Singapore region for AWS S3
          bucket: awsS3BucketName,
          accessKey: awsAccessKeyId,
          secretKey: awsSecretAccessKey,
          fileNamePrefix: ["recordings"], // Array format for file prefix
        },
      },
    };

    console.log("Starting recording with config:", {
      url,
      channelName,
      uid,
      resourceId,
      bucket: awsS3BucketName,
      fileNamePrefix,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log(
      "Agora Start Recording Response:",
      JSON.stringify(data, null, 2)
    );

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
          error: data.message || data.reason || "Failed to start recording",
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
      fileNamePrefix,
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
