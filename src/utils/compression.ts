import { createGzip, createBrotliCompress, createDeflate } from "node:zlib"
import type { Transform } from "node:stream"
import type { SecurityConfig } from "../types"

export class CompressionManager {
    private config: SecurityConfig["COMPRESSION"]

    constructor(config: SecurityConfig["COMPRESSION"]) {
        this.config = config
    }

    public shouldCompress(contentLength: number, contentType: string): boolean {
        if (!this.config.ENABLED) return false
        if (contentLength < this.config.THRESHOLD) return false

        const nonCompressibleTypes = [
            "image/jpeg",
            "image/png",
            "image/gif",
            "video/",
            "audio/",
            "application/zip",
            "application/gzip",
            "application/x-rar",
        ]

        return !nonCompressibleTypes.some((type) => contentType.includes(type))
    }

    public getCompressionStream(acceptEncoding: string): Transform | null {
        if (!this.config.ENABLED) return null

        if (acceptEncoding.includes("br")) {
            return createBrotliCompress({
                params: {
                    [require("node:zlib").constants.BROTLI_PARAM_QUALITY]: this.config.LEVEL,
                },
            })
        }

        if (acceptEncoding.includes("gzip")) {
            return createGzip({ level: this.config.LEVEL })
        }

        if (acceptEncoding.includes("deflate")) {
            return createDeflate({ level: this.config.LEVEL })
        }

        return null
    }

    public getCompressionEncoding(acceptEncoding: string): string | null {
        if (!this.config.ENABLED) return null

        if (acceptEncoding.includes("br")) return "br"
        if (acceptEncoding.includes("gzip")) return "gzip"
        if (acceptEncoding.includes("deflate")) return "deflate"

        return null
    }

    public async compressBuffer(buffer: Buffer, encoding: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let compressor: Transform

            switch (encoding) {
                case "br":
                    compressor = createBrotliCompress({
                        params: {
                            [require("node:zlib").constants.BROTLI_PARAM_QUALITY]: this.config.LEVEL,
                        },
                    })
                    break
                case "gzip":
                    compressor = createGzip({ level: this.config.LEVEL })
                    break
                case "deflate":
                    compressor = createDeflate({ level: this.config.LEVEL })
                    break
                default:
                    return resolve(buffer)
            }

            const chunks: Buffer[] = []

            compressor.on("data", (chunk) => chunks.push(chunk))
            compressor.on("end", () => resolve(Buffer.concat(chunks)))
            compressor.on("error", reject)

            compressor.write(buffer)
            compressor.end()
        })
    }
}
