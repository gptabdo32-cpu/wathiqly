/**
 * Custom Hook for Liveness Detection
 * Provides reusable face movement detection logic
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export interface DetectionStats {
  eyeBlinkCount: number;
  eyeBlinkLastTime: number;
  eyeBlinkDuration: number;
  smileDetected: boolean;
  smileStartTime: number;
  headTurns: number;
  headTurnStartTime: number;
  headTurnDirection: "left" | "right" | null;
  headNods: number;
  headNodStartTime: number;
  faceDetected: boolean;
  faceDetectionCount: number;
  lastFrameTime: number;
}

export interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

const INITIAL_STATS: DetectionStats = {
  eyeBlinkCount: 0,
  eyeBlinkLastTime: 0,
  eyeBlinkDuration: 0,
  smileDetected: false,
  smileStartTime: 0,
  headTurns: 0,
  headTurnStartTime: 0,
  headTurnDirection: null,
  headNods: 0,
  headNodStartTime: 0,
  faceDetected: false,
  faceDetectionCount: 0,
  lastFrameTime: 0,
};

export const useLivenessDetection = () => {
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DetectionStats>(INITIAL_STATS);

  // Initialize MediaPipe
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
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
        setIsInitialized(true);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        console.error("Failed to initialize MediaPipe:", err);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();

    return () => {
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
      }
    };
  }, []);

  // Detect landmarks
  const detectLandmarks = useCallback(
    (video: HTMLVideoElement): LandmarkPoint[][] | null => {
      if (!faceLandmarkerRef.current || !isInitialized) return null;

      try {
        const results = faceLandmarkerRef.current.detectForVideo(
          video,
          Date.now()
        );
        return results.faceLandmarks || null;
      } catch (err) {
        console.error("Detection error:", err);
        return null;
      }
    },
    [isInitialized]
  );

  // Calculate Eye Aspect Ratio
  const calculateEAR = useCallback((eyeLandmarks: LandmarkPoint[]): number => {
    const distance = (p1: LandmarkPoint, p2: LandmarkPoint) =>
      Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    if (eyeLandmarks.length < 6) return 1;

    const vertical1 = distance(eyeLandmarks[1], eyeLandmarks[5]);
    const vertical2 = distance(eyeLandmarks[2], eyeLandmarks[4]);
    const horizontal = distance(eyeLandmarks[0], eyeLandmarks[3]);

    return (vertical1 + vertical2) / (2 * horizontal);
  }, []);

  // Calculate smile intensity
  const calculateSmileIntensity = useCallback(
    (mouthLandmarks: LandmarkPoint[]): number => {
      const distance = (p1: LandmarkPoint, p2: LandmarkPoint) =>
        Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

      if (mouthLandmarks.length < 7) return 0;

      const mouthWidth = distance(mouthLandmarks[0], mouthLandmarks[6]);
      const mouthHeight = distance(mouthLandmarks[2], mouthLandmarks[4]);

      return mouthHeight / mouthWidth;
    },
    []
  );

  // Calculate head turn angle
  const calculateHeadTurn = useCallback(
    (nose: LandmarkPoint, leftEar: LandmarkPoint, rightEar: LandmarkPoint): number => {
      const leftDist = Math.sqrt(
        Math.pow(nose.x - leftEar.x, 2) + Math.pow(nose.y - leftEar.y, 2)
      );
      const rightDist = Math.sqrt(
        Math.pow(nose.x - rightEar.x, 2) + Math.pow(nose.y - rightEar.y, 2)
      );

      return ((rightDist - leftDist) / (rightDist + leftDist)) * 90;
    },
    []
  );

  // Calculate head pitch
  const calculateHeadPitch = useCallback((landmarks: LandmarkPoint[]): number => {
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
  }, []);

  // Update stats based on landmarks
  const updateStats = useCallback(
    (landmarks: LandmarkPoint[]) => {
      const now = Date.now();

      setStats((prev) => {
        let newState = { ...prev, lastFrameTime: now };

        // Eye blink detection
        const leftEye = landmarks.slice(33, 42);
        const rightEye = landmarks.slice(362, 371);
        const leftEAR = calculateEAR(leftEye as LandmarkPoint[]);
        const rightEAR = calculateEAR(rightEye as LandmarkPoint[]);
        const avgEAR = (leftEAR + rightEAR) / 2;

        if (avgEAR < 0.2) {
          if (prev.eyeBlinkLastTime === 0) {
            newState.eyeBlinkLastTime = now;
          }
          newState.eyeBlinkDuration = now - prev.eyeBlinkLastTime;
        } else {
          if (
            prev.eyeBlinkDuration > 50 &&
            prev.eyeBlinkDuration < 400
          ) {
            newState.eyeBlinkCount = prev.eyeBlinkCount + 1;
          }
          newState.eyeBlinkLastTime = 0;
          newState.eyeBlinkDuration = 0;
        }

        // Smile detection
        const mouth = landmarks.slice(61, 68);
        const smileIntensity = calculateSmileIntensity(mouth as LandmarkPoint[]);

        if (smileIntensity > 0.5) {
          if (prev.smileStartTime === 0) {
            newState.smileStartTime = now;
          }
          newState.smileDetected = true;
        } else {
          newState.smileDetected = false;
          newState.smileStartTime = 0;
        }

        // Head movement detection
        const noseTip = landmarks[1];
        const leftEarLandmark = landmarks[234];
        const rightEarLandmark = landmarks[454];

        const headTurn = calculateHeadTurn(
          noseTip,
          leftEarLandmark,
          rightEarLandmark
        );
        const headPitch = calculateHeadPitch(landmarks);

        if (Math.abs(headTurn) > 15) {
          const direction = headTurn > 0 ? "right" : "left";

          if (
            prev.headTurnDirection !== direction ||
            now - prev.headTurnStartTime > 1000
          ) {
            newState.headTurnStartTime = now;
            newState.headTurnDirection = direction;
          } else if (now - prev.headTurnStartTime > 300) {
            newState.headTurns = prev.headTurns + 1;
            newState.headTurnStartTime = now;
            newState.headTurnDirection = null;
          }
        } else {
          newState.headTurnDirection = null;
        }

        // Head nod detection
        if (Math.abs(headPitch) > 10) {
          if (prev.headNodStartTime === 0) {
            newState.headNodStartTime = now;
          } else if (now - prev.headNodStartTime > 400) {
            newState.headNods = prev.headNods + 1;
            newState.headNodStartTime = 0;
          }
        } else {
          newState.headNodStartTime = 0;
        }

        newState.faceDetected = true;
        newState.faceDetectionCount = prev.faceDetectionCount + 1;

        return newState;
      });
    },
    [calculateEAR, calculateSmileIntensity, calculateHeadTurn, calculateHeadPitch]
  );

  // Reset stats
  const resetStats = useCallback(() => {
    setStats(INITIAL_STATS);
  }, []);

  return {
    isInitialized,
    isLoading,
    error,
    stats,
    detectLandmarks,
    calculateEAR,
    calculateSmileIntensity,
    calculateHeadTurn,
    calculateHeadPitch,
    updateStats,
    resetStats,
  };
};
