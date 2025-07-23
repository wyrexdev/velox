export class FastJSON {
    private static schemas = new Map<string, any>()
    private static stringifyCache = new Map<string, string>()
    private static parseCache = new Map<string, any>()

    static {
        this.precompileSchemas()
    }

    private static precompileSchemas() {
        this.schemas.set("api-response", {
            type: "object",
            properties: {
                success: { type: "boolean" },
                data: { type: "object" },
                message: { type: "string" },
                timestamp: { type: "string" },
            },
        })

        this.schemas.set("error-response", {
            type: "object",
            properties: {
                error: { type: "string" },
                message: { type: "string" },
                code: { type: "number" },
                timestamp: { type: "string" },
            },
        })

        this.schemas.set("file-response", {
            type: "object",
            properties: {
                filename: { type: "string" },
                success: { type: "boolean" },
                url: { type: "string" },
                size: { type: "number" },
                hash: { type: "string" },
            },
        })
    }

    public static stringify(obj: any, schema?: string): string {
        const cacheKey = this.getCacheKey(obj)

        if (this.stringifyCache.has(cacheKey)) {
            return this.stringifyCache.get(cacheKey)!
        }

        let result: string

        if (schema && this.schemas.has(schema)) {
            result = this.fastStringify(obj, this.schemas.get(schema))
        } else {
            result = this.optimizedStringify(obj)
        }

        if (this.stringifyCache.size < 1000) {
            this.stringifyCache.set(cacheKey, result)
        }

        return result
    }

    public static parse(str: string): any {
        if (this.parseCache.has(str)) {
            return this.parseCache.get(str)
        }

        let result: any

        try {
            if (str.startsWith('{"') && str.endsWith('"}')) {
                result = this.fastParse(str)
            } else {
                result = JSON.parse(str)
            }
        } catch {
            result = JSON.parse(str)
        }

        if (this.parseCache.size < 1000) {
            this.parseCache.set(str, result)
        }

        return result
    }

    private static fastStringify(obj: any, schema: any): string {
        if (schema.type === "object" && schema.properties) {
            const parts: string[] = ["{"]
            let first = true

            for (const [key, prop] of Object.entries(schema.properties)) {
                if (obj[key] !== undefined) {
                    if (!first) parts.push(",")
                    parts.push(`"${key}":`)

                    const value = obj[key]
                    if (typeof value === "string") {
                        parts.push(`"${this.escapeString(value)}"`)
                    } else if (typeof value === "number" || typeof value === "boolean") {
                        parts.push(String(value))
                    } else {
                        parts.push(JSON.stringify(value))
                    }
                    first = false
                }
            }

            parts.push("}")
            return parts.join("")
        }

        return JSON.stringify(obj)
    }

    private static optimizedStringify(obj: any): string {
        if (obj === null) return "null"
        if (obj === undefined) return "undefined"
        if (typeof obj === "string") return `"${this.escapeString(obj)}"`
        if (typeof obj === "number" || typeof obj === "boolean") return String(obj)

        if (Array.isArray(obj)) {
            const parts: string[] = ["["]
            for (let i = 0; i < obj.length; i++) {
                if (i > 0) parts.push(",")
                parts.push(this.optimizedStringify(obj[i]))
            }
            parts.push("]")
            return parts.join("")
        }

        if (typeof obj === "object") {
            const parts: string[] = ["{"]
            let first = true

            for (const key in obj) {
                if (obj.hasOwnProperty(key) && obj[key] !== undefined) {
                    if (!first) parts.push(",")
                    parts.push(`"${key}":${this.optimizedStringify(obj[key])}`)
                    first = false
                }
            }

            parts.push("}")
            return parts.join("")
        }

        return JSON.stringify(obj)
    }

    private static fastParse(str: string): any {
        const obj: any = {}
        const content = str.slice(1, -1)

        if (!content) return obj

        const pairs = this.splitPairs(content)

        for (const pair of pairs) {
            const colonIndex = pair.indexOf(":")
            if (colonIndex === -1) continue

            const key = pair.slice(1, colonIndex - 1)
            const valueStr = pair.slice(colonIndex + 1).trim()

            obj[key] = this.parseValue(valueStr)
        }

        return obj
    }

    private static splitPairs(content: string): string[] {
        const pairs: string[] = []
        let current = ""
        let inString = false
        let braceCount = 0

        for (let i = 0; i < content.length; i++) {
            const char = content[i]

            if (char === '"' && content[i - 1] !== "\\") {
                inString = !inString
            } else if (!inString) {
                if (char === "{") braceCount++
                else if (char === "}") braceCount--
                else if (char === "," && braceCount === 0) {
                    pairs.push(current.trim())
                    current = ""
                    continue
                }
            }

            current += char
        }

        if (current.trim()) {
            pairs.push(current.trim())
        }

        return pairs
    }

    private static parseValue(valueStr: string): any {
        valueStr = valueStr.trim()

        if (valueStr === "null") return null
        if (valueStr === "true") return true
        if (valueStr === "false") return false
        if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
            return valueStr.slice(1, -1)
        }
        if (/^-?\d+(\.\d+)?$/.test(valueStr)) {
            return Number(valueStr)
        }

        return JSON.parse(valueStr)
    }

    private static escapeString(str: string): string {
        return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    }

    private static getCacheKey(obj: any): string {
        if (typeof obj === "object" && obj !== null) {
            const keys = Object.keys(obj).sort()
            return keys.join("|") + "|" + typeof obj[keys[0]]
        }
        return String(obj)
    }

    public static clearCache(): void {
        this.stringifyCache.clear()
        this.parseCache.clear()
    }
}
