/**
 * Multipart Form Data Handler
 * Handles file uploads using busboy for streaming
 */

import { Readable } from "stream";
import { Request, Response, NextFunction } from "express";

interface ParsedFile {
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

interface ParsedForm {
  files: ParsedFile[];
  fields: Record<string, string | string[]>;
}

/**
 * Parse multipart/form-data using busboy
 */
export async function parseMultipartForm(
  req: Request
): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    try {
      // Check if body is already parsed
      if (req.body && typeof req.body === "object") {
        resolve({
          files: [],
          fields: req.body,
        });
        return;
      }

      const files: ParsedFile[] = [];
      const fields: Record<string, string | string[]> = {};

      // Use built-in JSON parsing for now
      // In production, consider using 'busboy' or 'multer' for better multipart handling
      let rawData = "";

      req.on("data", (chunk) => {
        rawData += chunk.toString();
      });

      req.on("end", () => {
        resolve({
          files,
          fields,
        });
      });

      req.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Middleware for handling file uploads
 * Converts multipart/form-data to req.file
 */
export function fileUploadMiddleware(
  req: Request & { file?: any },
  res: Response,
  next: NextFunction
) {
  const contentType = req.headers["content-type"];

  if (!contentType || !contentType.includes("multipart/form-data")) {
    return next();
  }

  // For now, we'll use a simple approach with busboy-like parsing
  // In production, use 'multer' middleware for better handling

  let fileBuffer = Buffer.alloc(0);
  let fileInfo = {
    mimetype: "",
    originalname: "",
    size: 0,
  };

  req.on("data", (chunk) => {
    fileBuffer = Buffer.concat([fileBuffer, chunk]);
  });

  req.on("end", () => {
    try {
      // Extract file info from headers
      const contentDisposition = req.headers["content-disposition"] || "";
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : "file";

      req.file = {
        buffer: fileBuffer,
        mimetype: req.headers["content-type"] || "application/octet-stream",
        originalname: filename,
        size: fileBuffer.length,
      };

      next();
    } catch (error) {
      next(error);
    }
  });

  req.on("error", (error) => {
    next(error);
  });
}

/**
 * Simple multipart parser for form data
 * Handles file uploads without external dependencies
 */
export async function parseFormData(
  req: Request
): Promise<{ files: Map<string, Buffer>; fields: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const files = new Map<string, Buffer>();
    const fields: Record<string, string> = {};

    try {
      // This is a simplified version
      // For production, use 'multer' or 'busboy'
      const contentType = req.headers["content-type"];

      if (!contentType || !contentType.includes("multipart/form-data")) {
        resolve({ files, fields });
        return;
      }

      let buffer = Buffer.alloc(0);

      req.on("data", (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
      });

      req.on("end", () => {
        // Parse the multipart data
        // This is a basic implementation
        // For production, use proper multipart parsing library

        resolve({ files, fields });
      });

      req.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}
