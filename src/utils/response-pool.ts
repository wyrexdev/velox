export class ResponsePool {
    private static responsePool: any[] = []
    private static bufferPool: Buffer[] = []
    private static maxPoolSize = 1000

    public static getResponse(): any {
        return this.responsePool.pop() || {}
    }

    public static releaseResponse(response: any): void {
        for (const key in response) {
            delete response[key]
        }

        if (this.responsePool.length < this.maxPoolSize) {
            this.responsePool.push(response)
        }
    }

    public static getBuffer(size: number): Buffer {
        const buffer = this.bufferPool.find((b) => b.length >= size)
        if (buffer) {
            const index = this.bufferPool.indexOf(buffer)
            this.bufferPool.splice(index, 1)
            return buffer.subarray(0, size)
        }
        return Buffer.allocUnsafe(size)
    }

    public static releaseBuffer(buffer: Buffer): void {
        if (this.bufferPool.length < this.maxPoolSize && buffer.length <= 64 * 1024) {
            this.bufferPool.push(buffer)
        }
    }
}
