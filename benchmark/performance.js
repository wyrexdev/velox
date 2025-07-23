const { createVeloxServer } = require("../dist/index.js")
const http = require("http")

async function runBenchmark() {
    console.log("🚀 Starting Velox Server Performance Benchmark\n")

    const server = createVeloxServer({
        port: 3001,
        security: {
            RATE_LIMIT: {
                WINDOW_MS: 60000,
                MAX_REQUESTS: 10000,
            },
        },
    })

    server.get("/", async (req, res) => {
        server.sendJson(res, 200, { message: "Hello World!" })
    })

    server.get("/json", async (req, res) => {
        server.sendJson(res, 200, {
            timestamp: Date.now(),
            data: { users: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `User ${i}` })) },
        })
    })

    await server.start()

    const results = await Promise.all([
        benchmark("Simple Route", "http://localhost:3001/", 1000, 10),
        benchmark("JSON Response", "http://localhost:3001/json", 1000, 10),
    ])

    console.log("\n📊 Benchmark Results:")
    results.forEach((result) => {
        console.log(`\n${result.name}:`)
        console.log(`  Requests: ${result.totalRequests}`)
        console.log(`  Duration: ${result.duration}ms`)
        console.log(`  RPS: ${result.rps}`)
        console.log(`  Avg Response Time: ${result.avgResponseTime}ms`)
    })

    await server.stop()
    process.exit(0)
}

function benchmark(name, url, requests, concurrency) {
    return new Promise((resolve) => {
        const startTime = Date.now()
        let completed = 0
        let totalResponseTime = 0

        function makeRequest() {
            const reqStart = Date.now()

            const req = http.get(url, (res) => {
                let data = ""
                res.on("data", (chunk) => (data += chunk))
                res.on("end", () => {
                    totalResponseTime += Date.now() - reqStart
                    completed++

                    if (completed < requests) {
                        makeRequest()
                    } else if (completed === requests) {
                        const duration = Date.now() - startTime
                        resolve({
                            name,
                            totalRequests: requests,
                            duration,
                            rps: Math.round(requests / (duration / 1000)),
                            avgResponseTime: Math.round(totalResponseTime / requests),
                        })
                    }
                })
            })

            req.on("error", (err) => {
                console.error("Request error:", err)
                completed++
                if (completed === requests) {
                    const duration = Date.now() - startTime
                    resolve({
                        name,
                        totalRequests: requests,
                        duration,
                        rps: Math.round(requests / (duration / 1000)),
                        avgResponseTime: Math.round(totalResponseTime / Math.max(1, requests - 1)),
                    })
                }
            })
        }

        for (let i = 0; i < Math.min(concurrency, requests); i++) {
            makeRequest()
        }
    })
}

if (require.main === module) {
    runBenchmark().catch(console.error)
}
