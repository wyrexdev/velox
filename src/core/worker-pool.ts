import { Worker, isMainThread, parentPort } from 'worker_threads';
import { cpus } from 'os';

export class WorkerPool {
    private pool: Worker[];
    private taskQueue: Array<{
        task: any;
        resolve: (value: unknown) => void;
        reject: (reason?: any) => void;
    }> = [];

    constructor(private size: number = cpus().length) {
        this.pool = Array(size).fill(null).map(() => this.createWorker());
    }

    private createWorker(): Worker {
        const worker = new Worker(__filename, {
            workerData: { workerId: Math.random().toString(36).slice(2) }
        });

        worker.on('message', (result) => {
            const { resolve } = this.taskQueue.shift()!;
            resolve(result);
            this.pool.push(this.createWorker());
        });

        worker.on('error', (err) => {
            const { reject } = this.taskQueue.shift()!;
            reject(err);
        });

        return worker;
    }

    public execute(task: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.pool.length > 0) {
                const worker = this.pool.pop()!;
                worker.postMessage(task);
            } else {
                this.taskQueue.push({ task, resolve, reject });
            }
        });
    }
}

if (!isMainThread) {
    parentPort!.on('message', async (task) => {
        parentPort!.postMessage(await processTask(task));
    });
}