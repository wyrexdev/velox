import type { VeloxFile, FileJSON, SecurityConfig, WorkerResponse } from "@/types"
import { createWriteStream, existsSync, mkdirSync, createReadStream } from "node:fs"
import { join, parse } from "node:path"
import { createHash } from "node:crypto"
import { Worker } from "node:worker_threads"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"
import { FILE_SIGNATURES } from "@/config/security"
import { InputSanitizer } from "@/utils/sanitizer"
import { v4 as uuidv4 } from "uuid"

export class FileHandler {
    private config: SecurityConfig
    private uploadDir: string
    private workers: Worker[] = []

    constructor(config: SecurityConfig, uploadDir: string) {
        this.config = config
        this.uploadDir = uploadDir
        this.ensureUploadDir()
    }

    private ensureUploadDir(): void {
        if (!existsSync(this.uploadDir)) {
            mkdirSync(this.uploadDir, { recursive: true, mode: 0o755 })
        }

        const subdirs = ["images", "documents", "videos", "audio", "others"]
        subdirs.forEach((dir) => {
            const fullPath = join(this.uploadDir, dir)
            if (!existsSync(fullPath)) {
                mkdirSync(fullPath, { mode: 0o755 })
            }
        })
    }

    public createFile(name: string, data: Buffer, mimetype: string, encoding: BufferEncoding = "binary"): VeloxFile {
        const sanitizedName = InputSanitizer.sanitizeFilename(name)

        const file: VeloxFile = {
            name: sanitizedName,
            data,
            mimetype,
            size: data.length,
            encoding,
            truncated: false,
            uploadedAt: new Date(),

            mv: (path: string, callback: (err?: Error) => void) => {
                this.saveFile(data, path, sanitizedName)
                    .then(() => callback())
                    .catch((err) => callback(err))
            },

            save: (path: string) => this.saveFile(data, path, sanitizedName),

            toJSON: (): FileJSON => ({
                name: sanitizedName,
                mimetype,
                size: data.length,
                encoding,
                truncated: false,
                uploadedAt: file.uploadedAt,
            }),

            stream: (): Readable => {
                return Readable.from(data)
            },

            validate: () => this.validateFile(file),
        }

        return file
    }

    public async validateFile(file: VeloxFile): Promise<{ valid: boolean; error?: string; hash?: string }> {
        if (file.size > this.config.MAX_FILE_SIZE) {
            return { valid: false, error: `File size exceeds limit of ${this.config.MAX_FILE_SIZE} bytes` }
        }

        if (!this.config.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return { valid: false, error: `File type '${file.mimetype}' is not allowed` }
        }

        const signatures = FILE_SIGNATURES[file.mimetype as keyof typeof FILE_SIGNATURES]
        if (signatures) {
            const isValid = this.validateFileSignature(file.data, signatures)
            if (!isValid) {
                return { valid: false, error: `Invalid ${file.mimetype} file signature` }
            }
        }

        if (this.config.FILE_HASHING || this.config.FILE_VIRUS_SCAN) {
            try {
                const result = await this.processFileInWorker(file)
                return result
            } catch (err) {
                return { valid: false, error: "File validation failed in worker thread" }
            }
        }

        return { valid: true }
    }

    private validateFileSignature(data: Buffer, signatures: readonly (readonly number[])[]): boolean {
        return signatures.some((sig) => {
            if (data.length < sig.length) return false
            return data.subarray(0, sig.length).equals(Buffer.from(sig))
        })
    }


    private async processFileInWorker(file: VeloxFile): Promise<{ valid: boolean; error?: string; hash?: string }> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(join(__dirname, "../workers/file-worker.js"), {
                workerData: {
                    fileData: file.data,
                    config: {
                        FILE_HASHING: this.config.FILE_HASHING,
                        FILE_VIRUS_SCAN: this.config.FILE_VIRUS_SCAN,
                    },
                },
            })

            const timeout = setTimeout(() => {
                worker.terminate()
                reject(new Error("Worker timeout"))
            }, 30000)

            worker.on("message", (result: WorkerResponse) => {
                clearTimeout(timeout)
                if (result.success) {
                    resolve({ valid: true, hash: result.data?.hash })
                } else {
                    resolve({ valid: false, error: result.error })
                }
                worker.terminate()
            })

            worker.on("error", (err) => {
                clearTimeout(timeout)
                reject(err)
                worker.terminate()
            })

            worker.on("exit", (code) => {
                clearTimeout(timeout)
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`))
                }
            })
        })
    }

    public async saveFile(
        data: Buffer,
        directory: string,
        filename: string,
    ): Promise<{ path: string; hash?: string; url?: string }> {
        if (!existsSync(directory)) {
            mkdirSync(directory, { recursive: true, mode: 0o755 })
        }

        const { name, ext } = parse(filename)
        const safeName = InputSanitizer.sanitizeFilename(name) || "unnamed"
        const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "")
        const uniqueId = uuidv4().substring(0, 8)
        const timestamp = Date.now()
        const safeFilename = `${safeName}-${timestamp}-${uniqueId}${safeExt}`

        const filePath = join(directory, safeFilename)

        let fileHash: string | undefined
        if (this.config.FILE_HASHING) {
            fileHash = createHash("sha256").update(data).digest("hex")
        }

        try {
            await pipeline(Readable.from(data), createWriteStream(filePath, { mode: 0o644 }))

            const relativePath = filePath.replace(this.uploadDir, "").replace(/\\/g, "/")
            const url = `/uploads${relativePath}`

            return {
                path: filePath,
                hash: fileHash,
                url,
            }
        } catch (error) {
            throw new Error(`Failed to save file: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
    }

    public getFileCategory(mimetype: string): string {
        if (mimetype.startsWith("image/")) return "images"
        if (mimetype.startsWith("video/")) return "videos"
        if (mimetype.startsWith("audio/")) return "audio"
        if (mimetype.includes("pdf") || mimetype.includes("document") || mimetype.includes("text")) return "documents"
        return "others"
    }

    public async getFileStream(filePath: string): Promise<Readable> {
        if (!existsSync(filePath)) {
            throw new Error("File not found")
        }
        return createReadStream(filePath)
    }

    public getFileInfo(filePath: string): { exists: boolean; size?: number; mtime?: Date } {
        try {
            if (!existsSync(filePath)) {
                return { exists: false }
            }

            const stats = require("fs").statSync(filePath)
            return {
                exists: true,
                size: stats.size,
                mtime: stats.mtime,
            }
        } catch {
            return { exists: false }
        }
    }

    public destroy(): void {
        this.workers.forEach((worker) => {
            worker.terminate()
        })
        this.workers = []
    }
}
