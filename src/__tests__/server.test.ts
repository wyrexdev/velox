import "./setup"
import { UltraFastServer } from "../core/ultra-fast-server"
import { createVeloxServer } from "../index"

describe("Velox Server", () => {
  let server: UltraFastServer

  beforeEach(() => {
    server = createVeloxServer({ port: 0 })
  })

  afterEach(async () => {
    if (server) {
      await server.stop()
    }
  })

  describe("Server Creation", () => {
    it("should create server with default options", () => {
      expect(server).toBeInstanceOf(UltraFastServer)
      expect(server.port).toBe(0)
      expect(server.host).toBe("0.0.0.0")
    })

    it("should create server with custom options", () => {
      const customServer = createVeloxServer({
        port: 8080,
        host: "localhost",
        uploadDir: "./custom-uploads",
      })

      expect(customServer.port).toBe(8080)
      expect(customServer.host).toBe("localhost")
      expect(customServer.uploadDir).toBe("./custom-uploads")
    })
  })

  describe("Route Handling", () => {
    it("should add GET route", () => {
      const handler = globalThis.testUtils.createMockHandler()
      server.get("/test", handler)

      const routes = server.getRoutes()
      expect(routes.some((route) => route.path === "/test" && route.method === "GET")).toBe(true)
    })

    it("should add POST route", () => {
      const handler = globalThis.testUtils.createMockHandler()
      server.post("/api/data", handler)

      const routes = server.getRoutes()
      expect(routes.some((route) => route.path === "/api/data" && route.method === "POST")).toBe(true)
    })

    it("should add multiple HTTP methods", () => {
      const getHandler = globalThis.testUtils.createMockHandler()
      const postHandler = globalThis.testUtils.createMockHandler()
      const putHandler = globalThis.testUtils.createMockHandler()
      const deleteHandler = globalThis.testUtils.createMockHandler()

      server.get("/resource", getHandler)
      server.post("/resource", postHandler)
      server.put("/resource", putHandler)
      server.delete("/resource", deleteHandler)

      const routes = server.getRoutes()
      expect(routes.filter((route) => route.path === "/resource")).toHaveLength(4)
    })
  })

  describe("Response Methods", () => {
    let mockRes: any

    beforeEach(() => {
      mockRes = globalThis.testUtils.createMockResponse()
    })

    it("should send JSON response", () => {
      const data = { message: "test", status: "ok" }

      server.sendJson(mockRes, 200, data)

      expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "application/json; charset=utf-8")
      expect(mockRes.writeHead).toHaveBeenCalledWith(200)
      expect(mockRes.end).toHaveBeenCalled()
    })

    it("should send fast JSON response", () => {
      const data = { message: "fast response" }

      server.sendFastJSON(mockRes, 201, data)

      expect(mockRes.end).toHaveBeenCalled()
    })
  })

  describe("Middleware", () => {
    it("should add middleware", () => {
      const middleware = globalThis.testUtils.createMockMiddleware()

      server.use(middleware)

      expect(typeof middleware).toBe("function")
      expect(middleware).toHaveBeenCalledTimes(0)
    })
  })

  describe("Logging", () => {
    it("should enable/disable logging", () => {
      const initialState = server.isLoggingEnabled()

      server.disableLogging()
      expect(server.isLoggingEnabled()).toBe(false)

      server.enableLogging()
      expect(server.isLoggingEnabled()).toBe(true)

      const toggled = server.toggleLogging()
      expect(server.isLoggingEnabled()).toBe(!toggled)
    })

    it("should set log level", () => {
      expect(() => server.setLogLevel("debug")).not.toThrow()
      expect(() => server.setLogLevel("info")).not.toThrow()
      expect(() => server.setLogLevel("warn")).not.toThrow()
      expect(() => server.setLogLevel("error")).not.toThrow()
    })

    it("should set log format", () => {
      expect(() => server.setLogFormat("json")).not.toThrow()
      expect(() => server.setLogFormat("text")).not.toThrow()
    })
  })

  describe("Metrics", () => {
    it("should return server metrics", () => {
      const metrics = server.getMetrics()

      expect(metrics).toHaveProperty("requests")
      expect(metrics).toHaveProperty("files")
      expect(metrics).toHaveProperty("memory")
      expect(metrics).toHaveProperty("uptime")

      expect(metrics.requests).toHaveProperty("total")
      expect(metrics.requests).toHaveProperty("success")
      expect(metrics.requests).toHaveProperty("errors")
      expect(metrics.requests).toHaveProperty("avgResponseTime")
    })

    it("should return rate limit stats", () => {
      const stats = server.getRateLimitStats()

      expect(stats).toHaveProperty("totalIPs")
      expect(stats).toHaveProperty("blockedIPs")
      expect(stats).toHaveProperty("activeRequests")

      expect(typeof stats.totalIPs).toBe("number")
      expect(typeof stats.blockedIPs).toBe("number")
      expect(typeof stats.activeRequests).toBe("number")
    })
  })

  describe("HTTP Status Validation", () => {
    it("should validate HTTP status codes", () => {
      expect(isValidHttpStatus(200)).toBe(true)
      expect(isValidHttpStatus(404)).toBe(true)
      expect(isValidHttpStatus(500)).toBe(true)
      expect(isValidHttpStatus(99)).toBe(false)
      expect(isValidHttpStatus(600)).toBe(false)
    })
  })
})

function isValidHttpStatus(code: number) {
  return code >= 100 && code <= 599
}
