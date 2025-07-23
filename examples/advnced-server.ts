import { createVeloxServer, VeloxRouter, type VeloxRequest } from "../src"
import type { ServerResponse } from "node:http"

const server = createVeloxServer({
    port: 8080,
    uploadDir: "./storage/uploads",
    isProduction: false,
    security: {
        MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
        ALLOWED_MIME_TYPES: ["image/jpeg", "image/png", "image/gif", "application/pdf", "video/mp4"],
        RATE_LIMIT: {
            WINDOW_MS: 10 * 60 * 1000, // 10 minutes
            MAX_REQUESTS: 500,
        },
        CORS: {
            ALLOWED_ORIGINS: ["http://localhost:3000", "https://app.example.com"],
            METHODS: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            ALLOW_CREDENTIALS: true,
        },
        CLUSTER_MODE: true,
        WORKER_THREADS: 4,
        FILE_HASHING: true,
        COMPRESSION: {
            ENABLED: true,
            THRESHOLD: 1024,
            LEVEL: 6,
        },
    },
})

server.use(async (req: VeloxRequest, res: ServerResponse, next) => {
    res.setHeader("X-Custom-Server", "VELOX-Advanced")

    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.ip}`)

    next()
})

const apiRouter = new VeloxRouter("/api/v1")

const authMiddleware = async (req: VeloxRequest, res: ServerResponse, next: Function) => {
    const token = req.headers.authorization?.replace("Bearer ", "")

    if (!token) {
        server.sendJson(res, 401, { error: "Authentication required" })
        return
    }

    if (token !== "valid-token") {
        server.sendJson(res, 403, { error: "Invalid token" })
        return
    }

    req.user = { id: 1, name: "John Doe" }
    next()
}

apiRouter.get(
    "/profile",
    async (req: VeloxRequest, res: ServerResponse) => {
        server.sendJson(res, 200, {
            user: req.user,
            timestamp: new Date().toISOString(),
        })
    },
    authMiddleware,
)

apiRouter.post(
    "/upload",
    async (req: VeloxRequest, res: ServerResponse) => {
        const files = Object.values(req.files)
        const metadata = req.body.fields

        const results = await Promise.all(
            files.map(async (file) => {
                const validation = await file.validate()

                if (!validation.valid) {
                    return {
                        filename: file.name,
                        success: false,
                        error: validation.error,
                    }
                }

                const saved = await file.save("./storage/uploads")
                return {
                    filename: file.name,
                    success: true,
                    url: saved.url,
                    hash: validation.hash || saved.hash,
                    size: file.size,
                    metadata: metadata,
                    scanResult: validation.scanResult,
                }
            }),
        )

        server.sendJson(res, 200, {
            message: "Files processed",
            results,
            total: files.length,
            successful: results.filter((r) => r.success).length,
        })
    },
    authMiddleware,
)

server.mount("/api/v1", apiRouter)


server.get("/stream", async (req: VeloxRequest, res: ServerResponse) => {
    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")

    res.write(`data: ${JSON.stringify({ type: "connected", timestamp: Date.now() })}\n\n`)

    const interval = setInterval(() => {
        const data = {
            type: "update",
            timestamp: Date.now(),
            metrics: server.getMetrics(),
        }
        res.write(`data: ${JSON.stringify(data)}\n\n`)
    }, 5000)
    
    req.on("close", () => {
        clearInterval(interval)
    })
})

server.use(async (req: VeloxRequest, res: ServerResponse, next) => {
    try {
        await next()
    } catch (error) {
        console.error("Unhandled error:", error)

        if (!res.headersSent) {
            server.sendJson(res, 500, {
                error: "Internal Server Error",
                message: error instanceof Error ? error.message : "Unknown error",
                timestamp: new Date().toISOString(),
            })
        }
    }
})

server.start().then(() => {
    console.log("🚀 Advanced Velox server is running with clustering!")
    console.log("📊 Metrics available at /health")
    console.log("🔐 Protected API at /api/v1/*")
    console.log("📡 Real-time stream at /stream")
})
