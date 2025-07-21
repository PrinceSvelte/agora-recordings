import VideoConference from "@/components/video-conference";
import NewVideoConference from "@/components/new-video-conference";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-50">
        Video Conferencing App
      </h1>
      <VideoConference />
    </div>
  );
}
