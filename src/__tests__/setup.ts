import { beforeAll, afterAll, beforeEach, afterEach, expect } from "@jest/globals"
import type { VeloxRequest, VeloxHandler, VeloxMiddleware } from "../types/index"
import type { ServerResponse } from "node:http"

beforeAll(() => {
  process.env.NODE_ENV = "test"
  process.env.PORT = "0"
  process.env.LOG_LEVEL = "error" 
})

afterAll(() => {
  jest.clearAllTimers()
})

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  jest.restoreAllMocks()
})

declare global {
  var testUtils: {
    createMockRequest: () => Partial<VeloxRequest>
    createMockResponse: () => Partial<ServerResponse>
    createMockHandler: () => jest.MockedFunction<VeloxHandler>
    createMockMiddleware: () => jest.MockedFunction<VeloxMiddleware>
    delay: (ms: number) => Promise<void>
  }

  namespace jest {
    interface Matchers<R> {
      toBeValidHttpStatus(): R
    }
  }
}

globalThis.testUtils = {
  createMockRequest: (): Partial<VeloxRequest> => ({
    method: "GET",
    url: "/",
    headers: {
      "user-agent": "test-agent",
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    params: {},
    query: {},
    body: { fields: {}, files: {} },
    files: {},
    ip: "127.0.0.1",
    secure: false,
    hostname: "localhost",
    protocol: "http",
    xhr: false,
    cookies: {},
    id: "test-request-id",
    startTime: process.hrtime(),
    get: jest.fn((header: string) => {
      const headers: Record<string, string> = {
        "user-agent": "test-agent",
        "content-type": "application/json",
        origin: "http://localhost:3000",
      }
      return headers[header.toLowerCase()]
    }),
    accepts: jest.fn(() => true),
    is: jest.fn(() => true),
    file: jest.fn(() => undefined),
  }),

  createMockResponse: (): Partial<ServerResponse> => {
    const mockResponse = {
      statusCode: 200,
      headersSent: false,
      writeHead: jest.fn(),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      removeHeader: jest.fn(),
      end: jest.fn(),
      write: jest.fn(),
    }
    mockResponse.writeHead.mockReturnValue(mockResponse)
    mockResponse.setHeader.mockReturnValue(mockResponse)
    mockResponse.removeHeader.mockReturnValue(mockResponse)
    mockResponse.end.mockReturnValue(mockResponse)
    mockResponse.write.mockReturnValue(true)
    return mockResponse
  },

  createMockHandler: (): jest.MockedFunction<VeloxHandler> => {
    const mockFn = jest.fn() as jest.MockedFunction<VeloxHandler>
    mockFn.mockImplementation(async (req, res) => {
    })
    return mockFn
  },

  createMockMiddleware: (): jest.MockedFunction<VeloxMiddleware> => {
    const mockFn = jest.fn() as jest.MockedFunction<VeloxMiddleware>
    mockFn.mockImplementation((req, res, next) => {
      next()
    })
    return mockFn
  },

  delay: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}

expect.extend({
  toBeValidHttpStatus(received: number) {
    const pass = received >= 100 && received < 600
    return {
      message: () => `expected ${received} to be a valid HTTP status code`,
      pass,
    }
  },
})

const originalConsole = console
beforeAll(() => {
  console.log = jest.fn()
  console.info = jest.fn()
  console.warn = jest.fn()
  console.error = jest.fn()
})

afterAll(() => {
  console.log = originalConsole.log
  console.info = originalConsole.info
  console.warn = originalConsole.warn
  console.error = originalConsole.error
})
