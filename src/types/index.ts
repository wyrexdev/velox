import type { IncomingMessage, ServerResponse } from "node:http"
import type { Readable } from "node:stream"

export interface SecurityConfig {
    MAX_FILE_SIZE: number
    ALLOWED_MIME_TYPES: string[]
    RATE_LIMIT: {
        WINDOW_MS: number
        MAX_REQUESTS: number
    }
    CORS: {
        ALLOWED_ORIGINS: string[]
        METHODS: string[]
        ALLOW_CREDENTIALS: boolean
    }
    TRUSTED_PROXIES: string[]
    FILE_HASHING: boolean
    FILE_VIRUS_SCAN: boolean
    CLUSTER_MODE: boolean
    WORKER_THREADS: number
    COMPRESSION: {
        ENABLED: boolean
        THRESHOLD: number
        LEVEL: number
    }
    LOGGING: {
        ENABLED: boolean
        LEVEL: "debug" | "info" | "warn" | "error"
        FORMAT: "json" | "text"
    }
}

export interface FileJSON {
    name: string
    mimetype: string
    size: number
    encoding: BufferEncoding
    truncated: boolean
    hash?: string
    uploadedAt: Date
}

export interface FileValidationResult {
    valid: boolean
    error?: string
    hash?: string
    scanResult?: {
        clean: boolean
        threats?: string[]
    }
}

export interface VeloxFile extends FileJSON {
    data: Buffer
    mv: (path: string, callback: (err?: Error) => void) => void
    save: (path: string) => Promise<{ path: string; hash?: string; url?: string }>
    toJSON: () => FileJSON
    stream: () => Readable
    validate: () => Promise<FileValidationResult>
}

export interface RequestBody {
    fields: Record<string, string>
    files: Record<string, VeloxFile>
}

export interface VeloxRequest extends IncomingMessage {
    params: Record<string, string>
    query: Record<string, string>
    body: RequestBody
    file: (name: string) => VeloxFile | undefined
    files: Record<string, VeloxFile>
    ip: string
    secure: boolean
    hostname: string
    protocol: "http" | "https"
    xhr: boolean
    cookies: Record<string, string>
    get: (header: string) => string | undefined
    accepts: (type: string) => boolean
    is: (type: string) => boolean
    route?: RouteInfo
    id: string
    startTime: [number, number]
    user?: any
    session?: any
}

export interface RouteInfo {
    path: string
    method: string
    params: Record<string, string>
    middleware: string[]
}

export type VeloxHandler = (req: VeloxRequest, res: ServerResponse) => Promise<void> | void
export type VeloxMiddleware = (
    req: VeloxRequest,
    res: ServerResponse,
    next: (err?: Error) => void,
) => void | Promise<void>

export interface RouteDefinition {
    handler: VeloxHandler
    middleware: VeloxMiddleware[]
    meta?: {
        description?: string
        tags?: string[]
        rateLimit?: number
        auth?: boolean
    }
}

export interface RouteMap {
    [path: string]: RouteDefinition
}

export interface VeloxRouter {
    routes: {
        GET: RouteMap
        POST: RouteMap
        PUT: RouteMap
        DELETE: RouteMap
        PATCH: RouteMap
        HEAD: RouteMap
        OPTIONS: RouteMap
    }
    prefix?: string
    middleware: VeloxMiddleware[]
    meta?: {
        name?: string
        version?: string
        description?: string
    }
}

export interface RouteCache {
    [method: string]: {
        [path: string]: {
            handler: VeloxHandler
            middleware: VeloxMiddleware[]
            paramNames: string[]
            regex?: RegExp
            meta?: any
        }
    }
}

export interface RateLimitInfo {
    count: number
    resetTime: number
    blocked: boolean
}

export interface LogEntry {
    timestamp: Date
    requestId: string
    method: string
    path: string
    statusCode: number
    duration: number
    ip: string
    userAgent?: string
    referer?: string
    size?: number
}

export interface WorkerMessage {
    type: "file-validation" | "file-processing" | "image-resize" | "data-processing" | "shutdown" | "health-check"
    data?: any
    requestId?: string
}

export interface WorkerResponse {
    success: boolean
    data?: any
    error?: string
    requestId?: string
}

export interface ServerMetrics {
    requests: {
        total: number
        success: number
        errors: number
        avgResponseTime: number
    }
    files: {
        uploaded: number
        totalSize: number
        avgSize: number
    }
    memory: {
        used: number
        total: number
        percentage: number
    }
    uptime: number
}

export interface VeloxServerOptions {
    port?: number
    host?: string
    uploadDir?: string
    isProduction?: boolean
    security?: Partial<SecurityConfig>
    enableMetrics?: boolean
    enableHealthCheck?: boolean
    customMiddleware?: VeloxMiddleware[]
}

export interface WorkerTask {
    id: string
    type: "file-validation" | "file-processing" | "image-resize" | "data-processing"
    data: any
    timeout?: number
}
