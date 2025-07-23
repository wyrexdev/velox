import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { EventEmitter } from "node:events"
import type { VeloxRequest, VeloxServerOptions, SecurityConfig } from "../types"
import { FastJSON } from "../utils/fast-json"
import { FastRouter } from "../utils/fast-router"
import { FastHeaders } from "../utils/fast-headers"
import { DEFAULT_SECURITY_CONFIG } from "../config/security"

export class UltraFastServer extends EventEmitter {
    private router = new FastRouter()
    private config: SecurityConfig
    private server?: ReturnType<typeof createServer>
    private requestCounter = 0

    private static readonly EMPTY_OBJECT_BUFFER = Buffer.from("{}", "utf8")
    private static readonly SUCCESS_RESPONSE_BUFFER = Buffer.from('{"success":true}', "utf8")

    public readonly port: number
    public readonly host: string

    constructor(options: VeloxServerOptions = {}) {
        super()

        this.port = options.port || 3000
        this.host = options.host || "0.0.0.0"
        this.config = { ...DEFAULT_SECURITY_CONFIG, ...options.security }
    }

    public async start(): Promise<void> {
        this.server = createServer((req, res) => {
            this.handleRequestUltraFast(req, res)
        })

        this.server.maxHeadersCount = 20
        this.server.timeout = 30000
        this.server.keepAliveTimeout = 5000
        this.server.headersTimeout = 60000

        return new Promise((resolve, reject) => {
            this.server!.listen(this.port, this.host, () => {
                console.log(`🚀 ULTRA-FAST VELOX Server running on http://${this.host}:${this.port}`)
                resolve()
            })
            this.server!.on("error", reject)
        })
    }

    private handleRequestUltraFast(req: IncomingMessage, res: ServerResponse): void {
        const requestId = (++this.requestCounter).toString()
        const method = req.method!
        const url = req.url!

        if (method === "GET" && url === "/") {
            this.sendFastJSON(res, 200, { message: "ULTRA-FAST VELOX!", timestamp: Date.now() })
            return
        }

        if (method === "GET" && url === "/health") {
            this.sendPrebuiltResponse(res, 200, UltraFastServer.SUCCESS_RESPONSE_BUFFER)
            return
        }

        const queryIndex = url.indexOf("?")
        const path = queryIndex === -1 ? url : url.slice(0, queryIndex)

        const route = this.router.findRoute(method, path)

        if (!route) {
            this.send404(res)
            return
        }

        const veloxReq = this.createMinimalRequest(req, requestId, path, queryIndex === -1 ? "" : url.slice(queryIndex + 1))

        try {
            const result = route.handler(veloxReq, res)
            if (result instanceof Promise) {
                result.catch((err) => this.handleError(res, err))
            }
        } catch (err) {
            this.handleError(res, err)
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
        this.router.addRoute("GET", path, handler)
        return this
    }

    public post(path: string, handler: Parameters<FastRouter["addRoute"]>[2]): this {
        this.router.addRoute("POST", path, handler)
        return this
    }

    public put(path: string, handler: Parameters<FastRouter["addRoute"]>[2]): this {
        this.router.addRoute("PUT", path, handler)
        return this
    }

    public delete(path: string, handler: Parameters<FastRouter["addRoute"]>[2]): this {
        this.router.addRoute("DELETE", path, handler)
        return this
    }
}
