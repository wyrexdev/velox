import { createServer, Server } from 'http';
import { ClusterManager } from './cluster';
import { WorkerPool } from './worker-pool';
import { StreamManager } from './stream-manager';
import { Firewall } from '../security/firewall';
import { MemoryManager } from '../utils/memory-manager';

export class VeloxServer {
    private server: Server;
    private cluster: ClusterManager;
    private workers: WorkerPool;
    private streams: StreamManager;
    private firewall: Firewall;
    private memory: MemoryManager;

    constructor(private config: ServerConfig) {
        this.firewall = new Firewall(config.security);
        this.memory = new MemoryManager(config.memoryThreshold);
        this.workers = new WorkerPool(config.workerThreads);
        this.streams = new StreamManager(config.streamConfig);

        if (config.clusterMode) {
            this.cluster = new ClusterManager(this.createServer.bind(this));
        } else {
            this.createServer();
        }
    }

    private createServer() {
        this.server = createServer(async (req, res) => {
            if (this.firewall.inspect(req)) {
                return res.writeHead(403).end();
            }

            if (this.memory.isUnderPressure()) {
                return res.writeHead(503).end();
            }

            const processor = this.streams.getProcessor(req);
            await processor.handle(req, res, this.workers);
        });

        this.server.listen(this.config.port);
    }

    public upgradeToHTTPS(sslOptions: SSLOptions) {
    }

    public getClusterMetrics() {
        return this.cluster?.getMetrics();
    }
}