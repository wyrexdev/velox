const { createVeloxServer } = require("../../dist")

const server = createVeloxServer({
    port: 3002,
    security: {
        LOGGING: {
            ENABLED: false
        }
    },
    isProduction: false,
    COMPRESSION: {
        ENABLED: true,
        THRESHOLD: 1024,
        LEVEL: 9,
    },
    CLUSTER_MODE: true,
    WORKER_THREADS: 8
})

server.get("/", async (req, res) => {
    res.end("Hello World");
});

server.start().then(() => {
    console.log("🚀 API Server başlatıldı!")
})
