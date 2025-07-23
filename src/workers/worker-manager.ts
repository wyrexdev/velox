import { Worker } from "node:worker_threads"
import { join } from "node:path"
import type { WorkerMessage, WorkerResponse, SecurityConfig } from "../types"
import type { VeloxLogger } from "../utils/logger"

export interface WorkerTask {
    id: string
    type: "file-validation" | "file-processing" | "image-resize" | "data-processing"
    data: any
    timeout?: number
}

export interface WorkerPool {
    workers: Worker[]
    queue: WorkerTask[]
    activeJobs: Map<string, { worker: Worker; resolve: Function; reject: Function; timeout: NodeJS.Timeout }>
}

export class WorkerManager {
    private pool: WorkerPool
    private config: SecurityConfig
    private logger: VeloxLogger
    private isShuttingDown = false

    constructor(config: SecurityConfig, logger: VeloxLogger) {
        this.config = config
        this.logger = logger
        this.pool = {
            workers: [],
            queue: [],
            activeJobs: new Map(),
        }

        this.initializeWorkers()
        this.setupGracefulShutdown()
    }

    private initializeWorkers(): void {
        const workerCount = this.config.WORKER_THREADS

        this.logger.info(`🔧 ${workerCount} worker thread başlatılıyor...`)

        for (let i = 0; i < workerCount; i++) {
            this.createWorker(i)
        }

        this.logger.info(`✅ ${this.pool.workers.length} worker thread hazır`)
    }

    private createWorker(id: number): void {
        try {
            const worker = new Worker(join(__dirname, "file-worker.js"), {
                workerData: {
                    workerId: id,
                    config: {
                        FILE_HASHING: this.config.FILE_HASHING,
                        FILE_VIRUS_SCAN: this.config.FILE_VIRUS_SCAN,
                        MAX_FILE_SIZE: this.config.MAX_FILE_SIZE,
                    },
                },
            })

            worker.on("message", (response: WorkerResponse) => {
                this.handleWorkerResponse(worker, response)
            })

            worker.on("error", (error) => {
                this.logger.error(`Worker ${id} hatası:`, error)
                this.restartWorker(worker, id)
            })

            worker.on("exit", (code) => {
                if (!this.isShuttingDown && code !== 0) {
                    this.logger.warn(`Worker ${id} beklenmedik şekilde kapandı (kod: ${code})`)
                    this.restartWorker(worker, id)
                }
            })

            this.pool.workers.push(worker)
            this.logger.debug(`Worker ${id} oluşturuldu`)
        } catch (error) {
            this.logger.error(`Worker ${id} oluşturulamadı:`, error)
        }
    }

    private restartWorker(oldWorker: Worker, id: number): void {
        if (this.isShuttingDown) return

        const index = this.pool.workers.indexOf(oldWorker)
        if (index > -1) {
            this.pool.workers.splice(index, 1)
        }

        for (const [jobId, job] of this.pool.activeJobs.entries()) {
            if (job.worker === oldWorker) {
                clearTimeout(job.timeout)
                job.reject(new Error("Worker yeniden başlatıldı"))
                this.pool.activeJobs.delete(jobId)
            }
        }

        setTimeout(() => {
            this.createWorker(id)
            this.processQueue()
        }, 1000)
    }

    private handleWorkerResponse(worker: Worker, response: WorkerResponse): void {
        const jobId = response.requestId
        if (!jobId) return

        const job = this.pool.activeJobs.get(jobId)
        if (!job) return

        clearTimeout(job.timeout)
        this.pool.activeJobs.delete(jobId)

        if (response.success) {
            job.resolve(response.data)
        } else {
            job.reject(new Error(response.error || "Worker hatası"))
        }

        this.processQueue()
    }

    public async executeTask<T = any>(task: WorkerTask): Promise<T> {
        return new Promise((resolve, reject) => {
            const availableWorker = this.getAvailableWorker()

            if (availableWorker) {
                this.assignTask(availableWorker, task, resolve, reject)
            } else {
                this.pool.queue.push(task)
                this.logger.debug(`Task ${task.id} kuyruğa eklendi (kuyruk: ${this.pool.queue.length})`)

                if (this.pool.queue.length > 1000) {
                    reject(new Error("Worker kuyruğu dolu"))
                    return
                }

                const originalTask = this.pool.queue[this.pool.queue.length - 1]
                    ; (originalTask as any).resolve = resolve
                    ; (originalTask as any).reject = reject
            }
        })
    }

