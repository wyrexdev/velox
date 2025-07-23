import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { EventEmitter } from "node:events"
import cluster from "node:cluster"
import { URL } from "node:url"

import type { VeloxRequest, VeloxServerOptions, SecurityConfig, ServerMetrics, LogEntry } from "../types"
import { DEFAULT_SECURITY_CONFIG } from "../config/security"
import { VeloxLogger } from "../utils/logger"
import { CompressionManager } from "../utils/compression"
import { SecurityMiddleware } from "../middleware/security"
import { RateLimiter } from "../middleware/rate-limiter"
import { FileHandler } from "./file-handler"
import { RequestParser } from "./request-parser"
import { VeloxRouter } from "./router"
import { WorkerManager } from "../workers/worker-manager"

export class VeloxServer extends EventEmitter {
    private static instance: VeloxServer

    public router: VeloxRouter
    private config: SecurityConfig
    private logger: VeloxLogger
    private compression: CompressionManager
    private security: SecurityMiddleware
    private rateLimiter: RateLimiter
    private fileHandler: FileHandler
    private requestParser: RequestParser
    private server?: ReturnType<typeof createServer>
    private metrics: ServerMetrics
    private isShuttingDown = false
    private requestCounter = 0
    private workerManager?: WorkerManager

    public readonly port: number
    public readonly host: string
    public readonly uploadDir: string
    public readonly isProduction: boolean

    constructor(options: VeloxServerOptions = {}) {
        super()

        this.port = options.port || Number.parseInt(process.env.PORT || "3000", 10)
        this.host = options.host || "0.0.0.0"
        this.uploadDir = options.uploadDir || "./uploads"
        this.isProduction = options.isProduction ?? process.env.NODE_ENV === "production"

        this.config = { ...DEFAULT_SECURITY_CONFIG, ...options.security }

        this.logger = new VeloxLogger(this.config.LOGGING)
        this.compression = new CompressionManager(this.config.COMPRESSION)
        this.security = new SecurityMiddleware(this.config)
        this.rateLimiter = new RateLimiter(this.config.RATE_LIMIT)
        this.fileHandler = new FileHandler(this.config, this.uploadDir)
        this.requestParser = new RequestParser(this.fileHandler, this.config)
        this.router = new VeloxRouter()

        this.metrics = {
            requests: { total: 0, success: 0, errors: 0, avgResponseTime: 0 },
            files: { uploaded: 0, totalSize: 0, avgSize: 0 },
            memory: { used: 0, total: 0, percentage: 0 },
            uptime: 0,
        }

        this.applyDefaultMiddleware()

        this.setupGracefulShutdown()

        if (options.customMiddleware) {
            options.customMiddleware.forEach((middleware) => {
                this.router.use(middleware)
            })
        }

        if (this.config.WORKER_THREADS > 0) {
            this.workerManager = new WorkerManager(this.config, this.logger)
        }
    }

    public static getInstance(options?: VeloxServerOptions): VeloxServer {
        if (!VeloxServer.instance) {
            VeloxServer.instance = new VeloxServer(options)
        }
        return VeloxServer.instance
    }

    public enableLogging(): void {
        this.logger.enable()
    }

    public disableLogging(): void {
        this.logger.disable()
    }

    public toggleLogging(): boolean {
        return this.logger.toggle()
    }

    public setLogLevel(level: "debug" | "info" | "warn" | "error"): void {
        this.logger.setLevel(level)
    }

    public setLogFormat(format: "json" | "text"): void {
        this.logger.setFormat(format)
    }

    public isLoggingEnabled(): boolean {
        return this.logger.isLoggerEnabled()
    }

    private applyDefaultMiddleware(): void {
        this.router.use(this.security.headers())
        this.router.use(this.security.cors())
        this.router.use(this.rateLimiter.middleware())
        this.router.use(this.security.contentTypeValidation())
        this.router.use(this.security.requestSizeLimit())
        this.router.use(this.security.ipValidation())
    }

    private setupGracefulShutdown(): void {
        const shutdown = () => {
            if (this.isShuttingDown) return
            this.gracefulShutdown()
        }

        process.on("SIGTERM", shutdown)
        process.on("SIGINT", shutdown)
        process.on("SIGUSR2", shutdown) // For nodemon
    }

    public async start(): Promise<void> {
        if (this.config.CLUSTER_MODE && cluster.isPrimary) {
            await this.startCluster()
        } else {
            await this.startServer()
        }
    }

