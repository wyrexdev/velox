import { createVeloxServer, type VeloxRequest } from "../src"
import type { ServerResponse } from "node:http"

const server = createVeloxServer({
    port: 3000,
    uploadDir: "./uploads",
    security: {
        CORS: {
            ALLOWED_ORIGINS: ["http://localhost:3000", "https://myapp.com"],
            METHODS: ["GET", "POST", "PUT", "DELETE"],
            ALLOW_CREDENTIALS: true,
        },
        RATE_LIMIT: {
            WINDOW_MS: 15 * 60 * 1000,
            MAX_REQUESTS: 100,
        },
    },
})

server.get("/", async (req: VeloxRequest, res: ServerResponse) => {
    server.sendJson(res, 200, {
        message: "Welcome to VELOX Server!",
        timestamp: new Date().toISOString(),
    })
})

server.get("/users/:id", async (req: VeloxRequest, res: ServerResponse) => {
    const userId = req.params.id

    server.sendJson(res, 200, {
        user: {
            id: userId,
            name: `User ${userId}`,
            email: `user${userId}@example.com`,
        },
    })
})

server.start().then(() => {
    console.log("🚀 Basic VELOX server is running!")
})
