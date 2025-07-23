import { IncomingMessage } from 'http';
import { RateLimiter } from './rate-limiter';

export class Firewall {
    private blacklist = new Set<string>();
    private rateLimiter = new RateLimiter();

    constructor(private config: SecurityConfig) {
        this.loadBlacklist();
    }

    public inspect(req: IncomingMessage): boolean {
        const ip = this.getClientIP(req);

        return this.isBlacklisted(ip) ||
            this.isRateLimited(ip) ||
            this.hasMaliciousHeaders(req);
    }

    private isRateLimited(ip: string): boolean {
        return this.rateLimiter.check(ip) > this.config.rateLimitThreshold;
    }

    private getClientIP(req: IncomingMessage): string {
        return req.headers['x-forwarded-for'] as string ||
            req.socket.remoteAddress || '';
    }
}