import type { VeloxRequest, VeloxMiddleware, SecurityConfig } from "../types"
import type { ServerResponse } from "node:http"
import { SECURITY_HEADERS } from "@/config/security"

export class SecurityMiddleware {
    private config: SecurityConfig

    constructor(config: SecurityConfig) {
        this.config = config
    }

    public headers(): VeloxMiddleware {
        return (req: VeloxRequest, res: ServerResponse, next) => {
            Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
                res.setHeader(key, value)
            })

            res.setHeader("X-Request-ID", req.id)
            res.setHeader("X-Response-Time", Date.now().toString())

            next()
        }
    }

    public cors(): VeloxMiddleware {
        return (req: VeloxRequest, res: ServerResponse, next) => {
            const origin = req.headers.origin
            const referer = req.headers.referer

            if (referer && !origin) {
                try {
                    const refUrl = new URL(referer)
                    if (!this.config.CORS.ALLOWED_ORIGINS.includes(refUrl.origin)) {
                        res.writeHead(403, { "Content-Type": "application/json" })
                        res.end(JSON.stringify({ error: "Unauthorized source" }))
                        return
                    }
                } catch {
                    res.writeHead(403, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ error: "Invalid referer" }))
                    return
                }
            }

            if (origin && !this.config.CORS.ALLOWED_ORIGINS.includes(origin)) {
                res.writeHead(403, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Unauthorized origin" }))
                return
            }

            if (origin) {
                res.setHeader("Access-Control-Allow-Origin", origin)
                res.setHeader("Access-Control-Allow-Methods", this.config.CORS.METHODS.join(","))
                res.setHeader(
                    "Access-Control-Allow-Headers",
                    "Content-Type, Authorization, X-Requested-With, X-File-Hash, X-Request-ID",
                )
                res.setHeader("Access-Control-Allow-Credentials", this.config.CORS.ALLOW_CREDENTIALS.toString())
                res.setHeader("Access-Control-Max-Age", "86400")
                res.setHeader("Vary", "Origin")
            }

            if (req.method === "OPTIONS") {
                res.writeHead(204)
                res.end()
                return
            }

            next()
        }
    }

    public contentTypeValidation(): VeloxMiddleware {
        return (req: VeloxRequest, res: ServerResponse, next) => {
            const contentType = req.headers["content-type"]

            if (["POST", "PUT", "PATCH"].includes(req.method || "")) {
                if (!contentType) {
                    res.writeHead(400, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ error: "Content-Type header is required" }))
                    return
                }

                const allowedTypes = [
                    "application/json",
                    "application/x-www-form-urlencoded",
                    "multipart/form-data",
                    "text/plain",
                ]

                const isAllowed = allowedTypes.some((type) => contentType.includes(type))
                if (!isAllowed) {
                    res.writeHead(415, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ error: "Unsupported Media Type" }))
                    return
                }
            }

            next()
        }
    }

    public requestSizeLimit(): VeloxMiddleware {
        return (req: VeloxRequest, res: ServerResponse, next) => {
            const contentLength = Number.parseInt(req.headers["content-length"] || "0", 10)

            if (contentLength > this.config.MAX_FILE_SIZE * 2) {
                res.writeHead(413, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Request entity too large" }))
                return
            }

            next()
        }
    }

    public ipValidation(): VeloxMiddleware {
        return (req: VeloxRequest, res: ServerResponse, next) => {
            const ip = req.ip

            if (!ip || ip === "unknown") {
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Invalid client IP" }))
                return
            }

            const blockedIPs = ["0.0.0.0", "127.0.0.2"]
            if (blockedIPs.includes(ip)) {
                res.writeHead(403, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "IP address blocked" }))
                return
            }

            next()
        }
    }
}
