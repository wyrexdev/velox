import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { EventEmitter } from "node:events"
import { URL } from "node:url"
import cluster from "node:cluster"
import type { VeloxRequest, VeloxServerOptions, SecurityConfig, ServerMetrics, LogEntry } from "../types"
import { FastJSON } from "../utils/fast-json"
import { FastRouter } from "../utils/fast-router"
import { FastHeaders } from "../utils/fast-headers"
import { VeloxLogger } from "../utils/logger"
import { CompressionManager } from "../utils/compression"
import { SecurityMiddleware } from "../middleware/security"
import { RateLimiter } from "../middleware/rate-limiter"
import { FileHandler } from "./file-handler"
import { RequestParser } from "./request-parser"
import { VeloxRouter } from "./router"
import { DEFAULT_SECURITY_CONFIG } from "../config/security"

export class UltraFastServer extends EventEmitter {
    private static instance: UltraFastServer

    private fastRouter = new FastRouter()
    private router = new VeloxRouter()
    private config: SecurityConfig
    private logger: VeloxLogger
    private compression: CompressionManager
    private security: SecurityMiddleware
    private rateLimiter: RateLimiter
    private fileHandler: FileHandler
    private requestParser: RequestParser
    private server?: ReturnType<typeof createServer>
    private requestCounter = 0
    private metrics: ServerMetrics
    private isShuttingDown = false

    private static readonly EMPTY_OBJECT_BUFFER = Buffer.from("{}", "utf8")
    private static readonly SUCCESS_RESPONSE_BUFFER = Buffer.from('{"success":true}', "utf8")

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

        this.metrics = {
            requests: { total: 0, success: 0, errors: 0, avgResponseTime: 0 },
            files: { uploaded: 0, totalSize: 0, avgSize: 0 },
            memory: { used: 0, total: 0, percentage: 0 },
            uptime: 0,
        }

        this.applyDefaultMiddleware()

