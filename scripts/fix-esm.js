const fs = require("fs")
const path = require("path")

function fixEsmFiles(dir) {
    const files = fs.readdirSync(dir)

    files.forEach((file) => {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)

        if (stat.isDirectory()) {
            fixEsmFiles(filePath)
        } else if (file.endsWith(".js")) {
            const content = fs.readFileSync(filePath, "utf8")

            const updatedContent = content.replace(/from\s+['"](\.[^'"]*?)(?:\.js)?['"]/g, "from '$1.mjs'")

            const mjsPath = filePath.replace(/\.js$/, ".mjs")
            fs.writeFileSync(mjsPath, updatedContent)
            fs.unlinkSync(filePath)
        }
    })
}

const esmDir = path.join(__dirname, "../dist/esm")
if (fs.existsSync(esmDir)) {
    fixEsmFiles(esmDir)

    const indexMjs = path.join(esmDir, "index.mjs")
    const targetPath = path.join(__dirname, "../dist/index.mjs")

    if (fs.existsSync(indexMjs)) {
        fs.copyFileSync(indexMjs, targetPath)
    }
}

console.log("✅ ESM build fixed successfully")

