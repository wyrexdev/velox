const { createVeloxServer, VeloxRouter } = require("@velox/server")

const server = createVeloxServer({
    port: 3002,
    security: {
        RATE_LIMIT: {
            WINDOW_MS: 15 * 60 * 1000,
            MAX_REQUESTS: 10000000000000,
        },
        CORS: {
            ALLOWED_ORIGINS: ["http://localhost:3000", "https://myapp.com"],
            METHODS: ["GET", "POST", "PUT", "DELETE"],
            ALLOW_CREDENTIALS: true,
        },
    },
})

const database = {
    /** @type {User[]} */
    users: [
        { id: 1, name: "Ahmet Yılmaz", email: "ahmet@example.com", role: "admin" },
        { id: 2, name: "Ayşe Demir", email: "ayse@example.com", role: "user" },
        { id: 3, name: "Mehmet Kaya", email: "mehmet@example.com", role: "user" },
    ],
    /** @type {Post[]} */
    posts: [
        { id: 1, title: "İlk Yazı", content: "Bu ilk yazımız", userId: 1, createdAt: "2024-01-15T10:00:00Z" },
        { id: 2, title: "İkinci Yazı", content: "Bu ikinci yazımız", userId: 2, createdAt: "2024-01-15T11:00:00Z" },
    ],
}

const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.replace("Bearer ", "")

    if (!token) {
        server.sendJson(res, 401, {
            error: "Token gerekli",
            message: "Authorization header'ında Bearer token göndermelisiniz",
        })
        return
    }

    if (token !== "valid-token-123") {
        server.sendJson(res, 403, {
            error: "Geçersiz token",
            message: "Gönderilen token geçerli değil",
        })
        return
    }

    req.user = { id: 1, name: "Ahmet Yılmaz", role: "admin" }
    next()
}

const logMiddleware = async (req, res, next) => {
    const start = Date.now()

    console.log(`📥 ${req.method} ${req.url} - ${req.ip}`)

    const originalSend = res.end
    res.end = function (...args) {
        const duration = Date.now() - start
        console.log(`📤 ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`)
        originalSend.apply(this, args)
    }

    next()
}

server.use(logMiddleware)

const apiRouter = new VeloxRouter("/api/v1")

apiRouter.get("/users", async (req, res) => {
    const { page = 1, limit = 10, search } = req.query

    let users = [...database.users]

    if (search) {
        users = users.filter(
            (user) =>
                user.name.toLowerCase().includes(search.toLowerCase()) ||
                user.email.toLowerCase().includes(search.toLowerCase()),
        )
    }

    // @ts-ignore
    const startIndex = (page - 1) * limit
    // @ts-ignore
    const endIndex = startIndex + Number.parseInt(limit)
    const paginatedUsers = users.slice(startIndex, endIndex)

    server.sendJson(res, 200, {
        data: paginatedUsers,
        pagination: {
            // @ts-ignore
            page: Number.parseInt(page),
            // @ts-ignore
            limit: Number.parseInt(limit),
            total: users.length,
            // @ts-ignore
            pages: Math.ceil(users.length / limit),
        },
    })
})

apiRouter.get("/users/:id", async (req, res) => {
    const { id } = req.params
    const user = database.users.find((u) => u.id === Number.parseInt(id))

    if (!user) {
        server.sendJson(res, 404, {
            error: "Kullanıcı bulunamadı",
            message: `ID ${id} ile kullanıcı mevcut değil`,
        })
        return
    }

    server.sendJson(res, 200, { data: user })
})

apiRouter.post("/users", async (req, res) => {
    const { name, email, role = "user" } = req.body.fields

    // Validasyon
    if (!name || !email) {
        server.sendJson(res, 400, {
            error: "Eksik bilgi",
            message: "Ad ve email alanları gerekli",
            required: ["name", "email"],
        })
        return
    }

    const emailExists = database.users.some((u) => u.email === email)
    if (emailExists) {
        server.sendJson(res, 409, {
            error: "Email zaten kullanımda",
            message: "Bu email adresi başka bir kullanıcı tarafından kullanılıyor",
        })
        return
    }

    const newUser = {
        id: Math.max(...database.users.map((u) => u.id)) + 1,
        name,
        email,
        role,
        createdAt: new Date().toISOString(),
    }

    database.users.push(newUser)

    server.sendJson(res, 201, {
        message: "Kullanıcı başarıyla oluşturuldu",
        data: newUser,
    })
})

apiRouter.get(
    "/profile",
    async (req, res) => {
        server.sendJson(res, 200, {
            message: "Profil bilgileri",
            user: req.user,
            timestamp: new Date().toISOString(),
        })
    },
    authMiddleware,
)

apiRouter.get(
    "/admin/stats",
    async (req, res) => {
        if (req.user.role !== "admin") {
            server.sendJson(res, 403, {
                error: "Yetkisiz erişim",
                message: "Bu işlem için admin yetkisi gerekli",
            })
            return
        }

        server.sendJson(res, 200, {
            stats: {
                totalUsers: database.users.length,
                totalPosts: database.posts.length,
                adminUsers: database.users.filter((u) => u.role === "admin").length,
                serverUptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
            },
        })
    },
    authMiddleware,
)

server.mount("/api/v1", apiRouter)

// @ts-ignore
server.get("/", async (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>VELOX API Server</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .endpoint { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; }
            .method { display: inline-block; padding: 5px 10px; border-radius: 3px; color: white; font-weight: bold; }
            .get { background: #28a745; }
            .post { background: #007bff; }
            .put { background: #ffc107; color: black; }
            .delete { background: #dc3545; }
            code { background: #e9ecef; padding: 2px 5px; border-radius: 3px; }
        </style>
    </head>
    <body>
        <h1>🚀 VELOX API Server</h1>
        <p>API endpoints:</p>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>/api/v1/users</code> - Kullanıcı listesi (sayfalama ve arama destekli)
        </div>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>/api/v1/users/:id</code> - Kullanıcı detayı
        </div>
        
        <div class="endpoint">
            <span class="method post">POST</span>
            <code>/api/v1/users</code> - Yeni kullanıcı oluştur
        </div>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>/api/v1/profile</code> - Profil bilgileri (Token gerekli)
        </div>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>/api/v1/admin/stats</code> - Admin istatistikleri (Admin token gerekli)
        </div>
        
        <h3>Test Komutları:</h3>
        <pre>
# Kullanıcı listesi
curl http://localhost:3002/api/v1/users

# Kullanıcı detayı
curl http://localhost:3002/api/v1/users/1

# Yeni kullanıcı oluştur
curl -X POST http://localhost:3002/api/v1/users \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Yeni Kullanıcı","email":"yeni@example.com"}'

# Profil bilgileri (token ile)
curl http://localhost:3002/api/v1/profile \\
  -H "Authorization: Bearer valid-token-123"
        </pre>
    </body>
    </html>
  `

    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.end(html)
})

// @ts-ignore
server.use(async (req, res, next) => {
    try {
        await next()
    } catch (error) {
        console.error("❌ Sunucu hatası:", error)

        if (!res.headersSent) {
            server.sendJson(res, 500, {
                error: "Sunucu hatası",
                message: "Bir şeyler ters gitti",
                timestamp: new Date().toISOString(),
            })
        }
    }
})

server.start().then(() => {
    console.log("🚀 API Server başlatıldı!")
    console.log("📍 http://localhost:3002")
    console.log("📚 API Dokümantasyonu: http://localhost:3002")
    console.log("🔑 Test Token: valid-token-123")
})
