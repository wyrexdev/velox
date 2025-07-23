import { parentPort, workerData, isMainThread } from "node:worker_threads"
import { createHash } from "node:crypto"
import type { WorkerMessage, WorkerResponse } from "../types"

if (!isMainThread && parentPort) {
    const { workerId, config } = workerData

    parentPort.on("message", async (message: WorkerMessage) => {
        try {
            switch (message.type) {
                case "health-check":
                    parentPort!.postMessage({
                        success: true,
                        data: { workerId, status: "healthy", timestamp: Date.now() },
                        requestId: message.requestId,
                    } as WorkerResponse)
                    break

                case "shutdown":
                    console.log(`Worker ${workerId} kapatılıyor...`)
                    process.exit(0)
                    break

                case "file-validation":
                    const { fileData } = message.data
                    const result: { hash?: string; scanResult?: { clean: boolean; threats?: string[] } } = {}

                    if (config.FILE_HASHING) {
                        const hash = createHash("sha256").update(fileData).digest("hex")
                        result.hash = hash
                    }

                    if (config.FILE_VIRUS_SCAN) {
                        const scanResult = await simulateVirusScan(fileData)
                        result.scanResult = scanResult

                        if (!scanResult.clean) {
                            parentPort!.postMessage({
                                success: false,
                                error: `File contains malicious content: ${scanResult.threats?.join(", ")}`,
                                requestId: message.requestId,
                            } as WorkerResponse)
                            return
                        }
                    }

                    const analysis = await analyzeFile(fileData)
                    if (!analysis.safe) {
                        parentPort!.postMessage({
                            success: false,
                            error: analysis.reason,
                            requestId: message.requestId,
                        } as WorkerResponse)
                        return
                    }

                    parentPort!.postMessage({
                        success: true,
                        data: result,
                        requestId: message.requestId,
                    } as WorkerResponse)
                    break

                default:
                    parentPort!.postMessage({
                        success: false,
                        error: `Unknown message type: ${message.type}`,
                        requestId: message.requestId,
                    } as WorkerResponse)
            }
        } catch (error) {
            parentPort!.postMessage({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                requestId: message.requestId,
            } as WorkerResponse)
        }
    })

    console.log(`🔧 Worker ${workerId} başlatıldı`)
}

async function simulateVirusScan(data: Buffer): Promise<{ clean: boolean; threats?: string[] }> {
    await new Promise((resolve) => setTimeout(resolve, 100))

    const threats: string[] = []

    const maliciousPatterns = [
        { pattern: Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"), name: "EICAR-Test-File" },
        { pattern: Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR"), name: "EICAR-Test-File" },
        { pattern: Buffer.from('<script>alert("xss")</script>'), name: "XSS-Script" },
        { pattern: Buffer.from("<?php system($_GET["), name: "PHP-Shell" },
        { pattern: Buffer.from("eval("), name: "Code-Injection" },
        { pattern: Buffer.from("exec("), name: "Command-Injection" },
    ]

    for (const { pattern, name } of maliciousPatterns) {
        if (data.includes(pattern)) {
            threats.push(name)
        }
    }

    return {
        clean: threats.length === 0,
        threats: threats.length > 0 ? threats : undefined,
    }
}

async function analyzeFile(data: Buffer): Promise<{ safe: boolean; reason?: string }> {
    if (data.length === 0) {
        return { safe: false, reason: "Empty file" }
    }

    const suspiciousHeaders = [
        [0x4d, 0x5a],
        [0x7f, 0x45, 0x4c, 0x46], 
        [0xca, 0xfe, 0xba, 0xbe], 
        [0xfe, 0xed, 0xfa, 0xce],
    ]

    for (const header of suspiciousHeaders) {
        if (data.length >= header.length) {
            const matches = header.every((byte, index) => data[index] === byte)
            if (matches) {
                return { safe: false, reason: "Executable file detected" }
            }
        }
    }

    if (
        data.includes(Buffer.from("<script")) ||
        data.includes(Buffer.from("javascript:")) ||
        data.includes(Buffer.from("vbscript:"))
    ) {
        return { safe: false, reason: "Script injection detected" }
    }

    return { safe: true }
}