        this.setupGracefulShutdown()
    }

    public static getInstance(options?: VeloxServerOptions): UltraFastServer {
        if (!UltraFastServer.instance) {
            UltraFastServer.instance = new UltraFastServer(options)
        }
        return UltraFastServer.instance
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
        process.on("SIGUSR2", shutdown)
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

        this.logger.info(`Starting Velox server in cluster mode with ${numWorkers} workers`)

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
        this.server = createServer((req, res) => {
            this.handleRequest(req, res)
        })

        this.server.maxHeadersCount = 20
        this.server.timeout = 30000
        this.server.keepAliveTimeout = 5000
        this.server.headersTimeout = 60000

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

    private handleRequest(req: IncomingMessage, res: ServerResponse): void {
        const requestId = (++this.requestCounter).toString()
        const method = req.method!
        const url = req.url!
        const startTime = process.hrtime()

        if (method === "GET" && (url === "/" || url === "/health")) {
            this.handleFastRoute(req, res, requestId, method, url, startTime)
            return
        }

        this.handleFullRoute(req, res, requestId, method, url, startTime)
    }

    private handleFastRoute(
        req: IncomingMessage,
        res: ServerResponse,
        requestId: string,
        method: string,
        url: string,
        startTime: [number, number]
    ): void {
        const queryIndex = url.indexOf("?")
        const path = queryIndex === -1 ? url : url.slice(0, queryIndex)

        const route = this.fastRouter.findRoute(method, path)

        if (!route) {
            this.send404(res)
            this.logRequest(requestId, method, url, 404, startTime, req)
            return
        }

        const veloxReq = this.createMinimalRequest(req, requestId, path, queryIndex === -1 ? "" : url.slice(queryIndex + 1))

        if (route.params) {
            veloxReq.params = route.params
        }

        try {
            const result = route.handler(veloxReq, res)
            if (result instanceof Promise) {
                result.catch((err) => this.handleError(res, err))
            }
            this.updateRequestMetrics(true, startTime)
            this.logRequest(requestId, method, url, res.statusCode, startTime, req)
        } catch (err) {
            this.handleError(res, err)
            this.updateRequestMetrics(false, startTime)
            this.logRequest(requestId, method, url, 500, startTime, req)
        }
    }

    private async handleFullRoute(
        req: IncomingMessage,
        res: ServerResponse,
        requestId: string,
        method: string,
        url: string,
        startTime: [number, number]
    ): Promise<void> {
        const veloxReq = this.createVeloxRequest(req, requestId, startTime)

        veloxReq.ip = this.getClientIp(veloxReq)

        try {
            const urlObj = new URL(url, `http://${veloxReq.headers.host}`)
            const path = urlObj.pathname

            veloxReq.query = Object.fromEntries(urlObj.searchParams.entries())

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
            this.logRequest(requestId, method, url, res.statusCode, startTime, req)
        }
    }

    private createMinimalRequest(
        req: IncomingMessage,
        requestId: string,
        path: string,
        queryString: string,
    ): VeloxRequest {
        const veloxReq = req as VeloxRequest

        veloxReq.id = requestId
        veloxReq.params = {}
        veloxReq.query = queryString ? this.parseQueryFast(queryString) : {}
        veloxReq.body = { fields: {}, files: {} }
        veloxReq.files = {}
        veloxReq.ip = req.socket.remoteAddress || "unknown"

        return veloxReq
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

    private parseQueryFast(queryString: string): Record<string, string> {
        const params: Record<string, string> = {}

        if (!queryString) return params

        const pairs = queryString.split("&")
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i]
            const eqIndex = pair.indexOf("=")

            if (eqIndex === -1) {
                params[pair] = ""
            } else {
                const key = pair.slice(0, eqIndex)
                const value = pair.slice(eqIndex + 1)
                params[decodeURIComponent(key)] = decodeURIComponent(value)
            }
        }

        return params
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

    private logRequest(
        requestId: string,
        method: string,
        url: string,
        statusCode: number,
        startTime: [number, number],
        req: IncomingMessage
    ): void {
        const duration = process.hrtime(startTime)
        const durationMs = duration[0] * 1000 + duration[1] / 1e6

        const logEntry: LogEntry = {
            timestamp: new Date(),
            requestId,
            method,
            path: url,
            statusCode,
            duration: durationMs,
            ip: req.socket.remoteAddress || "unknown",
            userAgent: req.headers["user-agent"],
            referer: req.headers.referer,
            size: undefined,
        }

        this.logger.logRequest(logEntry)
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

    public sendFastJSON(res: ServerResponse, status: number, data: any): void {
        const jsonBuffer = Buffer.from(FastJSON.stringify(data), "utf8")
        const headerBuffer = FastHeaders.buildResponseHeaders(status, jsonBuffer.length)

        res.socket?.write(Buffer.concat([headerBuffer, jsonBuffer]))
        res.end()
    }

    public sendPrebuiltResponse(res: ServerResponse, status: number, bodyBuffer: Buffer): void {
        const headerBuffer = FastHeaders.buildResponseHeaders(status, bodyBuffer.length)
        res.socket?.write(Buffer.concat([headerBuffer, bodyBuffer]))
        res.end()
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

    private send404(res: ServerResponse): void {
        const body = Buffer.from('{"error":"Not Found","code":404}', "utf8")
        const headers = FastHeaders.buildResponseHeaders(404, body.length)
        res.socket?.write(Buffer.concat([headers, body]))
        res.end()
    }

    private handleError(res: ServerResponse, error: any): void {
        if (res.headersSent) return

        const body = Buffer.from(`{"error":"Internal Server Error","message":"${error.message}"}`, "utf8")
        const headers = FastHeaders.buildResponseHeaders(500, body.length)
        res.socket?.write(Buffer.concat([headers, body]))
        res.end()
    }

    public get(path: string, handler: Parameters<FastRouter["addRoute"]>[2]): this {
        this.fastRouter.addRoute("GET", path, handler)
        this.router.get(path, handler)
        return this
    }

    public post(path: string, handler: Parameters<FastRouter["addRoute"]>[2]): this {
        this.fastRouter.addRoute("POST", path, handler)
        this.router.post(path, handler)
        return this
    }

    public put(path: string, handler: Parameters<FastRouter["addRoute"]>[2]): this {
        this.fastRouter.addRoute("PUT", path, handler)
        this.router.put(path, handler)
        return this
    }

    public delete(path: string, handler: Parameters<FastRouter["addRoute"]>[2]): this {
        this.fastRouter.addRoute("DELETE", path, handler)
        this.router.delete(path, handler)
        return this
    }

    public patch(path: string, handler: Parameters<FastRouter["addRoute"]>[2]): this {
        this.fastRouter.addRoute("PATCH", path, handler)
        this.router.patch(path, handler)
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
