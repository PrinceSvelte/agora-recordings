"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import AgoraRTC from "agora-rtc-sdk-ng";
import AgoraRTM from "agora-rtm-sdk"; // Version 1.5.1
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Users,
  CircleDot,
  StopCircle,
  Download,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

interface RemoteUser {
  uid: string;
  audioTrack?: any;
  videoTrack?: any;
}

export default function VideoConference() {
  const [appId, setAppId] = useState<string>("");
  const [channelName, setChannelName] = useState<string>("default-channel");
  const [uid, setUid] = useState<string>(
    String(Math.floor(Math.random() * 100000))
  );
  const [joined, setJoined] = useState<boolean>(false);
  const [localAudioTrack, setLocalAudioTrack] = useState<any>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<any>(null);
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [participantCount, setParticipantCount] = useState<number>(0);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isVideoOff, setIsVideoOff] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingResourceId, setRecordingResourceId] = useState<string | null>(
    null
  );
  const [recordingSid, setRecordingSid] = useState<string | null>(null);
  const [recordedFiles, setRecordedFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteVideoRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const [rtmClient, setRtmClient] = useState<any>(null);

  useEffect(() => {
    const fetchAppId = async () => {
      try {
        const res = await fetch("/api/agora/app-id");
        const data = await res.json();
        if (data.appId) {
          setAppId(data.appId);
          const client = AgoraRTM.createInstance(data.appId);
          setRtmClient(client);
        } else {
          throw new Error("No App ID received from server");
        }
      } catch (error) {
        console.error("Error fetching App ID:", error);
        alert(
          "Failed to initialize video call. Please check server configuration."
        );
      }
    };
    fetchAppId();
  }, []);

  const handleUserPublished = useCallback(
    async (user: any, mediaType: "audio" | "video") => {
      await rtcClient.subscribe(user, mediaType);
      if (mediaType === "video" && remoteVideoRefs.current[user.uid]) {
        user.videoTrack.play(remoteVideoRefs.current[user.uid]);
      }
      if (mediaType === "audio") {
        user.audioTrack.play();
      }
      setRemoteUsers([...rtcClient.remoteUsers]);
      setParticipantCount(rtcClient.remoteUsers.length + 1);
    },
    []
  );

  const handleUserUnpublished = useCallback(() => {
    setRemoteUsers([...rtcClient.remoteUsers]);
    setParticipantCount(rtcClient.remoteUsers.length + 1);
  }, []);

  const handleUserJoined = useCallback(() => {
    setParticipantCount(rtcClient.remoteUsers.length + 1);
  }, []);

  const handleUserLeft = useCallback(() => {
    setRemoteUsers([...rtcClient.remoteUsers]);
    setParticipantCount(rtcClient.remoteUsers.length + 1);
  }, []);

  useEffect(() => {
    rtcClient.on("user-published", handleUserPublished);
    rtcClient.on("user-unpublished", handleUserUnpublished);
    rtcClient.on("user-joined", handleUserJoined);
    rtcClient.on("user-left", handleUserLeft);

    return () => {
      rtcClient.off("user-published", handleUserPublished);
      rtcClient.off("user-unpublished", handleUserUnpublished);
      rtcClient.off("user-joined", handleUserJoined);
      rtcClient.off("user-left", handleUserLeft);
    };
  }, [
    handleUserPublished,
    handleUserUnpublished,
    handleUserJoined,
    handleUserLeft,
  ]);

  const joinChannel = useCallback(async () => {
    if (!appId || !channelName || !uid) {
      alert("Please provide App ID, Channel Name, and User ID.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/agora/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelName, uid }),
      });
      const data = await response.json();
      if (!data.rtcToken || !data.rtmToken) {
        throw new Error("Failed to get Agora tokens.");
      }

      await rtcClient.join(appId, channelName, data.rtcToken, Number(uid));

      const [audioTrack, videoTrack] = await Promise.all([
        AgoraRTC.createMicrophoneAudioTrack(),
        AgoraRTC.createCameraVideoTrack(),
      ]);

      setLocalAudioTrack(audioTrack);
      setLocalVideoTrack(videoTrack);
      if (localVideoRef.current) {
        videoTrack.play(localVideoRef.current);
      }

      await rtcClient.publish([audioTrack, videoTrack]);

      if (rtmClient) {
        try {
          await rtmClient.login({ uid: String(uid), token: data.rtmToken });
          const channel = rtmClient.createChannel(channelName);
          await channel.join();
          console.log("RTM channel joined successfully:", channelName);
        } catch (rtmError) {
          console.warn(
            "RTM connection failed (proceeding without RTM):",
            rtmError
          );
        }
      }

      setJoined(true);
      setParticipantCount(rtcClient.remoteUsers.length + 1);
    } catch (error) {
      console.error("Join failed:", error);
      alert("Failed to join channel. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [appId, channelName, uid, rtmClient]);

  const leaveChannel = useCallback(async () => {
    setLoading(true);
    try {
      if (localAudioTrack) {
        localAudioTrack.close();
        setLocalAudioTrack(null);
      }
      if (localVideoTrack) {
        localVideoTrack.close();
        setLocalVideoTrack(null);
      }
      setRemoteUsers([]);
      await rtcClient.leave();
      setJoined(false);
      setParticipantCount(0);

      if (rtmClient) {
        try {
          await rtmClient.logout();
          console.log("RTM logout successful");
        } catch (rtmError) {
          console.warn("Error during RTM logout:", rtmError);
        }
      }
    } catch (error) {
      console.error("Failed to leave channel:", error);
      alert("Failed to leave channel. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [localAudioTrack, localVideoTrack, rtmClient]);

  const toggleMic = useCallback(() => {
    if (localAudioTrack) {
      localAudioTrack.setEnabled(!isMicMuted);
      setIsMicMuted(!isMicMuted);
    }
  }, [localAudioTrack, isMicMuted]);

  const toggleVideo = useCallback(() => {
    if (localVideoTrack) {
      localVideoTrack.setEnabled(!isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  }, [localVideoTrack, isVideoOff]);

  const startRecording = useCallback(async () => {
    if (!joined) {
      alert("Please join the channel first to start recording.");
      return;
    }
    setLoading(true);
    try {
      const acquireRes = await fetch("/api/agora/recording/acquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelName, uid: Number(uid) }),
      });
      const acquireData = await acquireRes.json();
      if (!acquireData.resourceId) {
        throw new Error(
          "Failed to acquire recording resource: " + JSON.stringify(acquireData)
        );
      }
      setRecordingResourceId(acquireData.resourceId);

      const startRes = await fetch("/api/agora/recording/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelName,
          uid: Number(uid),
          resourceId: acquireData.resourceId,
          region: "ap-south-1",
        }),
      });
      const startData = await startRes.json();
      if (!startData.sid) {
        throw new Error(
          "Failed to start recording: " + JSON.stringify(startData)
        );
      }
      setRecordingSid(startData.sid);
      setIsRecording(true);
      console.log("Recording started:", {
        resourceId: acquireData.resourceId,
        sid: startData.sid,
        channelName,
        uid,
        timestamp: new Date().toISOString(),
      });
      alert("Recording started in Mumbai region!");
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Failed to start recording. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [channelName, uid, joined]);

  const stopRecording = useCallback(async () => {
    if (!isRecording || !recordingResourceId || !recordingSid) {
      alert("No active recording to stop.");
      return;
    }
    setLoading(true);
    try {
      console.log("Attempting to stop recording:", {
        resourceId: recordingResourceId,
        sid: recordingSid,
        channelName,
        uid,
        timestamp: new Date().toISOString(),
      });
      // Add a 5-second delay to ensure worker is initialized
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const stopRes = await fetch("/api/agora/recording/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelName,
          uid: Number(uid),
          resourceId: recordingResourceId,
          sid: recordingSid,
        }),
      });
      const stopData = await stopRes.json();
      if (stopData.error) {
        throw new Error("Stop recording failed: " + JSON.stringify(stopData));
      }

      const queryRes = await fetch("/api/agora/recording/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelName,
          uid: Number(uid),
          resourceId: recordingResourceId,
          sid: recordingSid,
        }),
      });
      const queryData = await queryRes.json();
      if (queryData.fileList) {
        setRecordedFiles(queryData.fileList);
      } else {
        console.warn("No fileList in query response:", queryData);
      }

      setIsRecording(false);
      setRecordingResourceId(null);
      setRecordingSid(null);
      alert("Recording stopped and saved to S3 in ap-south-1!");
    } catch (error) {
      console.error("Error stopping recording:", error);
      alert("Failed to stop recording. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [isRecording, recordingResourceId, recordingSid, channelName, uid]);

  return (
    <Card className="w-full max-w-4xl shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-2xl font-bold">Video Call</CardTitle>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          <span>Participants: {participantCount}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <Input
            placeholder="Channel Name"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            disabled={joined || loading}
            className="flex-1"
          />
          <Input
            placeholder="Your User ID (optional)"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            disabled={joined || loading}
            className="flex-1"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[300px] md:min-h-[400px]">
          <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
            <div ref={localVideoRef} className="w-full h-full bg-black">
              {!localVideoTrack && (
                <div className="absolute inset-0 flex items-center justify-center text-white text-lg">
                  Local Video
                </div>
              )}
            </div>
            <div className="absolute bottom-2 left-2 text-white text-sm bg-black/50 px-2 py-1 rounded">
              You ({uid})
            </div>
          </div>

          {remoteUsers.length > 0 ? (
            remoteUsers.map((user) => (
              <div
                key={user.uid}
                className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video"
              >
                <div
                  ref={(el) => (remoteVideoRefs.current[user.uid] = el)}
                  className="w-full h-full bg-black"
                >
                  {!user.videoTrack && (
                    <div className="absolute inset-0 flex items-center justify-center text-white text-lg">
                      User {user.uid}
                    </div>
                  )}
                </div>
                <div className="absolute bottom-2 left-2 text-white text-sm bg-black/50 px-2 py-1 rounded">
                  User {user.uid}
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-lg text-gray-500 dark:text-gray-400 text-lg">
              No remote participants
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-4 mt-6">
          {!joined ? (
            <Button onClick={joinChannel} disabled={loading || !appId}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Join Call
            </Button>
          ) : (
            <>
              <Button
                onClick={leaveChannel}
                variant="destructive"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PhoneOff className="mr-2 h-4 w-4" />
                )}
                Leave Call
              </Button>
              <Button onClick={toggleMic} variant="outline" disabled={loading}>
                {isMicMuted ? (
                  <MicOff className="mr-2 h-4 w-4" />
                ) : (
                  <Mic className="mr-2 h-4 w-4" />
                )}
                {isMicMuted ? "Unmute Mic" : "Mute Mic"}
              </Button>
              <Button
                onClick={toggleVideo}
                variant="outline"
                disabled={loading}
              >
                {isVideoOff ? (
                  <VideoOff className="mr-2 h-4 w-4" />
                ) : (
                  <Video className="mr-2 h-4 w-4" />
                )}
                {isVideoOff ? "Turn Video On" : "Turn Video Off"}
              </Button>
              <Button
                onClick={isRecording ? stopRecording : startRecording}
                variant={isRecording ? "destructive" : "default"}
                disabled={loading}
                className={cn(isRecording && "animate-pulse")}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isRecording ? (
                  <StopCircle className="mr-2 h-4 w-4" />
                ) : (
                  <CircleDot className="mr-2 h-4 w-4" />
                )}
                {isRecording ? "Stop Recording" : "Start Recording"}
              </Button>
            </>
          )}
        </div>

        {recordedFiles.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4">Recorded Sessions</h3>
            <div className="grid gap-4">
              {recordedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 border rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <span className="text-sm font-medium truncate">
                    {file.fileName || `Recording ${index + 1}`}
                  </span>
                  <a
                    href={file.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
