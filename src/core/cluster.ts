import cluster from 'cluster';
import { cpus } from 'os';
import { VeloxServer } from './server';

export class ClusterManager {
    private workers: any[] = [];

    constructor(private serverFactory: () => void) {
        this.init();
    }

    private init() {
        if (cluster.isPrimary) {
            console.log(`Master ${process.pid} is running`);

            for (let i = 0; i < this.optimalWorkerCount(); i++) {
                this.forkWorker();
            }

            cluster.on('exit', (worker, code, signal) => {
                console.log(`Worker ${worker.process.pid} died`);
                this.forkWorker();
            });
        } else {
            this.serverFactory();
        }
    }

    private forkWorker() {
        const worker = cluster.fork();
        this.workers.push({
            pid: worker.process.pid,
            load: 0
        });
    }

    private optimalWorkerCount(): number {
        return Math.max(2, cpus().length - 1);
    }

    public getMetrics() {
        return this.workers.map(w => ({
            pid: w.pid,
            load: Math.random()
        }));
    }
}