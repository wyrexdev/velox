const fs = require("fs")
const path = require("path")

function fixPaths(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory ${dir} does not exist, skipping...`)
        return
    }

    const files = fs.readdirSync(dir)

    files.forEach((file) => {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)

        if (stat.isDirectory()) {
            fixPaths(filePath)
        } else if (file.endsWith(".js")) {
            let content = fs.readFileSync(filePath, "utf8")

            content = content.replace(/require$$["']@\/([^"']+)["']$$/g, (match, importPath) => {
                const relativePath = getRelativePath(filePath, dir, importPath)
                return `require("${relativePath}")`
            })

            content = content.replace(/from\s+["']@\/([^"']+)["']/g, (match, importPath) => {
                const relativePath = getRelativePath(filePath, dir, importPath)
                return `from "${relativePath}"`
            })

            content = content.replace(/import$$["']@\/([^"']+)["']$$/g, (match, importPath) => {
                const relativePath = getRelativePath(filePath, dir, importPath)
                return `import("${relativePath}")`
            })

            fs.writeFileSync(filePath, content)
        }
    })
}

function getRelativePath(fromFile, baseDir, importPath) {
    const fromDir = path.dirname(fromFile)
    const targetPath = path.join(baseDir, importPath)

    let finalTargetPath = targetPath
    if (!path.extname(targetPath)) {
        if (fs.existsSync(targetPath + ".js")) {
            finalTargetPath = targetPath + ".js"
        } else if (fs.existsSync(path.join(targetPath, "index.js"))) {
            finalTargetPath = path.join(targetPath, "index.js")
        }
    }

    let relativePath = path.relative(fromDir, finalTargetPath)

    if (!relativePath.startsWith(".")) {
        relativePath = "./" + relativePath
    }

    relativePath = relativePath.replace(/\\/g, "/")

    return relativePath
}

const targetDir = process.argv[2]
if (!targetDir) {
    console.error("Please provide a directory path")
    process.exit(1)
}

console.log(`Fixing paths in ${targetDir}...`)
fixPaths(targetDir)
console.log("✅ Paths fixed successfully")
