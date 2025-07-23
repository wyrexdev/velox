import type { VeloxRequest, VeloxMiddleware, RateLimitInfo, SecurityConfig } from "../types"
import type { ServerResponse } from "node:http"

export class RateLimiter {
    private store: Map<string, RateLimitInfo> = new Map()
    private config: SecurityConfig["RATE_LIMIT"]
    private cleanupInterval: NodeJS.Timeout

    constructor(config: SecurityConfig["RATE_LIMIT"]) {
        this.config = config

        this.cleanupInterval = setInterval(
            () => {
                this.cleanup()
            },
            5 * 60 * 1000,
        )
    }

    public middleware(): VeloxMiddleware {
        return (req: VeloxRequest, res: ServerResponse, next) => {
            const ip = req.ip
            const now = Date.now()

            const limit = this.checkLimit(ip, now)

            res.setHeader("X-RateLimit-Limit", this.config.MAX_REQUESTS.toString())
            res.setHeader("X-RateLimit-Remaining", limit.remaining.toString())
            res.setHeader("X-RateLimit-Reset", limit.reset.toString())

            if (!limit.allowed) {
                res.setHeader("Retry-After", Math.ceil((limit.reset - now) / 1000).toString())
                res.writeHead(429, { "Content-Type": "application/json" })
                res.end(
                    JSON.stringify({
                        error: "Too Many Requests",
                        retryAfter: Math.ceil((limit.reset - now) / 1000),
                        limit: this.config.MAX_REQUESTS,
                        windowMs: this.config.WINDOW_MS,
                    }),
                )
                return
            }

            next()
        }
    }

    private checkLimit(ip: string, now: number): { allowed: boolean; remaining: number; reset: number } {
        let info = this.store.get(ip)

        if (!info || now > info.resetTime) {
            info = {
                count: 1,
                resetTime: now + this.config.WINDOW_MS,
                blocked: false,
            }
            this.store.set(ip, info)

            return {
                allowed: true,
                remaining: this.config.MAX_REQUESTS - 1,
                reset: info.resetTime,
            }
        }

        if (info.count >= this.config.MAX_REQUESTS) {
            info.blocked = true
            return {
                allowed: false,
                remaining: 0,
                reset: info.resetTime,
            }
        }

        info.count++
        this.store.set(ip, info)

        return {
            allowed: true,
            remaining: this.config.MAX_REQUESTS - info.count,
            reset: info.resetTime,
        }
    }

    private cleanup(): void {
        const now = Date.now()
        for (const [ip, info] of this.store.entries()) {
            if (now > info.resetTime + this.config.WINDOW_MS) {
                this.store.delete(ip)
            }
        }
    }

    public getStats(): { totalIPs: number; blockedIPs: number; activeRequests: number } {
        let blockedIPs = 0
        let activeRequests = 0

        for (const info of this.store.values()) {
            if (info.blocked) blockedIPs++
            activeRequests += info.count
        }

        return {
            totalIPs: this.store.size,
            blockedIPs,
            activeRequests,
        }
    }

    public destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
        }
        this.store.clear()
    }
}
