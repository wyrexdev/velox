const { createVeloxServer, VeloxRouter } = require("@velox/server")

const server = createVeloxServer({
    port: 3002,
    security: {
        RATE_LIMIT: {
            WINDOW_MS: 15 * 60 * 1000,
            MAX_REQUESTS: Number.MAX_SAFE_INTEGER,
        },
        LOGGING: {
            ENABLED: false
        }
    },
    // Benchmark ortamı için cluster ve worker thread ayarları
    CLUSTER_MODE: true,
    WORKER_THREADS: require('os').cpus().length,
})

server.get("/", async (req, res) => {
  res.end("Hello World");
});

server.start().then(() => {
    console.log("🚀 API Server başlatıldı!")
})
