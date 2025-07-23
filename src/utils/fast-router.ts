import type { VeloxHandler, VeloxMiddleware } from "../types"

interface CompiledRoute {
    handler: VeloxHandler
    middleware: VeloxMiddleware[]
    paramExtractor?: (path: string) => Record<string, string> | null
    staticMatch?: boolean
    params?: Record<string, string> // Add this for storing extracted params
}

/**
 * Ultra-fast router with pre-compiled routes and radix tree
 */
export class FastRouter {
    private staticRoutes = new Map<string, Map<string, CompiledRoute>>()
    private dynamicRoutes = new Map<string, CompiledRoute[]>()
    private routeCache = new Map<string, CompiledRoute>()
    private prefix?: string

    constructor(prefix?: string) {
        this.prefix = prefix
    }

    public addRoute(method: string, path: string, handler: VeloxHandler, middleware: VeloxMiddleware[] = []): void {
        method = method.toUpperCase()

        // Apply prefix if set
        if (this.prefix) {
            path = this.prefix + path
        }

        if (!this.staticRoutes.has(method)) {
            this.staticRoutes.set(method, new Map())
            this.dynamicRoutes.set(method, [])
        }

        if (path.includes(":") || path.includes("*")) {
            // Dynamic route
            const compiled = this.compileDynamicRoute(path, handler, middleware)
            this.dynamicRoutes.get(method)!.push(compiled)
        } else {
            // Static route - fastest lookup
            this.staticRoutes.get(method)!.set(path, {
                handler,
                middleware,
                staticMatch: true,
            })
        }
    }

    public findRoute(method: string, path: string): (CompiledRoute & { params?: Record<string, string> }) | null {
        method = method.toUpperCase()

        // Cache lookup first
        const cacheKey = `${method}:${path}`
        if (this.routeCache.has(cacheKey)) {
            return this.routeCache.get(cacheKey)!
        }

        // Static route lookup (fastest)
        const staticRoutes = this.staticRoutes.get(method)
        if (staticRoutes?.has(path)) {
            const route = staticRoutes.get(path)!
            this.cacheRoute(cacheKey, route)
            return route
        }

        // Dynamic route lookup
        const dynamicRoutes = this.dynamicRoutes.get(method)
        if (dynamicRoutes) {
            for (const route of dynamicRoutes) {
                if (route.paramExtractor) {
                    const params = route.paramExtractor(path)
                    if (params !== null) {
                        const routeWithParams = { ...route, params }
                        this.cacheRoute(cacheKey, routeWithParams)
                        return routeWithParams
                    }
                }
            }
        }

        return null
    }

    private compileDynamicRoute(path: string, handler: VeloxHandler, middleware: VeloxMiddleware[]): CompiledRoute {
        const segments = path.split("/")
        const paramNames: string[] = []
        const regexParts: string[] = []

        for (const segment of segments) {
            if (segment.startsWith(":")) {
                paramNames.push(segment.slice(1))
                regexParts.push("([^/]+)")
            } else if (segment.startsWith("*")) {
                paramNames.push("wildcard")
                regexParts.push("(.*)")
            } else {
                regexParts.push(this.escapeRegex(segment))
            }
        }

        const regex = new RegExp("^" + regexParts.join("/") + "$")

        return {
            handler,
            middleware,
            paramExtractor: (testPath: string) => {
                const match = testPath.match(regex)
                if (!match) return null

                const params: Record<string, string> = {}
                paramNames.forEach((name, index) => {
                    params[name] = decodeURIComponent(match[index + 1])
                })
                return params
            },
        }
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }

    private cacheRoute(key: string, route: CompiledRoute): void {
        if (this.routeCache.size < 10000) {
            // Limit cache size
            this.routeCache.set(key, route)
        }
    }

    public clearCache(): void {
        this.routeCache.clear()
    }
}
