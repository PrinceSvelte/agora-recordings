export function getAgoraRegionCode(awsRegion: string): number {
  if (awsRegion === "ap-southeast-1") {
    return 4; // Singapore (AP_SOUTHEAST_1)
  }

  console.warn(
    `Unsupported AWS region: ${awsRegion}. Defaulting to ap-southeast-1 (code 4).`
  );
  return 4; // Default to Singapore
}
export function getAgoraCloudRecordingApiUrl(agoraRegionCode: number): string {
  // Agora uses a global endpoint for Cloud Recording; no Mumbai-specific endpoint exists
  return "https://api.agora.io/v1/apps";
}
