/**
 * Enhanced Interactive Liveness Detection Component
 * Real-time face movement detection using MediaPipe Face Landmarker
 * Supports eye blink, smile, head movement detection with improved accuracy
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Loader2, Video, Camera } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Challenge {
  type: string;
  description: string;
  completed: boolean;
  confidence: number;
  detectedCount?: number;
}

interface LivenessDetectionProps {
  sessionId: string;
  challenges: string[];
  onComplete: (result: any) => void;
  onError: (error: string) => void;
}

// Constants for detection thresholds
const DETECTION_THRESHOLDS = {
  EYE_BLINK: {
    earThreshold: 0.2,
    minDuration: 50, // ms
    maxDuration: 400, // ms
  },
  SMILE: {
    smileThreshold: 0.5,
    minConfidence: 0.6,
  },
  HEAD_TURN: {
    angleThreshold: 15,
    minDuration: 300, // ms
  },
  HEAD_NOD: {
    pitchThreshold: 10,
    minDuration: 400, // ms
  },
};

export const LivenessDetectionEnhanced: React.FC<LivenessDetectionProps> = ({
  sessionId,
  challenges,
  onComplete,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);

  // State management
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [detectedChallenges, setDetectedChallenges] = useState<Challenge[]>([]);
  const [stats, setStats] = useState({
    eyeBlinkCount: 0,
    eyeBlinkLastTime: 0,
    eyeBlinkDuration: 0,
    smileDetected: false,
    smileStartTime: 0,
    headTurns: 0,
    headTurnStartTime: 0,
    headTurnDirection: null as "left" | "right" | null,
    headNods: 0,
    headNodStartTime: 0,
    faceDetected: false,
    faceDetectionCount: 0,
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
                "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }
        );

        faceLandmarkerRef.current = landmarker;
        setIsInitializing(false);
      } catch (error) {
        console.error("Failed to initialize MediaPipe:", error);
        onError("فشل في تهيئة كشف الوجه. يرجى تحديث الصفحة والمحاولة مرة أخرى.");
      }
    };

    initializeMediaPipe();

    return () => {
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
      }
    };
  }, [onError]);

  // Initialize challenges
  const initialChallenges = useMemo<Challenge[]>(
    () =>
      challenges.map((c) => ({
        type: c,
        description: getChallengeDescription(c),
        completed: false,
        confidence: 0,
        detectedCount: 0,
      })),
    [challenges]
  );

  // Start camera and recording
  const startDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Setup MediaRecorder with better codec support
        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
          ? "video/webm;codecs=vp8"
          : "video/webm";

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 2500000, // 2.5 Mbps
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start();
        setIsRecording(true);
        setDetectedChallenges(initialChallenges);

        // Start detection loop
        detectFaceMovements();
      }
    } catch (error) {
      console.error("Failed to start camera:", error);
      onError("فشل في الوصول إلى الكاميرا. تأكد من السماح بالوصول.");
    }
  }, [initialChallenges]);

  // Detect face movements and landmarks
  const detectFaceMovements = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !faceLandmarkerRef.current)
      return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const detectFrame = async () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          const results = faceLandmarkerRef.current!.detectForVideo(
            video,
            Date.now()
          );

          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            const landmarks = results.faceLandmarks[0];

            // Draw landmarks on canvas
            drawLandmarks(ctx, canvas, landmarks);

            // Analyze movements
            analyzeMovements(landmarks);

            // Update face detection stats
            setStats((prev) => ({
              ...prev,
              faceDetected: true,
              faceDetectionCount: prev.faceDetectionCount + 1,
            }));
          } else {
            setStats((prev) => ({
              ...prev,
              faceDetected: false,
            }));
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
  }, [isRecording]);

  // Draw face landmarks on canvas
  const drawLandmarks = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    landmarks: any[]
  ) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw face outline
    ctx.strokeStyle = "rgba(0, 255, 0, 0.7)";
    ctx.lineWidth = 2;

    // Draw key points
    ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
    landmarks.forEach((landmark) => {
      const x = landmark.x * canvas.width;
      const y = landmark.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw eyes
    if (landmarks.length > 400) {
      drawConnection(ctx, canvas, landmarks[33], landmarks[133], "rgba(255, 0, 0, 0.7)"); // Left eye
      drawConnection(ctx, canvas, landmarks[362], landmarks[263], "rgba(255, 0, 0, 0.7)"); // Right eye
    }
  };

  const drawConnection = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    p1: any,
    p2: any,
    color: string
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
    ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
    ctx.stroke();
  };

  // Analyze face movements
  const analyzeMovements = (landmarks: any[]) => {
    const now = Date.now();

    // Eye blink detection
    detectEyeBlink(landmarks, now);

    // Smile detection
    detectSmile(landmarks, now);

    // Head movement detection
    detectHeadMovement(landmarks, now);
  };

  // Detect eye blink
  const detectEyeBlink = (landmarks: any[], now: number) => {
    const leftEye = landmarks.slice(33, 42);
    const rightEye = landmarks.slice(362, 371);

    const leftEAR = calculateEAR(leftEye);
    const rightEAR = calculateEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2;

    setStats((prev) => {
      let newState = { ...prev };

      // Blink detected
      if (avgEAR < DETECTION_THRESHOLDS.EYE_BLINK.earThreshold) {
        if (prev.eyeBlinkLastTime === 0) {
          newState.eyeBlinkLastTime = now;
        }
        newState.eyeBlinkDuration = now - prev.eyeBlinkLastTime;
      } else {
        // Blink ended
        if (
          prev.eyeBlinkDuration > DETECTION_THRESHOLDS.EYE_BLINK.minDuration &&
          prev.eyeBlinkDuration < DETECTION_THRESHOLDS.EYE_BLINK.maxDuration
        ) {
          newState.eyeBlinkCount = prev.eyeBlinkCount + 1;
        }
        newState.eyeBlinkLastTime = 0;
        newState.eyeBlinkDuration = 0;
      }

      return newState;
    });

    // Update challenge completion
    updateChallengeCompletion("eye_blink", stats.eyeBlinkCount >= 3);
  };

  // Detect smile
  const detectSmile = (landmarks: any[], now: number) => {
    const mouth = landmarks.slice(61, 68);
    const smileIntensity = calculateSmileIntensity(mouth);

    setStats((prev) => {
      let newState = { ...prev };

      if (smileIntensity > DETECTION_THRESHOLDS.SMILE.smileThreshold) {
        if (prev.smileStartTime === 0) {
          newState.smileStartTime = now;
        }
        newState.smileDetected = true;
      } else {
        newState.smileDetected = false;
        newState.smileStartTime = 0;
      }

      return newState;
    });

    updateChallengeCompletion("smile", stats.smileDetected);
  };

  // Detect head movement
  const detectHeadMovement = (landmarks: any[], now: number) => {
    const noseTip = landmarks[1];
    const leftEar = landmarks[234];
    const rightEar = landmarks[454];

    const headTurn = calculateHeadTurn(noseTip, leftEar, rightEar);
    const headPitch = calculateHeadPitch(landmarks);

    setStats((prev) => {
      let newState = { ...prev };

      // Head turn detection
      if (Math.abs(headTurn) > DETECTION_THRESHOLDS.HEAD_TURN.angleThreshold) {
        const direction = headTurn > 0 ? "right" : "left";

        if (
          prev.headTurnDirection !== direction ||
          now - prev.headTurnStartTime > 1000
        ) {
          newState.headTurnStartTime = now;
          newState.headTurnDirection = direction;
        } else if (
          now - prev.headTurnStartTime >
          DETECTION_THRESHOLDS.HEAD_TURN.minDuration
        ) {
          newState.headTurns = prev.headTurns + 1;
          newState.headTurnStartTime = now;
          newState.headTurnDirection = null;
        }
      } else {
        newState.headTurnDirection = null;
      }

      // Head nod detection
      if (Math.abs(headPitch) > DETECTION_THRESHOLDS.HEAD_NOD.pitchThreshold) {
        if (prev.headNodStartTime === 0) {
          newState.headNodStartTime = now;
        } else if (
          now - prev.headNodStartTime >
          DETECTION_THRESHOLDS.HEAD_NOD.minDuration
        ) {
          newState.headNods = prev.headNods + 1;
          newState.headNodStartTime = 0;
        }
      } else {
        newState.headNodStartTime = 0;
      }

      return newState;
    });

    updateChallengeCompletion("head_turn_left", stats.headTurns >= 1);
    updateChallengeCompletion("head_turn_right", stats.headTurns >= 1);
    updateChallengeCompletion("head_nod", stats.headNods >= 1);
    updateChallengeCompletion("look_up", Math.abs(headPitch) > 20);
  };

  // Calculate Eye Aspect Ratio
  const calculateEAR = (eyeLandmarks: any[]): number => {
    const distance = (p1: any, p2: any) =>
      Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    if (eyeLandmarks.length < 6) return 1;

    const vertical1 = distance(eyeLandmarks[1], eyeLandmarks[5]);
    const vertical2 = distance(eyeLandmarks[2], eyeLandmarks[4]);
    const horizontal = distance(eyeLandmarks[0], eyeLandmarks[3]);

    return (vertical1 + vertical2) / (2 * horizontal);
  };

  // Calculate smile intensity
  const calculateSmileIntensity = (mouthLandmarks: any[]): number => {
    const distance = (p1: any, p2: any) =>
      Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    if (mouthLandmarks.length < 7) return 0;

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

  // Calculate head pitch
  const calculateHeadPitch = (landmarks: any[]): number => {
    if (landmarks.length < 10) return 0;

    const nose = landmarks[1];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    const noseToChainDist = Math.sqrt(
      Math.pow(nose.y - chin.y, 2) + Math.pow(nose.x - chin.x, 2)
    );
    const noseToForeheadDist = Math.sqrt(
      Math.pow(nose.y - forehead.y, 2) + Math.pow(nose.x - forehead.x, 2)
    );

    return ((noseToChainDist - noseToForeheadDist) / noseToChainDist) * 90;
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

  // Update challenge completion
  const updateChallengeCompletion = (
    challengeType: string,
    isCompleted: boolean
  ) => {
    setDetectedChallenges((prev) =>
      prev.map((c) =>
        c.type === challengeType
          ? {
              ...c,
              completed: isCompleted,
              confidence: isCompleted ? 100 : c.confidence,
            }
          : c
      )
    );
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

        // Upload video to storage
        try {
          const formData = new FormData();
          formData.append("file", blob, `liveness-${sessionId}.webm`);

          // Use manus-upload-file utility
          const uploadCommand = `manus-upload-file /tmp/liveness-${sessionId}.webm`;

          // For now, we'll use a simpler approach with fetch
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
          onError("فشل في رفع الفيديو. يرجى المحاولة مرة أخرى.");
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
        <p className="text-gray-600">جاري تهيئة كشف الوجه...</p>
      </Card>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">كشف الحيوية التفاعلي</h2>

        {/* Video Feed */}
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

          {/* Recording indicator */}
          {isRecording && (
            <div className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-full flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              {timeRemaining}s
            </div>
          )}

          {/* Face detection status */}
          {isRecording && (
            <div className="absolute top-4 left-4 px-3 py-2 rounded-full text-sm font-medium flex items-center gap-2"
              style={{
                backgroundColor: stats.faceDetected ? "rgba(34, 197, 94, 0.9)" : "rgba(239, 68, 68, 0.9)",
                color: "white",
              }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: stats.faceDetected ? "#22c55e" : "#ef4444",
                }}
              />
              {stats.faceDetected ? "وجه مكتشف" : "لا يوجد وجه"}
            </div>
          )}
        </div>

        {/* Progress bar */}
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

        {/* Challenges list */}
        <div className="space-y-3 mb-6">
          {detectedChallenges.map((challenge) => (
            <div
              key={challenge.type}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="flex-1">
                <span className="text-sm font-medium">{challenge.description}</span>
                {challenge.completed && (
                  <span className="text-xs text-gray-500 ml-2">
                    ({challenge.detectedCount || 1} مكتشف)
                  </span>
                )}
              </div>
              {challenge.completed ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-gray-300 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-4">
          <Button
            onClick={startDetection}
            disabled={isRecording}
            className="flex-1"
            variant="default"
          >
            <Camera className="w-4 h-4 mr-2" />
            ابدأ الكشف
          </Button>
          <Button
            onClick={stopDetection}
            disabled={!isRecording}
            variant="destructive"
            className="flex-1"
          >
            {submitVideoMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                جاري الرفع...
              </>
            ) : (
              "إنهاء وتحليل"
            )}
          </Button>
        </div>
      </Card>

      {/* Tips */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <div className="text-xl">💡</div>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">نصائح للحصول على أفضل النتائج:</p>
            <ul className="space-y-1 text-xs">
              <li>✓ تأكد من إضاءة جيدة على وجهك</li>
              <li>✓ ضع وجهك مباشرة أمام الكاميرا</li>
              <li>✓ قم بالحركات ببطء وبشكل واضح</li>
              <li>✓ تأكد من أن الكاميرا تقبض على وجهك بالكامل</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LivenessDetectionEnhanced;
