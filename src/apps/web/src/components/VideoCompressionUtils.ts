/**
 * Video Compression Utilities
 * Handles video compression and optimization before upload
 * Reduces bandwidth usage while maintaining quality for video processing
 */

export interface CompressionOptions {
  targetBitrate?: number; // bits per second (default: 1500000 = 1.5 Mbps)
  targetFramerate?: number; // fps (default: 30)
  targetResolution?: {
    width: number;
    height: number;
  };
  quality?: "low" | "medium" | "high"; // Preset quality levels
}

export interface CompressionResult {
  originalSize: number; // bytes
  compressedSize: number; // bytes
  compressionRatio: number; // percentage
  estimatedTime: number; // milliseconds
}

/**
 * Get preset compression options based on quality level
 * @param quality Quality level
 * @returns Compression options
 */
export function getPresetCompressionOptions(
  quality: "low" | "medium" | "high" = "medium"
): CompressionOptions {
  switch (quality) {
    case "low":
      return {
        targetBitrate: 800000, // 800 kbps
        targetFramerate: 24,
        targetResolution: { width: 480, height: 360 },
      };
    case "high":
      return {
        targetBitrate: 2500000, // 2.5 Mbps
        targetFramerate: 30,
        targetResolution: { width: 1280, height: 720 },
      };
    case "medium":
    default:
      return {
        targetBitrate: 1500000, // 1.5 Mbps
        targetFramerate: 30,
        targetResolution: { width: 640, height: 480 },
      };
  }
}

/**
 * Estimate compression result without actually compressing
 * @param originalBlob Original video blob
 * @param options Compression options
 * @returns Estimated compression result
 */
export function estimateCompressionResult(
  originalBlob: Blob,
  options: CompressionOptions = {}
): CompressionResult {
  const opts = { ...getPresetCompressionOptions("medium"), ...options };
  const originalSize = originalBlob.size;

  // Estimate compressed size based on bitrate
  // Assuming 60-second video
  const videoDuration = 60; // seconds
  const estimatedCompressedSize = (opts.targetBitrate! / 8) * videoDuration;

  const compressionRatio = ((originalSize - estimatedCompressedSize) / originalSize) * 100;
  const estimatedTime = Math.ceil((estimatedCompressedSize / 1024 / 1024) * 2); // 2 seconds per MB

  return {
    originalSize,
    compressedSize: Math.round(estimatedCompressedSize),
    compressionRatio: Math.max(0, Math.round(compressionRatio)),
    estimatedTime,
  };
}

/**
 * Compress video using canvas and MediaRecorder
 * This is a client-side compression that reduces video quality
 * @param mediaStream Media stream from getUserMedia
 * @param options Compression options
 * @returns Promise resolving to compressed blob
 */
export async function compressVideoStream(
  mediaStream: MediaStream,
  options: CompressionOptions = {}
): Promise<Blob> {
  const opts = { ...getPresetCompressionOptions("medium"), ...options };

  return new Promise((resolve, reject) => {
    try {
      // Create canvas for video processing
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Set canvas dimensions
      const resolution = opts.targetResolution || { width: 640, height: 480 };
      canvas.width = resolution.width;
      canvas.height = resolution.height;

      // Create video element for processing
      const video = document.createElement("video");
      video.srcObject = mediaStream;
      video.play();

      // Create canvas stream
      const canvasStream = canvas.captureStream(opts.targetFramerate || 30);

      // Create MediaRecorder with target bitrate
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";

      const mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType,
        videoBitsPerSecond: opts.targetBitrate || 1500000,
      });

      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        video.pause();
        video.srcObject = null;
        resolve(blob);
      };

      mediaRecorder.onerror = (event) => {
        reject(new Error(`MediaRecorder error: ${event.error}`));
      };

      // Start recording
      mediaRecorder.start();

      // Stop recording after 60 seconds
      setTimeout(() => {
        mediaRecorder.stop();
      }, 60000);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Calculate estimated upload time
 * @param fileSize File size in bytes
 * @param uploadSpeed Upload speed in Mbps (default: 5)
 * @returns Estimated time in seconds
 */
export function estimateUploadTime(fileSize: number, uploadSpeed: number = 5): number {
  const fileSizeMb = fileSize / (1024 * 1024);
  const uploadSpeedMbps = uploadSpeed;
  return Math.ceil((fileSizeMb / uploadSpeedMbps) * 8); // Convert to seconds
}

/**
 * Format file size for display
 * @param bytes File size in bytes
 * @returns Formatted string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Get quality recommendation based on file size
 * @param fileSize File size in bytes
 * @returns Recommended quality level
 */
export function getQualityRecommendation(fileSize: number): "low" | "medium" | "high" {
  const sizeMb = fileSize / (1024 * 1024);

  if (sizeMb > 50) {
    return "low";
  } else if (sizeMb > 30) {
    return "medium";
  } else {
    return "high";
  }
}
