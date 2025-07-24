# 🏗️ Velox Server Architecture Guide

This document provides a comprehensive overview of the Velox Server codebase, explaining the purpose and functionality of each file and component.

## 📁 Project Structure Overview

```
@velox/server/
├── 📦 src/                    # Source code
│   ├── 🎯 core/              # Core server functionality
│   ├── 🛡️ middleware/        # Security & utility middleware
│   ├── 🔧 utils/             # Utility functions & optimizations
│   ├── 👷 workers/           # Worker thread handlers
│   ├── 📝 types/             # TypeScript type definitions
│   └── ⚙️ config/            # Configuration management
├── 🧪 examples/              # Usage examples & demos
├── 🚀 benchmarks/            # Performance testing
├── 📜 scripts/               # Build & utility scripts
└── 📋 Configuration Files    # Project setup files
```

---

## 🎯 Core Components (`src/core/`)

### `ultra-fast-server.ts` - Main Server Engine
**Purpose**: The heart of Velox Server - handles all HTTP requests with maximum performance
**Key Features**:
- Ultra-fast request routing using both FastRouter and VeloxRouter
- Cluster mode support for multi-process scaling
- Built-in compression, security, and rate limiting
- Real-time metrics collection
- Graceful shutdown handling

**When to modify**: Core server behavior, adding new server-level features

### `router.ts` - Advanced Routing System
**Purpose**: Full-featured router with middleware support and parameter extraction
**Key Features**:
- Dynamic route matching with parameters (`:id`, `*wildcard`)
- Middleware chain execution
- Route caching for performance
- Nested router mounting
- Route information and debugging

**When to modify**: Adding new routing features, middleware system changes

### `file-handler.ts` - File Processing Engine
**Purpose**: Handles file uploads, validation, and storage with security
**Key Features**:
- Multi-file upload support
- File signature validation (prevents malicious files)
- Virus scanning simulation
- Hash generation for integrity
- Stream-based processing for large files
- Automatic file categorization

**When to modify**: File validation rules, storage logic, security enhancements

### `request-parser.ts` - Request Body Parser
**Purpose**: Parses incoming request bodies (JSON, form-data, multipart)
**Key Features**:
- Multipart form data parsing
- JSON and URL-encoded parsing
- File extraction from multipart data
- Input sanitization
- Memory-efficient streaming

**When to modify**: Adding new content types, parsing logic improvements

---

## 🛡️ Middleware Components (`src/middleware/`)

### `security.ts` - Security Middleware Suite
**Purpose**: Comprehensive security protection for all requests
**Key Features**:
- OWASP-compliant security headers
- CORS protection with configurable origins
- Content-Type validation
- Request size limiting
- IP address validation and blocking
- Referer checking

**When to modify**: Adding new security rules, updating OWASP compliance

### `rate-limiter.ts` - Request Rate Limiting
**Purpose**: Prevents abuse and DDoS attacks through request throttling
**Key Features**:
- IP-based rate limiting
- Configurable time windows and limits
- Memory-efficient storage with cleanup
- Rate limit headers (X-RateLimit-*)
- Statistics and monitoring

**When to modify**: Rate limiting algorithms, storage mechanisms

---

## 🔧 Utility Components (`src/utils/`)

### `logger.ts` - Structured Logging System
**Purpose**: Comprehensive logging with multiple formats and levels
**Key Features**:
- Multiple log levels (debug, info, warn, error)
- JSON and text output formats
- File-based logging with rotation
- Colorized console output
- Request logging with timing
- Runtime enable/disable

**When to modify**: Log formats, output destinations, log levels

### `sanitizer.ts` - Input Sanitization
**Purpose**: Prevents XSS, injection attacks, and malicious input
**Key Features**:
- String sanitization (HTML entities, script removal)
- Filename sanitization (path traversal prevention)
- Recursive object sanitization
- Email and URL validation
- IP address validation
- SQL injection pattern detection

**When to modify**: Adding new sanitization rules, validation patterns

### `compression.ts` - Response Compression
**Purpose**: Reduces bandwidth usage through intelligent compression
**Key Features**:
- Multiple algorithms (Brotli, Gzip, Deflate)
- Content-type based compression decisions
- Configurable compression levels
- Buffer and stream compression
- Performance optimizations

**When to modify**: Compression algorithms, content-type rules

### `fast-json.ts` - Ultra-Fast JSON Processing
**Purpose**: High-performance JSON serialization with caching
**Key Features**:
- Pre-compiled schemas for common responses
- Caching for repeated serializations
- Fast parsing for simple objects
- Memory-efficient operations
- Schema-based optimization

