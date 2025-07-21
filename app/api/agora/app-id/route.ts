import { NextResponse } from "next/server"

export async function GET() {
  const appId = process.env.AGORA_APP_ID
  if (!appId) {
    return NextResponse.json({ error: "AGORA_APP_ID is not set" }, { status: 500 })
  }
  return NextResponse.json({ appId })
}
