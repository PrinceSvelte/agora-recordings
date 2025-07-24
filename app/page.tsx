"use client";

import dynamic from "next/dynamic";

const VideoConference = dynamic(() => import("@/components/video-conference"), {
  ssr: false,
});

export default function Page() {
  return <VideoConference />;
}