**When to modify**: JSON performance optimizations, schema definitions

### `fast-headers.ts` - Pre-compiled HTTP Headers
**Purpose**: Ultra-fast HTTP header generation
**Key Features**:
- Pre-compiled common headers
- Buffer-based header construction
- Status code mapping
- Memory pooling for headers

**When to modify**: Header optimizations, new header types

### `fast-router.ts` - Ultra-Fast Route Matching
**Purpose**: Lightning-fast route matching with minimal overhead
**Key Features**:
- Static route optimization
- Radix tree for dynamic routes
- Route caching
- Parameter extraction
- Memory-efficient matching

**When to modify**: Routing performance, matching algorithms

### `response-pool.ts` - Object Pooling
**Purpose**: Reduces garbage collection pressure through object reuse
**Key Features**:
- Response object pooling
- Buffer pooling
- Memory management
- GC pressure reduction

**When to modify**: Memory optimization, pooling strategies

---

## 👷 Worker Components (`src/workers/`)

### `file-worker.ts` - File Processing Worker
**Purpose**: CPU-intensive file operations in separate threads
**Key Features**:
- File validation and scanning
- Hash calculation
- Image processing simulation
- Data processing tasks
- Health check support
- Graceful shutdown

**When to modify**: Adding new file processing tasks, worker capabilities

### `worker-manager.ts` - Worker Thread Management
**Purpose**: Manages pool of worker threads for optimal performance
**Key Features**:
- Worker pool management
- Task queue handling
- Load balancing
- Health monitoring
- Automatic worker restart
- Graceful shutdown

**When to modify**: Worker pool algorithms, task distribution

---

## 📝 Type Definitions (`src/types/`)

### `index.ts` - Complete Type System
**Purpose**: Comprehensive TypeScript definitions for the entire system
**Key Components**:
- `VeloxRequest` - Enhanced request object
- `VeloxFile` - File upload interface
- `SecurityConfig` - Configuration types
- `ServerMetrics` - Performance metrics
- `WorkerMessage/Response` - Worker communication

**When to modify**: Adding new features, API changes, type safety improvements

---

## ⚙️ Configuration (`src/config/`)

### `security.ts` - Security Configuration
**Purpose**: Default security settings and constants
**Key Features**:
- Default security configuration
- OWASP security headers
- File signature definitions
- MIME type mappings
- Security constants

**When to modify**: Security defaults, file type support, header policies

---

## 🧪 Examples Directory (`examples/`)

### `basic-usage.js` - Simple Server Example
**Purpose**: Demonstrates basic Velox Server usage
**Use Case**: Learning the fundamentals, quick prototyping

### `api-server.js` - Full API Server
**Purpose**: Complete REST API with authentication and validation
**Use Case**: Building production APIs, learning advanced features

### `performance-test.js` - Performance Benchmarking
**Purpose**: Automated performance testing and benchmarking
**Use Case**: Performance validation, optimization testing

### `real-time-server.js` - Server-Sent Events Demo
**Purpose**: Real-time communication using SSE
**Use Case**: Live updates, real-time dashboards

### `file-upload.ts` - File Upload Example
**Purpose**: Comprehensive file upload handling
**Use Case**: File management systems, media uploads

### `logger-worker-demo.js` - Advanced Features Demo
**Purpose**: Demonstrates logging and worker thread features
**Use Case**: Understanding advanced capabilities

### `ultra-fast-demo.ts` - Maximum Performance Demo
**Purpose**: Shows ultra-fast server capabilities
**Use Case**: High-performance applications

### `basic-server.ts` - TypeScript Basic Example
**Purpose**: TypeScript version of basic server
**Use Case**: TypeScript projects, type-safe development

### `advanced-server.ts` - Production-Ready Example
**Purpose**: Full-featured production server setup
**Use Case**: Production deployments, enterprise applications

### `full-config-server.ts` - Complete Configuration Demo
**Purpose**: Shows all configuration options
**Use Case**: Understanding all features, complex setups

### `test-full-config.sh` - Testing Script
**Purpose**: Automated testing of all server features
**Use Case**: Integration testing, feature validation

### `postman-collection.json` - API Testing Collection
**Purpose**: Postman collection for API testing
**Use Case**: API testing, development workflow

---

## 🚀 Benchmarks Directory (`benchmarks/`)

### `performance.js` - Basic Performance Test
**Purpose**: Simple performance benchmarking
**Use Case**: Quick performance checks

### `ultra-performance-test.js` - Advanced Benchmarking
**Purpose**: Comprehensive performance testing with clustering
**Use Case**: Production performance validation

---

## 📜 Scripts Directory (`scripts/`)

