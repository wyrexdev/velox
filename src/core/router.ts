import type { VeloxRequest, VeloxHandler, VeloxMiddleware, RouteMap, RouteCache, RouteInfo } from "@/types"
import type { ServerResponse } from "node:http"
import { InputSanitizer } from "@/utils/sanitizer"

export class VeloxRouter {
    public routes: {
        GET: RouteMap
        POST: RouteMap
        PUT: RouteMap
        DELETE: RouteMap
        PATCH: RouteMap
        HEAD: RouteMap
        OPTIONS: RouteMap
    } = {
            GET: {},
            POST: {},
            PUT: {},
            DELETE: {},
            PATCH: {},
            HEAD: {},
            OPTIONS: {},
        }

    public middleware: VeloxMiddleware[] = []
    public routeCache: RouteCache = {
        GET: {},
        POST: {},
        PUT: {},
        DELETE: {},
        PATCH: {},
        HEAD: {},
        OPTIONS: {},
    }

    public prefix?: string

    constructor(prefix?: string) {
        this.prefix = prefix
    }

    public use(middleware: VeloxMiddleware): this {
        this.middleware.push(middleware)
        return this
    }

    public get(path: string, handler: VeloxHandler, ...middleware: VeloxMiddleware[]): this {
        return this.addRoute("GET", path, handler, middleware)
    }

    public post(path: string, handler: VeloxHandler, ...middleware: VeloxMiddleware[]): this {
        return this.addRoute("POST", path, handler, middleware)
    }

    public put(path: string, handler: VeloxHandler, ...middleware: VeloxMiddleware[]): this {
        return this.addRoute("PUT", path, handler, middleware)
    }

    public delete(path: string, handler: VeloxHandler, ...middleware: VeloxMiddleware[]): this {
        return this.addRoute("DELETE", path, handler, middleware)
    }

    public patch(path: string, handler: VeloxHandler, ...middleware: VeloxMiddleware[]): this {
        return this.addRoute("PATCH", path, handler, middleware)
    }

    public head(path: string, handler: VeloxHandler, ...middleware: VeloxMiddleware[]): this {
        return this.addRoute("HEAD", path, handler, middleware)
    }

    public options(path: string, handler: VeloxHandler, ...middleware: VeloxMiddleware[]): this {
        return this.addRoute("OPTIONS", path, handler, middleware)
    }

    private addRoute(
        method: keyof typeof this.routes,
        path: string,
        handler: VeloxHandler,
        middleware: VeloxMiddleware[],
    ): this {
        const fullPath = this.prefix ? `${this.prefix}${path}` : path

        this.routes[method][fullPath] = {
            handler,
            middleware: [...this.middleware, ...middleware],
        }

        this.addToCache(method, fullPath, handler, [...this.middleware, ...middleware])
        return this
    }

    private addToCache(method: string, path: string, handler: VeloxHandler, middleware: VeloxMiddleware[]): void {
        const paramNames: string[] = []
        const pathParts = path.split("/")
        const regexParts: string[] = []

        for (const part of pathParts) {
            if (part.startsWith(":")) {
                paramNames.push(part.substring(1))
                regexParts.push("([^/]+)")
            } else if (part.startsWith("*")) {
                paramNames.push("wildcard")
                regexParts.push("(.*)")
            } else {
                regexParts.push(this.escapeRegex(part))
            }
        }

        const regexPattern = "^" + regexParts.join("/") + "$"

        this.routeCache[method][path] = {
            handler,
            middleware,
            paramNames,
            regex: new RegExp(regexPattern),
        }
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }

    public findRoute(
        method: string,
        path: string,
    ): {
        handler?: VeloxHandler
        middleware: VeloxMiddleware[]
        params: Record<string, string>
        route?: RouteInfo
    } {
        method = method.toUpperCase()

        const exactMatch = this.routeCache[method]?.[path]
        if (exactMatch) {
            return {
                handler: exactMatch.handler,
                middleware: exactMatch.middleware,
                params: {},
                route: {
                    path,
                    method,
                    params: {},
                    middleware: exactMatch.middleware.map((m) => m.name || "anonymous"),
                },
            }
        }

        for (const [routePath, routeInfo] of Object.entries(this.routeCache[method] || {})) {
            if (!routeInfo.regex) continue

            const match = path.match(routeInfo.regex)
            if (match) {
                const params: Record<string, string> = {}

                routeInfo.paramNames.forEach((name, index) => {
                    const value = match[index + 1]
                    params[name] = InputSanitizer.sanitizeString(decodeURIComponent(value))
                })

                return {
                    handler: routeInfo.handler,
                    middleware: routeInfo.middleware,
                    params,
                    route: {
                        path: routePath,
                        method,
                        params,
                        middleware: routeInfo.middleware.map((m) => m.name || "anonymous"),
                    },
                }
            }
        }

        return { middleware: [], params: {} }
    }

    public async executeMiddlewareChain(
        req: VeloxRequest,
        res: ServerResponse,
        middleware: VeloxMiddleware[],
        handler: VeloxHandler,
    ): Promise<void> {
        let index = 0

        const next = async (err?: Error): Promise<void> => {
            if (err) {
                throw err
            }

            if (index < middleware.length) {
                const currentMiddleware = middleware[index++]
                try {
                    const result = currentMiddleware(req, res, next)
                    if (result instanceof Promise) {
                        await result
                    }
                } catch (error) {
                    throw error
                }
            } else {
                try {
                    const result = handler(req, res)
                    if (result instanceof Promise) {
                        await result
                    }
                } catch (error) {
                    throw error
                }
            }
        }

        await next()
    }

    public getRoutes(): { method: string; path: string; middleware: number }[] {
        const routes: { method: string; path: string; middleware: number }[] = []

        for (const [method, methodRoutes] of Object.entries(this.routes)) {
            for (const [path, route] of Object.entries(methodRoutes)) {
                routes.push({
                    method,
                    path,
                    middleware: route.middleware.length,
                })
            }
        }

        return routes
    }

    public mount(basePath: string, router: VeloxRouter): this {
        const prefix = basePath + (router.prefix || "")

        for (const [method, methodRoutes] of Object.entries(router.routes)) {
            for (const [path, route] of Object.entries(methodRoutes)) {
                const fullPath = prefix + path
                    ; (this.routes as any)[method][fullPath] = {
                        handler: route.handler,
                        middleware: [...router.middleware, ...route.middleware],
                    }

                this.addToCache(method, fullPath, route.handler, [...router.middleware, ...route.middleware])
            }
        }

        return this
    }
}
