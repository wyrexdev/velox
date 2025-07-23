const { createVeloxServer, VeloxRouter } = require("@velox/server")

const server = createVeloxServer({
    port: 3002,
    security: {
        WORKER_THREADS: 16,
        RATE_LIMIT: {
            WINDOW_MS: 15 * 60 * 1000,
            MAX_REQUESTS: 10000000000000,
        },
        LOGGING: {
            ENABLED: false
        }
    },
    isProduction: false
})

server.get("/", async (req, res) => {
  res.end("Hello World");
});

server.start().then(() => {
    console.log("🚀 API Server başlatıldı!")
})
