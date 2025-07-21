import { NextResponse } from "next/server";
import {
  getAgoraCloudRecordingApiUrl,
  getAgoraRegionCode,
} from "@/lib/agora-utils";

export async function POST(req: Request) {
  const { channelName, uid, resourceId, sid } = await req.json();

  if (!channelName || uid === undefined || !resourceId || !sid) {
    return NextResponse.json(
      { error: "Channel name, UID, resourceId, and SID are required" },
      { status: 400 }
    );
  }

  const appId = process.env.AGORA_APP_ID;
  const customerId = process.env.AGORA_CUSTOMER_ID;
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET;
  const awsS3BucketName = process.env.AWS_S3_BUCKET_NAME;
  const awsRegion = process.env.AWS_REGION || "ap-southeast-1";

  if (!appId || !customerId || !customerSecret) {
    return NextResponse.json(
      { error: "Agora App ID, Customer ID, or Customer Secret not configured" },
      { status: 500 }
    );
  }
  if (!awsS3BucketName || !awsRegion) {
    return NextResponse.json(
      { error: "AWS S3 bucket name or region not configured" },
      { status: 500 }
    );
  }

  const agoraRegionCode = getAgoraRegionCode(awsRegion);
  const agoraApiUrl = getAgoraCloudRecordingApiUrl(agoraRegionCode);

  const url = `${agoraApiUrl}/${appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/query`;
  const authorization = `Basic ${Buffer.from(
    `${customerId}:${customerSecret}`
  ).toString("base64")}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Agora Query Recording API Error:", data);
      return NextResponse.json(
        { error: data.reason || "Failed to query recording status" },
        { status: response.status }
      );
    }

    // Check if recording is actually in progress
    if (
      data.serverResponse &&
      !["1", "2"].includes(data.serverResponse.status)
    ) {
      return NextResponse.json(
        {
          error: "Recording is not in progress",
          status: data.serverResponse.status,
        },
        { status: 400 }
      );
    }

    // Process fileList to create downloadable URLs if available
    let processedFileList = [];
    if (data.fileList && Array.isArray(data.fileList)) {
      processedFileList = data.fileList.map((file: any) => {
        // Construct S3 URL based on region and bucket
        const fileUrl = `https://${awsS3BucketName}.s3.${awsRegion}.amazonaws.com/${file.fileName}`;
        console.log(fileUrl, "file........");
        return {
          ...file,
          fileUrl,
        };
      });
    }

    return NextResponse.json({
      ...data,
      fileList: processedFileList,
      isRecording: ["1", "2"].includes(data.serverResponse?.status),
    });
  } catch (error) {
    console.error("Error querying Agora recording:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
