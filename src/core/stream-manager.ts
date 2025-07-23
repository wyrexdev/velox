import { Transform, pipeline } from 'stream';
import { createBrotliCompress, createGzip } from 'zlib';
import { FileValidator } from '../security/validator';

export class StreamManager {
    private validators = new FileValidator();

    getProcessor(req: Request) {
        return {
            handle: async (req: Request, res: Response, workers: WorkerPool) => {
                const transformStreams = this.createTransforms(req);

                pipeline(
                    req,
                    ...transformStreams,
                    this.createSecurityScanner(),
                    res,
                    (err) => err && console.error('Stream error:', err)
                );
            }
        };
    }

    private createTransforms(req: Request): Transform[] {
        const transforms: Transform[] = [];

        // Compression
        if (req.headers['accept-encoding']?.includes('br')) {
            transforms.push(createBrotliCompress());
        } else if (req.headers['accept-encoding']?.includes('gzip')) {
            transforms.push(createGzip());
        }

        // Encryption
        if (req.url?.startsWith('/secure')) {
            transforms.push(this.createEncryptor());
        }

        return transforms;
    }

    private createSecurityScanner(): Transform {
        return new Transform({
            transform(chunk, encoding, callback) {
                if (this.validators.isMalicious(chunk)) {
                    return callback(new Error('Security threat detected'));
                }
                callback(null, chunk);
            }
        });
    }
}