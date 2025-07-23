/**
 * @fileoverview VELOX Server - Ultra Modern, Ultra Modular, Ultra Fast, Ultra Secure HTTP Server
 * @version 1.0.0
 * @author VELOX Team
 * @license MIT
 */

import { VeloxServer } from "./core/server"
import { UltraFastServer } from "./core/ultra-fast-server"
import { VeloxRouter } from "./core/router"
import { FileHandler } from "./core/file-handler"
import { RequestParser } from "./core/request-parser"
import { VeloxLogger } from "./utils/logger"
import { InputSanitizer } from "./utils/sanitizer"
import { CompressionManager } from "./utils/compression"
import { FastJSON } from "./utils/fast-json"
import { ResponsePool } from "./utils/response-pool"
import { FastHeaders } from "./utils/fast-headers"
import { FastRouter } from "./utils/fast-router"
import { SecurityMiddleware } from "./middleware/security"
import { RateLimiter } from "./middleware/rate-limiter"
import { DEFAULT_SECURITY_CONFIG, SECURITY_HEADERS, FILE_SIGNATURES } from "./config/security"
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
} from "./types"

// Core exports
export { VeloxServer }
export { UltraFastServer }
export { VeloxRouter }
export { FileHandler }
export { RequestParser }

// Utility exports
export { VeloxLogger }
export { InputSanitizer }
export { CompressionManager }
export { FastJSON }
export { ResponsePool }
export { FastHeaders }
export { FastRouter }

// Middleware exports
export { SecurityMiddleware }
export { RateLimiter }

// Configuration exports
export { DEFAULT_SECURITY_CONFIG, SECURITY_HEADERS, FILE_SIGNATURES }

// Type exports
export type {
    VeloxRequest,
    VeloxHandler,
    VeloxMiddleware,
    VeloxFile,
    IVeloxRouter,
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

// Main factory functions
export function createVeloxServer(options?: any) {
    return VeloxServer.getInstance(options)
}

export function createUltraFastServer(options?: any) {
    return new UltraFastServer(options)
}

// Quick start functions
export async function startServer(port = 3000, options?: any) {
    const server = createVeloxServer({ port, ...options })
    await server.start()
    return server
}

export async function startUltraFastServer(port = 3000, options?: any) {
    const server = createUltraFastServer({ port, ...options })
    await server.start()
    return server
}

// Version information
export const VERSION = "1.0.0"
export const PACKAGE_NAME = "@velox/server"

// Default export for CommonJS compatibility
export default VeloxServer

// Package metadata
export const packageInfo = {
    name: PACKAGE_NAME,
    version: VERSION,
    description: "Ultra Modern, Ultra Modular, Ultra Fast, Ultra Secure HTTP Server",
    author: "VELOX Team",
    license: "MIT",
    repository: "https://github.com/velox/velox-server",
    homepage: "https://velox-server.dev",
    bugs: "https://github.com/velox/velox-server/issues",
} as const

// Feature flags
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
    ultraFast: true,
} as const

/**
 * Initialize ULTRA-FAST VELOX server
 * @param options - Server configuration options
 * @returns Configured UltraFastServer instance
 */
export function ultraFast(options?: any) {
    return createUltraFastServer(options)
}

/**
 * Create a new ultra-fast router instance
 * @param prefix - Optional path prefix for all routes
 * @returns New FastRouter instance
 */
export function createFastRouter(prefix?: string) {
    return new FastRouter(prefix)
}

// Re-export for convenience (without duplicate FastRouter)
export { VeloxServer as Server }
export { UltraFastServer as UltraServer }
export { VeloxRouter as Router }
export { createVeloxServer as create }
export { createUltraFastServer as createUltra }
export { startServer as start }
export { startUltraFastServer as startUltra }

// Namespace export for organized imports
export namespace Velox {
    export const Server = VeloxServer
    export const UltraServer = UltraFastServer
    export const Router = VeloxRouter
    export const Logger = VeloxLogger
    export const JSON = FastJSON
    export const create = createVeloxServer
    export const createUltra = createUltraFastServer
    export const start = startServer
    export const startUltra = startUltraFastServer
    export const version = VERSION
}