### `fix-paths.js` - Build Path Fixer
**Purpose**: Fixes import paths after TypeScript compilation
**Use Case**: Build process, CommonJS compatibility

### `fix-esm.js` - ESM Module Fixer
**Purpose**: Converts compiled JS to proper ESM modules
**Use Case**: ESM support, module compatibility

---

## 📋 Configuration Files

### `package.json` - Project Configuration
**Purpose**: NPM package configuration with scripts and dependencies
**Key Scripts**:
- `build` - Compile TypeScript to JavaScript
- `dev` - Development mode with hot reloading
- `test` - Run test suite
- `start` - Production server start

### `tsconfig.json` - TypeScript Configuration
**Purpose**: Main TypeScript compiler configuration
**Features**: Strict mode, path mapping, modern ES target

### `tsconfig.cjs.json` - CommonJS Build Config
**Purpose**: Builds CommonJS compatible modules
**Use Case**: Node.js compatibility, legacy support

### `tsconfig.esm.json` - ESM Build Config
**Purpose**: Builds ES modules
**Use Case**: Modern module support, tree shaking

### `tsconfig.types.json` - Type Definitions Build
**Purpose**: Generates TypeScript declaration files
**Use Case**: Type support for consumers

### `.eslintrc.json` - Code Quality Configuration
**Purpose**: ESLint rules for code quality and consistency
**Features**: TypeScript support, strict rules

### `prettier.config.js` - Code Formatting
**Purpose**: Consistent code formatting across the project
**Features**: 2-space indentation, semicolons, single quotes

### `.gitignore` - Git Ignore Rules
**Purpose**: Excludes build artifacts, dependencies, and sensitive files
**Includes**: node_modules, dist, .env files, logs

### `.npmignore` - NPM Publish Exclusions
**Purpose**: Excludes development files from NPM package
**Excludes**: Source files, tests, development configs

### `jest.config.js` - Testing Configuration
**Purpose**: Jest test runner configuration
**Features**: TypeScript support, coverage reporting

---

## 🔄 Data Flow Architecture

```
HTTP Request
     ↓
[Security Middleware] → Rate Limiting → CORS → Headers
     ↓
[Request Parser] → Body Parsing → File Extraction → Sanitization
     ↓
[Router] → Route Matching → Parameter Extraction → Middleware Chain
     ↓
[Handler] → Business Logic → File Processing (Worker) → Response
     ↓
[Response] → Compression → Headers → Logging → Client
```

## 🎯 Performance Optimizations

### Request Level
- **Fast Router**: O(1) static route lookup
- **Route Caching**: Compiled route patterns
- **Header Pooling**: Pre-compiled headers
- **Buffer Reuse**: Object pooling for GC reduction

### File Processing
- **Stream Processing**: Memory-efficient large file handling
- **Worker Threads**: CPU-intensive tasks in separate threads
- **Signature Validation**: Fast file type detection
- **Hash Caching**: Cached file integrity checks

### Response Level
- **JSON Optimization**: Schema-based fast serialization
- **Compression**: Intelligent content compression
- **Keep-Alive**: Connection reuse
- **Clustering**: Multi-process scaling

## 🛡️ Security Layers

### Input Validation
- **Sanitization**: XSS and injection prevention
- **File Validation**: Signature and content checking
- **Size Limits**: Request and file size restrictions
- **Type Checking**: MIME type validation

### Access Control
- **Rate Limiting**: Request throttling per IP
- **CORS**: Cross-origin request control
- **IP Filtering**: Trusted proxy validation
- **Header Validation**: Security header enforcement

### File Security
- **Malware Scanning**: Simulated virus detection
- **Path Traversal**: Directory traversal prevention
- **File Signatures**: Binary signature validation
- **Hash Verification**: File integrity checking

---

## 🔧 Customization Points

### Adding New Routes
1. Modify `ultra-fast-server.ts` for simple routes
2. Use `VeloxRouter` for complex routing with middleware
3. Add route handlers in appropriate example files

### Security Enhancements
1. Update `security.ts` for new security rules
2. Modify `sanitizer.ts` for input validation
3. Extend `rate-limiter.ts` for advanced throttling

### Performance Optimizations
1. Enhance `fast-*.ts` files for speed improvements
2. Modify worker files for parallel processing
3. Update compression logic in `compression.ts`

### File Processing
1. Extend `file-handler.ts` for new file types
2. Add worker tasks in `file-worker.ts`
3. Update validation rules in security config

This architecture guide provides a complete understanding of how Velox Server is structured and how each component contributes to its ultra-fast, ultra-secure operation. Use this as a reference when contributing to or customizing the server for your specific needs.