    private async startCluster(): Promise<void> {
        const numWorkers = this.config.WORKER_THREADS

        this.logger.info(`Starting VELOX server in cluster mode with ${numWorkers} workers`)

        for (let i = 0; i < numWorkers; i++) {
            const worker = cluster.fork()
            worker.on("exit", (code, signal) => {
                if (!this.isShuttingDown) {
                    this.logger.warn(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`)
                    cluster.fork()
                }
            })
        }

        cluster.on("exit", (worker, code, signal) => {
            if (!this.isShuttingDown) {
                this.logger.warn(`Worker ${worker.process.pid} died. Spawning a new one...`)
                cluster.fork()
            }
        })

        setInterval(() => {
            this.updateMetrics()
        }, 30000)
    }

    private async startServer(): Promise<void> {
        this.server = createServer(async (req, res) => {
            await this.handleRequest(req, res)
        })

        this.server.on("error", (err: NodeJS.ErrnoException) => {
            this.logger.error("Server error:", err)

            if (err.code === "EADDRINUSE") {
                this.logger.error(`Port ${this.port} is already in use`)
                process.exit(1)
            }
        })

        this.server.on("clientError", (err, socket) => {
            this.logger.warn("Client error:", err)
            socket.end("HTTP/1.1 400 Bad Request\r\n\r\n")
        })

        return new Promise((resolve, reject) => {
            this.server!.listen(this.port, this.host, () => {
                this.logger.info(`🚀 VELOX Server running on http://${this.host}:${this.port}`)
                this.logger.info(`📁 Upload Directory: ${this.uploadDir}`)
                this.logger.info(`🔒 Security Level: ${this.isProduction ? "PRODUCTION" : "DEVELOPMENT"}`)
                this.logger.info(`⚡ Environment: ${process.env.NODE_ENV || "development"}`)
                this.logger.info(`🆔 Process ID: ${process.pid}`)

                if (cluster.isWorker) {
                    this.logger.info(`👷 Worker ID: ${cluster.worker?.id}`)
                }

                this.emit("ready")
                resolve()
            })

            this.server!.on("error", reject)
        })
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const requestId = (++this.requestCounter).toString().padStart(8, "0")
        const startTime = process.hrtime()

        const veloxReq = this.createVeloxRequest(req, requestId, startTime)

        veloxReq.ip = this.getClientIp(veloxReq)

        try {
            const method = veloxReq.method?.toUpperCase() || "GET"
            const url = new URL(veloxReq.url || "/", `http://${veloxReq.headers.host}`)
            const path = url.pathname

            veloxReq.query = Object.fromEntries(url.searchParams.entries())

            const { handler, middleware, params, route } = this.router.findRoute(method, path)

            if (handler) {
                veloxReq.params = params
                veloxReq.route = route

                if (["POST", "PUT", "PATCH"].includes(method)) {
                    await this.requestParser.parseBody(veloxReq)
                }

                await this.router.executeMiddlewareChain(veloxReq, res, middleware, handler)

                this.updateRequestMetrics(true, startTime)
            } else {
                this.sendJson(res, 404, {
                    error: "Not Found",
                    message: `Route ${method} ${path} not found`,
                    timestamp: new Date().toISOString(),
                })
                this.updateRequestMetrics(false, startTime)
            }
        } catch (error) {
            this.logger.error("Request processing error:", error)

            if (!res.headersSent) {
                this.sendJson(res, 500, {
                    error: "Internal Server Error",
                    message: this.isProduction ? "Something went wrong" : (error as Error).message,
                    timestamp: new Date().toISOString(),
                })
            }

            this.updateRequestMetrics(false, startTime)
        } finally {
            const duration = process.hrtime(startTime)
            const durationMs = duration[0] * 1000 + duration[1] / 1e6

            const logEntry: LogEntry = {
                timestamp: new Date(),
                requestId,
                method: veloxReq.method || "UNKNOWN",
                path: veloxReq.url || "/",
                statusCode: res.statusCode,
                duration: durationMs,
                ip: veloxReq.ip,
                userAgent: veloxReq.headers["user-agent"],
                referer: veloxReq.headers.referer,
                size: Number.parseInt(res.getHeader("content-length") as string) || undefined,
            }

            this.logger.logRequest(logEntry)
        }
    }

    private createVeloxRequest(req: IncomingMessage, requestId: string, startTime: [number, number]): VeloxRequest {
        const veloxReq = req as VeloxRequest

        veloxReq.id = requestId
        veloxReq.startTime = startTime
        veloxReq.params = {}
        veloxReq.query = {}
        veloxReq.body = { fields: {}, files: {} }
        veloxReq.files = {}
        veloxReq.cookies = {}
        veloxReq.ip = ""

        veloxReq.file = (name: string) => veloxReq.files[name]
        veloxReq.get = (header: string) => veloxReq.headers[header.toLowerCase()] as string | undefined
        veloxReq.accepts = (type: string) => {
            const accept = veloxReq.headers.accept || ""
            return accept.includes(type) || accept.includes("*/*")
        }
        veloxReq.is = (type: string) => {
            const contentType = veloxReq.headers["content-type"] || ""
            return contentType.includes(type)
        }

        veloxReq.xhr = veloxReq.headers["x-requested-with"] === "XMLHttpRequest"
        veloxReq.secure =
            veloxReq.headers["x-forwarded-proto"] === "https" || (veloxReq.connection as any).encrypted === true
        veloxReq.protocol = veloxReq.secure ? "https" : "http"
        veloxReq.hostname = veloxReq.headers.host?.split(":")[0] || "localhost"

        const cookieHeader = veloxReq.headers.cookie
        if (cookieHeader) {
            veloxReq.cookies = this.parseCookies(cookieHeader)
        }

        return veloxReq
    }

    private parseCookies(cookieHeader: string): Record<string, string> {
        const cookies: Record<string, string> = {}

        cookieHeader.split(";").forEach((cookie) => {
            const [name, ...rest] = cookie.trim().split("=")
            if (name && rest.length > 0) {
                cookies[name] = decodeURIComponent(rest.join("="))
            }
        })

        return cookies
    }

    private getClientIp(req: VeloxRequest): string {
        const forwardedFor = req.headers["x-forwarded-for"] as string
        const realIp = req.headers["x-real-ip"] as string
        const cfConnectingIp = req.headers["cf-connecting-ip"] as string
        const socketIp = req.socket.remoteAddress

        let clientIp = socketIp || "unknown"

        if (forwardedFor && this.isTrustedProxy(socketIp || "")) {
            clientIp = forwardedFor.split(",")[0].trim()
        } else if (realIp && this.isTrustedProxy(socketIp || "")) {
            clientIp = realIp
        } else if (cfConnectingIp) {
            clientIp = cfConnectingIp
        }

        if (clientIp.startsWith("::ffff:")) {
            clientIp = clientIp.substring(7)
        }

        return clientIp
    }

    private isTrustedProxy(ip: string): boolean {
        return this.config.TRUSTED_PROXIES.some((proxy) => {
            if (proxy.includes("/")) {
                const [subnet, bits] = proxy.split("/")
                return ip.startsWith(
                    subnet
                        .split(".")
                        .slice(0, Math.floor(Number.parseInt(bits) / 8))
                        .join("."),
                )
            }
            return ip === proxy
        })
    }

    private updateRequestMetrics(success: boolean, startTime: [number, number]): void {
        const duration = process.hrtime(startTime)
        const durationMs = duration[0] * 1000 + duration[1] / 1e6

        this.metrics.requests.total++

        if (success) {
            this.metrics.requests.success++
        } else {
            this.metrics.requests.errors++
        }

        const totalRequests = this.metrics.requests.total
        this.metrics.requests.avgResponseTime =
            (this.metrics.requests.avgResponseTime * (totalRequests - 1) + durationMs) / totalRequests
    }

    private updateMetrics(): void {
        const memUsage = process.memoryUsage()
        this.metrics.memory = {
            used: memUsage.heapUsed,
            total: memUsage.heapTotal,
            percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        }

        this.metrics.uptime = process.uptime()
    }

    public sendJson(res: ServerResponse, status: number, data: any): void {
        const json = this.isProduction ? JSON.stringify(data) : JSON.stringify(data, null, 2)

        const buffer = Buffer.from(json, "utf8")

        res.setHeader("Content-Type", "application/json; charset=utf-8")
        res.setHeader("Content-Length", buffer.length)

        const acceptEncoding = res.req.headers["accept-encoding"] || ""
        const compressionStream = this.compression.getCompressionStream(acceptEncoding)

        if (compressionStream && this.compression.shouldCompress(buffer.length, "application/json")) {
            const encoding = this.compression.getCompressionEncoding(acceptEncoding)
            if (encoding) {
                res.setHeader("Content-Encoding", encoding)
            }
        }

        res.writeHead(status)
        res.end(buffer)
    }

    public sendFile(
        res: ServerResponse,
        filePath: string,
        options: {
            download?: boolean
            filename?: string
            cacheControl?: string
            maxAge?: number
        } = {},
    ): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const fileInfo = this.fileHandler.getFileInfo(filePath)

                if (!fileInfo.exists) {
                    this.sendJson(res, 404, { error: "File not found" })
                    resolve()
                    return
                }

                const {
                    download = false,
                    filename,
                    cacheControl = this.isProduction ? "public, max-age=31536000" : "no-cache",
                    maxAge = 31536000,
                } = options

                res.setHeader("Cache-Control", cacheControl)
                res.setHeader("Last-Modified", fileInfo.mtime!.toUTCString())

                if (download) {
                    const disposition = filename ? `attachment; filename="${filename}"` : "attachment"
                    res.setHeader("Content-Disposition", disposition)
                }

                const fileStream = await this.fileHandler.getFileStream(filePath)

                const acceptEncoding = res.req.headers["accept-encoding"] || ""
                const compressionStream = this.compression.getCompressionStream(acceptEncoding)

                if (
                    compressionStream &&
                    fileInfo.size &&
                    this.compression.shouldCompress(fileInfo.size, "application/octet-stream")
                ) {
                    const encoding = this.compression.getCompressionEncoding(acceptEncoding)
                    if (encoding) {
                        res.setHeader("Content-Encoding", encoding)
                    }
                    fileStream.pipe(compressionStream).pipe(res)
                } else {
                    res.setHeader("Content-Length", fileInfo.size!.toString())
                    fileStream.pipe(res)
                }

                fileStream.on("error", (err) => {
                    this.logger.error("File stream error:", err)
                    if (!res.headersSent) {
                        this.sendJson(res, 500, { error: "File read error" })
                    }
                    reject(err)
                })

                res.on("finish", () => {
                    resolve()
                })
            } catch (error) {
                this.logger.error("Send file error:", error)
                if (!res.headersSent) {
                    this.sendJson(res, 500, { error: "Internal server error" })
                }
                reject(error)
            }
        })
    }

    public async executeWorkerTask<T = any>(task: {
        type: "file-validation" | "file-processing" | "image-resize" | "data-processing"
        data: any
        timeout?: number
    }): Promise<T> {
        if (!this.workerManager) {
            throw new Error("Worker threads devre dışı")
        }

        const taskId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
        return this.workerManager.executeTask({
            id: taskId,
            ...task,
        })
    }

    public getWorkerStats() {
        return this.workerManager?.getStats() || null
    }

    public async checkWorkerHealth(): Promise<boolean> {
        return this.workerManager?.healthCheck() || false
    }

    public get(
        path: string,
        handler: Parameters<VeloxRouter["get"]>[1],
        ...middleware: Parameters<VeloxRouter["get"]>[2][]
    ): this {
        this.router.get(path, handler, ...middleware)
        return this
    }

    public post(
        path: string,
        handler: Parameters<VeloxRouter["post"]>[1],
        ...middleware: Parameters<VeloxRouter["post"]>[2][]
    ): this {
        this.router.post(path, handler, ...middleware)
        return this
    }

    public put(
        path: string,
        handler: Parameters<VeloxRouter["put"]>[1],
        ...middleware: Parameters<VeloxRouter["put"]>[2][]
    ): this {
        this.router.put(path, handler, ...middleware)
        return this
    }

    public delete(
        path: string,
        handler: Parameters<VeloxRouter["delete"]>[1],
        ...middleware: Parameters<VeloxRouter["delete"]>[2][]
    ): this {
        this.router.delete(path, handler, ...middleware)
        return this
    }

    public patch(
        path: string,
        handler: Parameters<VeloxRouter["patch"]>[1],
        ...middleware: Parameters<VeloxRouter["patch"]>[2][]
    ): this {
        this.router.patch(path, handler, ...middleware)
        return this
    }

    public use(middleware: Parameters<VeloxRouter["use"]>[0]): this {
        this.router.use(middleware)
        return this
    }

    public mount(basePath: string, router: VeloxRouter): this {
        this.router.mount(basePath, router)
        return this
    }

    public getMetrics(): ServerMetrics {
        this.updateMetrics()
        return { ...this.metrics }
    }

    public getRoutes(): ReturnType<VeloxRouter["getRoutes"]> {
        return this.router.getRoutes()
    }

    public getRateLimitStats() {
        return this.rateLimiter.getStats()
    }

    private async gracefulShutdown(): Promise<void> {
        if (this.isShuttingDown) return

        this.isShuttingDown = true
        this.logger.info("🛑 Graceful shutdown initiated...")

        if (this.server) {
            this.server.close(() => {
                this.logger.info("✅ HTTP server closed")
            })
        }

        try {
            this.rateLimiter.destroy()
            this.fileHandler.destroy()

            if (this.workerManager) {
                await this.workerManager.shutdown()
            }

            this.logger.info("✅ Resources cleaned up")
            this.logger.info("👋 VELOX Server shutdown complete")

            process.exit(0)
        } catch (error) {
            this.logger.error("❌ Error during shutdown:", error)
            process.exit(1)
        }
    }

    public async stop(): Promise<void> {
        await this.gracefulShutdown()
    }
}

export type { VeloxServerOptions }
