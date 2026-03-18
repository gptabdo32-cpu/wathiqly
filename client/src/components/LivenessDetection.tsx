/**
 * Interactive Liveness Detection Component
 * Real-time face movement detection using MediaPipe Face Mesh
 * Supports eye blink, smile, head movement detection
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Loader2, Video } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Challenge {
  type: string;
  description: string;
  completed: boolean;
  confidence: number;
}

interface LivenessDetectionProps {
  sessionId: string;
  challenges: string[];
  onComplete: (result: any) => void;
  onError: (error: string) => void;
}

export const LivenessDetection: React.FC<LivenessDetectionProps> = ({
  sessionId,
  challenges,
  onComplete,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [isInitializing, setIsInitializing] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [detectedChallenges, setDetectedChallenges] = useState<Challenge[]>([]);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(
    null
  );
  const [stats, setStats] = useState({
    eyeBlinkCount: 0,
    smileDetected: false,
    headTurns: 0,
  });

  const submitVideoMutation = trpc.liveness.submitVideo.useMutation();

  // Initialize MediaPipe Face Landmarker
  useEffect(() => {
    const initializeMediaPipe = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const landmarker = await FaceLandmarker.createFromOptions(
          filesetResolver,
          {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite",
            },
            runningMode: "VIDEO",
            numFaces: 1,
          }
        );

        setFaceLandmarker(landmarker);
        setIsInitializing(false);
      } catch (error) {
        console.error("Failed to initialize MediaPipe:", error);
        onError("Failed to initialize face detection");
      }
    };

    initializeMediaPipe();
  }, [onError]);

  // Start camera and recording
  const startDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Setup MediaRecorder
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: "video/webm;codecs=vp9",
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);

        // Initialize challenges
        const initialChallenges: Challenge[] = challenges.map((c) => ({
          type: c,
          description: getChallengeDescription(c),
          completed: false,
          confidence: 0,
        }));
        setDetectedChallenges(initialChallenges);

        // Start detection loop
        detectFaceMovements();
      }
    } catch (error) {
      console.error("Failed to start camera:", error);
      onError("Failed to access camera");
    }
  }, [challenges, faceLandmarker]);

  // Detect face movements and landmarks
  const detectFaceMovements = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !faceLandmarker) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const detectFrame = async () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          const results = faceLandmarker.detectForVideo(video, Date.now());

          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const landmarks = results.faceLandmarks[0];

            // Draw landmarks on canvas
            drawLandmarks(ctx, canvas, landmarks);

            // Analyze movements
            analyzeMovements(landmarks);
          }
        } catch (error) {
          console.error("Detection error:", error);
        }
      }

      if (isRecording) {
        requestAnimationFrame(detectFrame);
      }
    };

    detectFrame();
  }, [faceLandmarker, isRecording]);

  // Draw face landmarks on canvas
  const drawLandmarks = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    landmarks: any[]
  ) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0, 255, 0, 0.5)";

    landmarks.forEach((landmark) => {
      const x = landmark.x * canvas.width;
      const y = landmark.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  // Analyze face movements
  const analyzeMovements = (landmarks: any[]) => {
    // Calculate Eye Aspect Ratio (EAR) for blink detection
    const leftEye = landmarks.slice(33, 42);
    const rightEye = landmarks.slice(362, 371);

    const leftEAR = calculateEAR(leftEye);
    const rightEAR = calculateEAR(rightEye);

    // Detect blink
    if (leftEAR < 0.2 && rightEAR < 0.2) {
      setStats((prev) => ({
        ...prev,
        eyeBlinkCount: prev.eyeBlinkCount + 1,
      }));
    }

    // Detect smile
    const mouth = landmarks.slice(61, 68);
    const smileIntensity = calculateSmileIntensity(mouth);
    if (smileIntensity > 0.5) {
      setStats((prev) => ({
        ...prev,
        smileDetected: true,
      }));
    }

    // Detect head movement
    const noseTip = landmarks[1];
    const leftEar = landmarks[234];
    const rightEar = landmarks[454];

    const headTurn = calculateHeadTurn(noseTip, leftEar, rightEar);
    if (Math.abs(headTurn) > 15) {
      setStats((prev) => ({
        ...prev,
        headTurns: prev.headTurns + 1,
      }));
    }
  };

  // Calculate Eye Aspect Ratio
  const calculateEAR = (eyeLandmarks: any[]): number => {
    const distance = (p1: any, p2: any) =>
      Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    const vertical1 = distance(eyeLandmarks[1], eyeLandmarks[5]);
    const vertical2 = distance(eyeLandmarks[2], eyeLandmarks[4]);
    const horizontal = distance(eyeLandmarks[0], eyeLandmarks[3]);

    return (vertical1 + vertical2) / (2 * horizontal);
  };

  // Calculate smile intensity
  const calculateSmileIntensity = (mouthLandmarks: any[]): number => {
    const distance = (p1: any, p2: any) =>
      Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    const mouthWidth = distance(mouthLandmarks[0], mouthLandmarks[6]);
    const mouthHeight = distance(mouthLandmarks[2], mouthLandmarks[4]);

    return mouthHeight / mouthWidth;
  };

  // Calculate head turn angle
  const calculateHeadTurn = (nose: any, leftEar: any, rightEar: any): number => {
    const leftDist = Math.sqrt(
      Math.pow(nose.x - leftEar.x, 2) + Math.pow(nose.y - leftEar.y, 2)
    );
    const rightDist = Math.sqrt(
      Math.pow(nose.x - rightEar.x, 2) + Math.pow(nose.y - rightEar.y, 2)
    );

    return ((rightDist - leftDist) / (rightDist + leftDist)) * 90;
  };

  // Get challenge description
  const getChallengeDescription = (challenge: string): string => {
    const descriptions: Record<string, string> = {
      eye_blink: "رمش عينيك 3 مرات",
      smile: "ابتسم بشكل طبيعي",
      head_turn_left: "حرك رأسك لليسار",
      head_turn_right: "حرك رأسك لليمين",
      head_nod: "إيماءة الرأس (نعم)",
      look_up: "انظر لأعلى",
    };
    return descriptions[challenge] || challenge;
  };

  // Stop recording and submit
  const stopDetection = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Stop video stream
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      // Create blob and upload
      setTimeout(async () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: "video/webm",
        });

        // Upload video to S3
        try {
          const formData = new FormData();
          formData.append("file", blob);

          const uploadResponse = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error("Upload failed");
          }

          const { url } = await uploadResponse.json();

          // Submit for analysis
          const result = await submitVideoMutation.mutateAsync({
            sessionId,
            videoUrl: url,
            videoDuration: (60 - timeRemaining) * 1000,
          });

          onComplete(result);
        } catch (error) {
          console.error("Upload error:", error);
          onError("Failed to upload video");
        }
      }, 500);
    }
  }, [isRecording, sessionId, timeRemaining, submitVideoMutation, onComplete, onError]);

  // Timer countdown
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          stopDetection();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording, stopDetection]);

  if (isInitializing) {
    return (
      <Card className="w-full max-w-2xl mx-auto p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
        <p>جاري تهيئة كشف الوجه...</p>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">كشف الحيوية التفاعلي</h2>

        <div className="relative bg-black rounded-lg overflow-hidden mb-6">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full aspect-video"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            width={640}
            height={480}
          />

          {isRecording && (
            <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-full flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              {timeRemaining}s
            </div>
          )}
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">التقدم</span>
            <span className="text-sm text-gray-500">
              {detectedChallenges.filter((c) => c.completed).length} /{" "}
              {detectedChallenges.length}
            </span>
          </div>
          <Progress
            value={
              (detectedChallenges.filter((c) => c.completed).length /
                detectedChallenges.length) *
              100
            }
            className="h-2"
          />
        </div>

        <div className="space-y-3 mb-6">
          {detectedChallenges.map((challenge) => (
            <div
              key={challenge.type}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <span className="text-sm">{challenge.description}</span>
              {challenge.completed ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertCircle className="w-5 h-5 text-gray-300" />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <Button
            onClick={startDetection}
            disabled={isRecording}
            className="flex-1"
            variant="default"
          >
            <Video className="w-4 h-4 mr-2" />
            ابدأ الكشف
          </Button>
          <Button
            onClick={stopDetection}
            disabled={!isRecording}
            variant="destructive"
            className="flex-1"
            loading={submitVideoMutation.isPending}
          >
            إنهاء وتحليل
          </Button>
        </div>
      </Card>

      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-800">
          💡 تلميح: تأكد من إضاءة جيدة وأن وجهك مرئي بوضوح في الكاميرا
        </p>
      </Card>
    </div>
  );
};

export default LivenessDetection;
