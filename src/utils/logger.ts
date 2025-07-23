import type { LogEntry, SecurityConfig } from "@/types"
import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

export class VeloxLogger {
    private logDir: string
    private config: SecurityConfig["LOGGING"]

    constructor(config: SecurityConfig["LOGGING"], logDir = "./logs") {
        this.config = config
        this.logDir = logDir
        this.ensureLogDir()
    }

    private ensureLogDir(): void {
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true, mode: 0o755 })
        }
    }

    private getColors() {
        return {
            reset: "\x1b[0m",
            bright: "\x1b[1m",
            dim: "\x1b[2m",
            red: "\x1b[31m",
            green: "\x1b[32m",
            yellow: "\x1b[33m",
            blue: "\x1b[34m",
            magenta: "\x1b[35m",
            cyan: "\x1b[36m",
            white: "\x1b[37m",
            gray: "\x1b[90m",
        }
    }

    public logRequest(entry: LogEntry): void {
        if (!this.config.ENABLED) return

        if (this.config.FORMAT === "json") {
            this.logJson(entry)
        } else {
            this.logText(entry)
        }

        this.writeToFile(entry)
    }

    private logJson(entry: LogEntry): void {
        console.log(
            JSON.stringify({
                ...entry,
                level: "info",
                service: "velox-server",
            }),
        )
    }

    private logText(entry: LogEntry): void {
        const colors = this.getColors()
        const statusColor =
            entry.statusCode >= 500
                ? colors.red
                : entry.statusCode >= 400
                    ? colors.yellow
                    : entry.statusCode >= 300
                        ? colors.cyan
                        : colors.green

        const methodColor = this.getMethodColor(entry.method)

        console.log(
            `${colors.bright}${entry.timestamp.toISOString()}${colors.reset}`,
            `${colors.gray}#${entry.requestId.padStart(8, "0")}${colors.reset}`,
            `${methodColor}${entry.method.padEnd(7)}${colors.reset}`,
            `${statusColor}${entry.statusCode}${colors.reset}`,
            `${entry.path}`,
            `${colors.yellow}${entry.duration.toFixed(2)}ms${colors.reset}`,
            `${colors.cyan}${entry.ip}${colors.reset}`,
            entry.size ? `${colors.gray}${this.formatBytes(entry.size)}${colors.reset}` : "",
        )
    }

    private getMethodColor(method: string): string {
        const colors = this.getColors()
        switch (method.toUpperCase()) {
            case "GET":
                return colors.cyan
            case "POST":
                return colors.magenta
            case "PUT":
                return colors.yellow
            case "DELETE":
                return colors.red
            case "PATCH":
                return colors.blue
            default:
                return colors.gray
        }
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return "0 B"
        const k = 1024
        const sizes = ["B", "KB", "MB", "GB"]
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    }

    private writeToFile(entry: LogEntry): void {
        const logFile = join(this.logDir, `velox-${new Date().toISOString().split("T")[0]}.log`)
        const logLine =
            this.config.FORMAT === "json"
                ? JSON.stringify(entry) + "\n"
                : `${entry.timestamp.toISOString()} [${entry.requestId}] ${entry.method} ${entry.statusCode} ${entry.path} ${entry.duration}ms ${entry.ip}\n`

        try {
            appendFileSync(logFile, logLine)
        } catch (error) {
            console.error("Failed to write to log file:", error)
        }
    }

    public debug(message: string, meta?: any): void {
        if (this.config.LEVEL === "debug") {
            this.log("debug", message, meta)
        }
    }

    public info(message: string, meta?: any): void {
        if (["debug", "info"].includes(this.config.LEVEL)) {
            this.log("info", message, meta)
        }
    }

    public warn(message: string, meta?: any): void {
        if (["debug", "info", "warn"].includes(this.config.LEVEL)) {
            this.log("warn", message, meta)
        }
    }

    public error(message: string, meta?: any): void {
        this.log("error", message, meta)
    }

    private log(level: string, message: string, meta?: any): void {
        const colors = this.getColors()
        const levelColor =
            level === "error" ? colors.red : level === "warn" ? colors.yellow : level === "info" ? colors.green : colors.cyan

        const timestamp = new Date().toISOString()

        if (this.config.FORMAT === "json") {
            console.log(
                JSON.stringify({
                    timestamp,
                    level,
                    message,
                    meta,
                    service: "velox-server",
                }),
            )
        } else {
            console.log(
                `${colors.bright}${timestamp}${colors.reset}`,
                `${levelColor}[${level.toUpperCase()}]${colors.reset}`,
                message,
                meta ? colors.gray + JSON.stringify(meta) + colors.reset : "",
            )
        }
    }
}
