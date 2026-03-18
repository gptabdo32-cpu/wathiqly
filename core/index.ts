import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";\nimport { initializeSubscribers } from "./events/Subscribers";
import { limiter, authLimiter } from "./middleware";
import multer from "multer";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {\n  // Initialize Smart Event Bus System\n  initializeSubscribers();\n
  const app = express();
  const server = createServer(app);

  // Security: Basic Security Headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';");
    next();
  });

  // Configure body parser with controlled size limits
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ limit: "20mb", extended: true }));

  // Enhanced CSRF protection for non-GET requests
  app.use((req, res, next) => {
    const protectedMethods = ["POST", "PUT", "DELETE", "PATCH"];
    if (protectedMethods.includes(req.method)) {
      const csrfHeader = req.headers["x-trpc-source"] || req.headers["x-requested-with"];
      const origin = req.headers["origin"];
      const referer = req.headers["referer"];
      
      // 1. Verify custom header (standard for SPA/tRPC)
      if (!csrfHeader) {
        return res.status(403).json({ error: "Security Policy: Missing required authentication header (CSRF Protection)" });
      }
      
      // 2. Strict Origin/Referer check in production
      if (process.env.NODE_ENV === "production") {
        const host = req.headers["host"];
        const target = origin || referer;
        
        if (!target || (host && !target.includes(host))) {
          return res.status(403).json({ error: "Security Policy: Origin mismatch or missing (CSRF Protection)" });
        }
      }
    }
    next();
  });

  // Configure multer for file uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ["video/webm", "video/mp4", "video/quicktime", "video/x-msvideo"];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type: ${file.mimetype}`));
      }
    },
  });

  // Upload endpoint for liveness detection videos
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
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
  });

  // OAuth callback under /api/oauth/callback
  app.use("/api/oauth", authLimiter);
  registerOAuthRoutes(app);

  // tRPC API with global rate limiting
  app.use(
    "/api/trpc",
    limiter,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
