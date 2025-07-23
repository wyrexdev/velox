import type { VeloxRequest, RequestBody, SecurityConfig } from "../types"
import type { FileHandler } from "./file-handler"
import { InputSanitizer } from "../utils/sanitizer"

export class RequestParser {
    private fileHandler: FileHandler
    private config: SecurityConfig

    constructor(fileHandler: FileHandler, config: SecurityConfig) {
        this.fileHandler = fileHandler
        this.config = config
    }

    public async parseBody(req: VeloxRequest): Promise<void> {
        return new Promise((resolve, reject) => {
            const contentType = req.headers["content-type"] || ""
            const contentLength = Number.parseInt(req.headers["content-length"] || "0", 10)

            if (contentLength > this.config.MAX_FILE_SIZE * 2) {
                reject(new Error("Request body too large"))
                return
            }

            const body: RequestBody = { fields: {}, files: {} }
            let buffer = Buffer.alloc(0)
            let totalSize = 0

            req.on("data", (chunk: Buffer) => {
                totalSize += chunk.length

                if (totalSize > this.config.MAX_FILE_SIZE * 2) {
                    req.destroy(new Error("Request body too large"))
                    return
                }

                buffer = Buffer.concat([buffer, chunk])
            })

            req.on("end", async () => {
                try {
                    if (contentType.includes("multipart/form-data")) {
                        const boundary = this.extractBoundary(contentType)
                        if (!boundary) {
                            reject(new Error("Invalid multipart boundary"))
                            return
                        }
                        await this.parseMultipart(buffer, boundary, body)
                    } else if (contentType.includes("application/json")) {
                        await this.parseJSON(buffer, body)
                    } else if (contentType.includes("application/x-www-form-urlencoded")) {
                        await this.parseUrlEncoded(buffer, body)
                    } else {
                        body.fields = { data: InputSanitizer.sanitizeString(buffer.toString()) }
                    }

                    req.body = body
                    req.files = body.files
                    resolve()
                } catch (err) {
                    reject(err)
                }
            })

            req.on("error", reject)
            req.on("aborted", () => reject(new Error("Request aborted")))
        })
    }

    private extractBoundary(contentType: string): string | null {
        const match = contentType.match(/boundary=([^;]+)/)
        return match ? match[1].replace(/['"]/g, "") : null
    }

    private async parseJSON(buffer: Buffer, body: RequestBody): Promise<void> {
        try {
            const parsed = JSON.parse(buffer.toString("utf8"))
            body.fields = InputSanitizer.sanitizeObject(parsed)
        } catch (error) {
            throw new Error("Invalid JSON format")
        }
    }

    private async parseUrlEncoded(buffer: Buffer, body: RequestBody): Promise<void> {
        try {
            const parsed = new URLSearchParams(buffer.toString("utf8"))
            const sanitized: Record<string, string> = {}

            for (const [key, value] of parsed.entries()) {
                const sanitizedKey = InputSanitizer.sanitizeString(key)
                const sanitizedValue = InputSanitizer.sanitizeString(value)
                sanitized[sanitizedKey] = sanitizedValue
            }

            body.fields = sanitized
        } catch (error) {
            throw new Error("Invalid URL encoded format")
        }
    }

    private async parseMultipart(data: Buffer, boundary: string, body: RequestBody): Promise<void> {
        const boundaryBuffer = Buffer.from(`--${boundary}`)
        const parts = this.splitBuffer(data, boundaryBuffer)

        for (const part of parts) {
            if (part.length === 0) continue

            const headerEndIndex = this.findHeaderEnd(part)
            if (headerEndIndex === -1) continue

            const headerBuffer = part.slice(0, headerEndIndex)
            const contentBuffer = part.slice(headerEndIndex + 4)

            const headers = this.parseHeaders(headerBuffer.toString("utf8"))
            const disposition = headers["content-disposition"]

            if (!disposition) continue

            const nameMatch = disposition.match(/name="([^"]+)"/)
            if (!nameMatch) continue

            const fieldName = InputSanitizer.sanitizeString(nameMatch[1])
            const filenameMatch = disposition.match(/filename="([^"]+)"/)

            if (filenameMatch) {
                const filename = InputSanitizer.sanitizeFilename(filenameMatch[1])
                const mimetype = headers["content-type"] || "application/octet-stream"

                const cleanContent = this.cleanFileContent(contentBuffer)

                const file = this.fileHandler.createFile(filename, cleanContent, mimetype)

                const validation = await file.validate()
                if (validation.valid) {
                    body.files[fieldName] = file
                    if (validation.hash) {
                        file.hash = validation.hash
                    }
                }
            } else {
                const content = contentBuffer.toString("utf8").replace(/\r\n$/, "")
                body.fields[fieldName] = InputSanitizer.sanitizeString(content)
            }
        }
    }

    private splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
        const parts: Buffer[] = []
        let start = 0
        let index = 0

        while (index < buffer.length) {
            const found = buffer.indexOf(delimiter, index)
            if (found === -1) break

            if (found > start) {
                parts.push(buffer.slice(start, found))
            }

            start = found + delimiter.length
            index = start
        }

        if (start < buffer.length) {
            parts.push(buffer.slice(start))
        }

        return parts
    }

    private findHeaderEnd(buffer: Buffer): number {
        const headerEnd = Buffer.from("\r\n\r\n")
        return buffer.indexOf(headerEnd)
    }

    private parseHeaders(headerString: string): Record<string, string> {
        const headers: Record<string, string> = {}
        const lines = headerString.split("\r\n")

        for (const line of lines) {
            const colonIndex = line.indexOf(":")
            if (colonIndex === -1) continue

            const key = line.slice(0, colonIndex).trim().toLowerCase()
            const value = line.slice(colonIndex + 1).trim()
            headers[key] = value
        }

        return headers
    }

    private cleanFileContent(buffer: Buffer): Buffer {
        let content = buffer

        while (content.length > 0 && (content[content.length - 1] === 0x0a || content[content.length - 1] === 0x0d)) {
            content = content.slice(0, -1)
        }

        return content
    }
}
