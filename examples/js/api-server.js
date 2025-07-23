const { createVeloxServer, VeloxRouter, ultraFast, createUltraFastServer } = require("@velox/server")

const server = createUltraFastServer({
    port: 3002,
    security: {
        LOGGING: {
            ENABLED: false
        }
    }
})

server.get("/", async (req, res) => {
  res.end("Hello World");
});

server.start().then(() => {
    console.log("🚀 API Server başlatıldı!")
})
