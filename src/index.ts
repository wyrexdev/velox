/**
 * @fileoverview Velox Server - Ultra Modern, Ultra Modular, Ultra Fast, Ultra Secure HTTP Server
 * @version 1.0.0
 * @author Velox Team
 * @license MIT
 */

import { VeloxServer } from "@/core/server"
import { VeloxServerOptions } from "@/types"
import { VeloxRouter } from "@/core/router"
import { FileHandler } from "@/core/file-handler"
import { RequestParser } from "@/core/request-parser"
import { VeloxLogger } from "@/utils/logger"
import { InputSanitizer } from "@/utils/sanitizer"
import { CompressionManager } from "@/utils/compression"
import { SecurityMiddleware } from "@/middleware/security"
import { RateLimiter } from "@/middleware/rate-limiter"
import { DEFAULT_SECURITY_CONFIG, SECURITY_HEADERS, FILE_SIGNATURES } from "@/config/security"
import type {
    VeloxRequest,
    VeloxHandler,
    VeloxMiddleware,
    VeloxFile,
    VeloxRouter as IVeloxRouter,
    SecurityConfig,
    FileValidationResult,
    RequestBody,
    RouteInfo,
    RouteDefinition,
    RouteMap,
    RouteCache,
    RateLimitInfo,
    LogEntry,
    WorkerMessage,
    WorkerResponse,
    ServerMetrics,
    FileJSON,
} from "@/types"

export { VeloxServer }
export { VeloxRouter }
export { FileHandler }
export { RequestParser }

export { VeloxLogger }
export { InputSanitizer }
export { CompressionManager }

export { SecurityMiddleware }
export { RateLimiter }

export { DEFAULT_SECURITY_CONFIG, SECURITY_HEADERS, FILE_SIGNATURES }

export type {
    VeloxRequest,
    VeloxHandler,
    VeloxMiddleware,
    VeloxFile,
    IVeloxRouter,
    VeloxServerOptions,
    SecurityConfig,
    FileValidationResult,
    RequestBody,
    RouteInfo,
    RouteDefinition,
    RouteMap,
    RouteCache,
    RateLimitInfo,
    LogEntry,
    WorkerMessage,
    WorkerResponse,
    ServerMetrics,
    FileJSON,
}

export function createVeloxServer(options?: VeloxServerOptions) {
    return VeloxServer.getInstance(options)
}

export async function startServer(port = 3000, options?: VeloxServerOptions) {
    const server = createVeloxServer({ port, ...options })
    await server.start()
    return server
}

export const VERSION = "1.0.0"
export const PACKAGE_NAME = "@velox/server"

export default VeloxServer

export const packageInfo = {
    name: PACKAGE_NAME,
    version: VERSION,
    description: "Ultra Modern, Ultra Modular, Ultra Fast, Ultra Secure HTTP Server",
    author: "Velox Team",
    license: "MIT",
    repository: "https://github.com/velox/velox-server",
    homepage: "https://velox-server.dev",
    bugs: "https://github.com/velox/velox-server/issues",
} as const

export const features = {
    clustering: true,
    workerThreads: true,
    fileUpload: true,
    compression: true,
    security: true,
    rateLimiting: true,
    cors: true,
    logging: true,
    metrics: true,
    streaming: true,
} as const

export function velox(options?: VeloxServerOptions) {
    return createVeloxServer(options)
}

export function createRouter(prefix?: string) {
    return new VeloxRouter(prefix)
}

export function middleware(fn: VeloxMiddleware): VeloxMiddleware {
    return fn
}

export { VeloxServer as Server }
export { VeloxRouter as Router }
export { createVeloxServer as create }
export { startServer as start }

export namespace Velox {
    export const Server = VeloxServer
    export const Router = VeloxRouter
    export const Logger = VeloxLogger
    export const create = createVeloxServer
    export const start = startServer
    export const version = VERSION
}
