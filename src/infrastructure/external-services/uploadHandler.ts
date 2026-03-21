/**
 * Upload Handler for Liveness Detection Videos
 * Handles video file uploads to storage
 */

import express, { Request, Response } from "express";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

// Extend Express Request to include file data
interface UploadRequest extends Request {
  file?: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
}

/**
 * Handle video upload
 * Expects multipart/form-data with 'file' field
 */
export async function handleVideoUpload(
  req: UploadRequest,
  res: Response
): Promise<void> {
  try {
    // Validate file exists
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    // Validate file type
    const allowedMimeTypes = [
      "video/webm",
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      res.status(400).json({
        error: `Invalid file type. Allowed types: ${allowedMimeTypes.join(", ")}`,
      });
      return;
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (req.file.size > maxSize) {
      res.status(400).json({
        error: `File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`,
      });
      return;
    }

    // Generate unique filename
    const fileId = nanoid();
    const ext = req.file.originalname.split(".").pop() || "webm";
    const filename = `liveness/${Date.now()}-${fileId}.${ext}`;

    // Upload to storage
    const uploadResult = await storagePut(
      filename,
      req.file.buffer,
      req.file.mimetype
    );

    res.json({
      success: true,
      url: uploadResult.url,
      key: uploadResult.key,
      fileId,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Failed to upload file",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Create upload router
 */
export function createUploadRouter(): express.Router {
  const router = express.Router();

  // POST /api/upload - Upload video file
  router.post("/", handleVideoUpload);

  return router;
}
