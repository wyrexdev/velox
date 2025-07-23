import { SecurityConfig } from '@/types';
import { cpus } from 'os';

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    ALLOWED_MIME_TYPES: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'application/pdf',
        'text/plain',
        'text/csv',
        'application/json',
        'application/zip',
        'application/x-zip-compressed',
        'video/mp4',
        'video/webm',
        'audio/mpeg',
        'audio/wav',
        'audio/ogg'
    ],
    RATE_LIMIT: {
        WINDOW_MS: 15 * 60 * 1000,
        MAX_REQUESTS: 1000
    },
    CORS: {
        ALLOWED_ORIGINS: [
            ''
        ],
        METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
        ALLOW_CREDENTIALS: true
    },
    TRUSTED_PROXIES: [
        '127.0.0.1',
        '::1',
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16'
    ],
    FILE_HASHING: true,
    FILE_VIRUS_SCAN: false,
    CLUSTER_MODE: process.env.CLUSTER_MODE === 'true',
    WORKER_THREADS: Math.max(2, Math.floor(cpus().length * 0.75)),
    COMPRESSION: {
        ENABLED: true,
        THRESHOLD: 1024,
        LEVEL: 6
    },
    LOGGING: {
        ENABLED: true,
        LEVEL: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        FORMAT: process.env.NODE_ENV === 'production' ? 'json' : 'text'
    }
};

export const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'",
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), speaker=()',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'X-Powered-By': 'VELOX Server'
};

export const FILE_SIGNATURES = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
    'application/zip': [[0x50, 0x4B, 0x03, 0x04], [0x50, 0x4B, 0x05, 0x06], [0x50, 0x4B, 0x07, 0x08]],
    'application/gzip': [[0x1F, 0x8B, 0x08]],
    'video/mp4': [[0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]],
    'audio/mpeg': [[0xFF, 0xFB], [0xFF, 0xF3], [0xFF, 0xF2]],
    'audio/wav': [[0x52, 0x49, 0x46, 0x46]]
} as const;
