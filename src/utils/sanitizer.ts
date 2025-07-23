export class InputSanitizer {
    public static sanitizeString(input: string): string {
        if (typeof input !== "string") return ""

        let sanitized = input.replace(/[\x00-\x1F\x7F]/g, "")

        sanitized = sanitized.replace(/[<>"'`]/g, (char) => {
            const entities: Record<string, string> = {
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
                "`": "&#96;",
            }
            return entities[char] || char
        })

        sanitized = sanitized.replace(/(javascript|vbscript|data|alert|on\w+):/gi, "")
        sanitized = sanitized.replace(/(union|select|insert|delete|update|drop|alter|create|exec|xp_|--|;)/gi, "")

        return sanitized.substring(0, 10000)
    }

    public static sanitizeFilename(filename: string): string {
        if (!filename) return "unnamed"

        let sanitized = filename.replace(/[/\\:*?"<>|]/g, "")
        sanitized = sanitized.replace(/^[.\s]+/, "")
        sanitized = sanitized.replace(/[.\s]+$/, "")

        if (!sanitized) return "unnamed"

        return sanitized.substring(0, 255)
    }

    public static sanitizeObject(obj: any): any {
        if (typeof obj === "string") {
            return this.sanitizeString(obj)
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this.sanitizeObject(item))
        }

        if (obj && typeof obj === "object") {
            const sanitized: any = {}
            for (const [key, value] of Object.entries(obj)) {
                const sanitizedKey = this.sanitizeString(key)
                sanitized[sanitizedKey] = this.sanitizeObject(value)
            }
            return sanitized
        }

        return obj
    }

    public static isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email) && email.length <= 254
    }

    public static isValidUrl(url: string): boolean {
        try {
            new URL(url)
            return true
        } catch {
            return false
        }
    }

    public static isValidIP(ip: string): boolean {
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/
        return ipv4Regex.test(ip) || ipv6Regex.test(ip)
    }
}
