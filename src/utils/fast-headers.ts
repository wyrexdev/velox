export class FastHeaders {
    private static commonHeaders = new Map<string, string>()
    private static headerBuffers = new Map<string, Buffer>()

    static {
        this.precompileHeaders()
    }

    private static precompileHeaders(): void {
        const headers = {
            json: "Content-Type: application/json; charset=utf-8\r\n",
            cors: "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS\r\n",
            security: "X-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nX-XSS-Protection: 1; mode=block\r\n",
            "cache-control": "Cache-Control: no-cache\r\n",
            server: "Server: VELOX/1.0\r\n",
        }

        for (const [key, value] of Object.entries(headers)) {
            this.commonHeaders.set(key, value)
            this.headerBuffers.set(key, Buffer.from(value, "ascii"))
        }
    }

    public static getHeaderBuffer(type: string): Buffer | null {
        return this.headerBuffers.get(type) || null
    }

    public static getHeaderString(type: string): string | null {
        return this.commonHeaders.get(type) || null
    }

    public static buildResponseHeaders(statusCode: number, contentLength: number, extraHeaders?: string[]): Buffer {
        const parts: Buffer[] = []

        parts.push(Buffer.from(`HTTP/1.1 ${statusCode} ${this.getStatusText(statusCode)}\r\n`, "ascii"))

        parts.push(this.headerBuffers.get("json")!)
        parts.push(this.headerBuffers.get("security")!)
        parts.push(this.headerBuffers.get("server")!)

        parts.push(Buffer.from(`Content-Length: ${contentLength}\r\n`, "ascii"))

        if (extraHeaders) {
            for (const header of extraHeaders) {
                parts.push(Buffer.from(header + "\r\n", "ascii"))
            }
        }

        parts.push(Buffer.from("\r\n", "ascii"))

        return Buffer.concat(parts)
    }

    private static getStatusText(code: number): string {
        switch (code) {
            case 200:
                return "OK"
            case 201:
                return "Created"
            case 400:
                return "Bad Request"
            case 401:
                return "Unauthorized"
            case 403:
                return "Forbidden"
            case 404:
                return "Not Found"
            case 500:
                return "Internal Server Error"
            default:
                return "Unknown"
        }
    }
}