    private getAvailableWorker(): Worker | null {
        for (const worker of this.pool.workers) {
            const isWorkerBusy = Array.from(this.pool.activeJobs.values()).some((job) => job.worker === worker)
            if (!isWorkerBusy) {
                return worker
            }
        }
        return null
    }

    private assignTask(worker: Worker, task: WorkerTask, resolve: Function, reject: Function): void {
        const timeout = setTimeout(() => {
            this.pool.activeJobs.delete(task.id)
            reject(new Error(`Task ${task.id} timeout (${task.timeout || 30000}ms)`))
        }, task.timeout || 30000)

        this.pool.activeJobs.set(task.id, {
            worker,
            resolve,
            reject,
            timeout,
        })

        const message: WorkerMessage = {
            type: task.type,
            data: task.data,
            requestId: task.id,
        }

        worker.postMessage(message)
        this.logger.debug(`Task ${task.id} worker'a atandı`)
    }

    private processQueue(): void {
        while (this.pool.queue.length > 0) {
            const availableWorker = this.getAvailableWorker()
            if (!availableWorker) break

            const task = this.pool.queue.shift()!
            const resolve = (task as any).resolve
            const reject = (task as any).reject

            if (resolve && reject) {
                this.assignTask(availableWorker, task, resolve, reject)
            }
        }
    }

    public getStats() {
        return {
            totalWorkers: this.pool.workers.length,
            activeJobs: this.pool.activeJobs.size,
            queueLength: this.pool.queue.length,
            availableWorkers: this.pool.workers.length - this.pool.activeJobs.size,
        }
    }

    public async healthCheck(): Promise<boolean> {
        try {
            const healthPromises = this.pool.workers.map((worker, index) => {
                return new Promise<boolean>((resolve) => {
                    const timeout = setTimeout(() => resolve(false), 5000)

                    const messageHandler = (response: WorkerResponse) => {
                        if (response.requestId === `health-${index}`) {
                            clearTimeout(timeout)
                            worker.off("message", messageHandler)
                            resolve(response.success)
                        }
                    }

                    worker.on("message", messageHandler)
                    worker.postMessage({
                        type: "health-check",
                        requestId: `health-${index}`,
                    } as WorkerMessage)
                })
            })

            const results = await Promise.all(healthPromises)
            const healthyWorkers = results.filter(Boolean).length

            this.logger.info(`Worker sağlık kontrolü: ${healthyWorkers}/${this.pool.workers.length} sağlıklı`)

            return healthyWorkers === this.pool.workers.length
        } catch (error) {
            this.logger.error("Worker sağlık kontrolü hatası:", error)
            return false
        }
    }

    private setupGracefulShutdown(): void {
        const shutdown = async () => {
            if (this.isShuttingDown) return
            await this.shutdown()
        }

        process.on("SIGTERM", shutdown)
        process.on("SIGINT", shutdown)
    }

    public async shutdown(): Promise<void> {
        if (this.isShuttingDown) return

        this.isShuttingDown = true
        this.logger.info("🛑 Worker'lar kapatılıyor...")

        for (const [jobId, job] of this.pool.activeJobs.entries()) {
            clearTimeout(job.timeout)
            job.reject(new Error("Server kapatılıyor"))
        }
        this.pool.activeJobs.clear()

        this.pool.queue.forEach((task) => {
            const reject = (task as any).reject
            if (reject) reject(new Error("Server kapatılıyor"))
        })
        this.pool.queue = []

        const shutdownPromises = this.pool.workers.map((worker) => {
            return new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    worker.terminate()
                    resolve()
                }, 5000)

                worker.once("exit", () => {
                    clearTimeout(timeout)
                    resolve()
                })

                worker.postMessage({ type: "shutdown" } as WorkerMessage)
            })
        })

        await Promise.all(shutdownPromises)
        this.pool.workers = []

        this.logger.info("✅ Tüm worker'lar kapatıldı")
    }
}
