/**
 * Lighting Quality Detection Module
 * Analyzes video frame brightness and quality in real-time
 * Helps users position themselves properly before liveness detection starts
 */

export interface LightingAnalysis {
  brightness: number; // 0-100
  contrast: number; // 0-100
  quality: "poor" | "fair" | "good" | "excellent";
  isAdequate: boolean;
  recommendations: string[];
}

/**
 * Analyze lighting quality from a video frame
 * @param canvas Canvas element containing the video frame
 * @returns Lighting analysis result
 */
export function analyzeLightingQuality(canvas: HTMLCanvasElement): LightingAnalysis {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      brightness: 0,
      contrast: 0,
      quality: "poor",
      isAdequate: false,
      recommendations: ["فشل في تحليل الإضاءة"],
    };
  }

  // Get image data from canvas
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Calculate brightness and contrast
  let totalBrightness = 0;
  let pixelCount = 0;
  const pixelBrightness: number[] = [];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;

    totalBrightness += brightness;
    pixelBrightness.push(brightness);
    pixelCount++;
  }

  const avgBrightness = totalBrightness / pixelCount;
  const normalizedBrightness = Math.min(100, Math.max(0, (avgBrightness / 255) * 100));

  // Calculate contrast (standard deviation)
  const variance =
    pixelBrightness.reduce((sum, b) => sum + Math.pow(b - avgBrightness, 2), 0) /
    pixelCount;
  const stdDev = Math.sqrt(variance);
  const normalizedContrast = Math.min(100, (stdDev / 127.5) * 100);

  // Determine quality level
  let quality: "poor" | "fair" | "good" | "excellent" = "poor";
  let isAdequate = false;

  if (normalizedBrightness > 65 && normalizedContrast > 30) {
    quality = "excellent";
    isAdequate = true;
  } else if (normalizedBrightness > 50 && normalizedContrast > 20) {
    quality = "good";
    isAdequate = true;
  } else if (normalizedBrightness > 35 && normalizedContrast > 10) {
    quality = "fair";
    isAdequate = false;
  } else {
    quality = "poor";
    isAdequate = false;
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (normalizedBrightness < 35) {
    recommendations.push("الإضاءة ضعيفة جداً - تأكد من وجود إضاءة كافية");
  } else if (normalizedBrightness < 50) {
    recommendations.push("الإضاءة ضعيفة - حاول الاقتراب من مصدر ضوء");
  } else if (normalizedBrightness > 85) {
    recommendations.push("الإضاءة قوية جداً - تجنب الضوء المباشر على الوجه");
  }

  if (normalizedContrast < 15) {
    recommendations.push("التباين منخفض - تأكد من أن الخلفية مختلفة عن لون الوجه");
  }

  if (recommendations.length === 0) {
    recommendations.push("الإضاءة مثالية - يمكنك البدء");
  }

  return {
    brightness: Math.round(normalizedBrightness),
    contrast: Math.round(normalizedContrast),
    quality,
    isAdequate,
    recommendations,
  };
}

/**
 * Monitor lighting quality continuously
 * @param videoElement Video element to analyze
 * @param canvasElement Canvas element for analysis
 * @param callback Function called with analysis results
 * @param interval Interval in ms between analyses (default: 1000)
 * @returns Function to stop monitoring
 */
export function monitorLightingQuality(
  videoElement: HTMLVideoElement,
  canvasElement: HTMLCanvasElement,
  callback: (analysis: LightingAnalysis) => void,
  interval: number = 1000
): () => void {
  const ctx = canvasElement.getContext("2d");
  if (!ctx) {
    console.error("Failed to get canvas context");
    return () => {};
  }

  const intervalId = setInterval(() => {
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
      // Draw video frame to canvas
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      ctx.drawImage(videoElement, 0, 0);

      // Analyze lighting
      const analysis = analyzeLightingQuality(canvasElement);
      callback(analysis);
    }
  }, interval);

  return () => clearInterval(intervalId);
}

/**
 * Get color-coded quality indicator
 * @param quality Quality level
 * @returns Color code (hex)
 */
export function getQualityColor(quality: string): string {
  switch (quality) {
    case "excellent":
      return "#22c55e"; // Green
    case "good":
      return "#3b82f6"; // Blue
    case "fair":
      return "#f59e0b"; // Amber
    case "poor":
      return "#ef4444"; // Red
    default:
      return "#6b7280"; // Gray
  }
}

/**
 * Get quality label in Arabic
 * @param quality Quality level
 * @returns Arabic label
 */
export function getQualityLabel(quality: string): string {
  switch (quality) {
    case "excellent":
      return "ممتازة";
    case "good":
      return "جيدة";
    case "fair":
      return "متوسطة";
    case "poor":
      return "ضعيفة";
    default:
      return "غير معروفة";
  }
}
