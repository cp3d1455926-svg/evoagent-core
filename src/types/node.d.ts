/**
 * Minimal Node.js type declarations for EvoAgent
 * (Fallback when @types/node is not installed)
 */

declare module 'child_process' {
  export function exec(
    command: string,
    options?: { timeout?: number; cwd?: string; maxBuffer?: number; encoding?: string }
  ): Promise<{ stdout: string; stderr: string }>;
  export function execSync(
    command: string,
    options?: { timeout?: number; cwd?: string; maxBuffer?: number; encoding?: string }
  ): Buffer;
}

declare module 'util' {
  export function promisify<T extends (...args: any[]) => any>(fn: T): T;
}

declare module 'fs/promises' {
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string, encoding: string): Promise<void>;
  export function unlink(path: string): Promise<void>;
  export function access(path: string, mode?: number): Promise<void>;
  export function readdir(path: string): Promise<string[]>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number }>;
}

declare module 'fs' {
  export const constants: { F_OK: number; R_OK: number; W_OK: number; X_OK: number };
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string, encoding: string): void;
}

declare module 'path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
  export function extname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function relative(from: string, to: string): string;
  export const sep: string;
}

declare module 'os' {
  export function homedir(): string;
  export function tmpdir(): string;
  export function platform(): string;
  export function arch(): string;
  export function cpus(): Array<{ model: string; speed: number; times: object }>;
  export function totalmem(): number;
  export function freemem(): number;
  export function hostname(): string;
  export function networkInterfaces(): Record<string, Array<{ address: string; family: string; internal: boolean }>>;
  export const EOL: string;
}

declare module 'url' {
  export function fileURLToPath(url: string): string;
  export function pathToFileURL(path: string): { href: string };
}

declare module 'crypto' {
  export function randomUUID(): string;
  export function createHash(algorithm: string): { update(data: string): { digest(encoding: string): string } };
}

declare module 'events' {
  export class EventEmitter {
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
    removeListener(event: string, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string): this;
  }
}

declare module 'stream' {
  export class Readable {
    constructor(opts?: { read?: () => void; encoding?: string });
    on(event: string, listener: (...args: any[]) => void): this;
    pipe(dest: Writable): Writable;
    read(size?: number): string | Buffer | null;
    setEncoding(encoding: string): this;
    resume(): this;
    pause(): this;
    destroy(error?: Error): this;
    destroyed: boolean;
    readable: boolean;
  }
  export class Writable {
    constructor(opts?: { write?: (chunk: any, encoding: string, callback: () => void) => void });
    write(chunk: any, encoding?: string, callback?: () => void): boolean;
    end(chunk?: any, encoding?: string, callback?: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    destroy(error?: Error): this;
    destroyed: boolean;
    writable: boolean;
  }
}

declare module 'process' {
  export const argv: string[];
  export const env: Record<string, string | undefined>;
  export function cwd(): string;
  export function exit(code?: number): never;
  export const platform: string;
  export const version: string;
  export const versions: Record<string, string | undefined>;
  export function memoryUsage(): { heapUsed: number; heapTotal: number; rss: number; external: number };
  export function uptime(): number;
  export function kill(pid: number, signal?: string | number): void;
  export function on(event: string, listener: (...args: any[]) => void): void;
  export const stdin: unknown;
  export const stdout: unknown;
  export const stderr: unknown;
}

declare module 'readline' {
  export interface Interface {
    question: (query: string, callback: (answer: string) => void) => void;
    close: () => void;
    prompt: (preserveCursor?: boolean) => void;
    on: (event: string, listener: (...args: any[]) => void) => this;
  }
  export function createInterface(opts: { input: any; output: any; prompt?: string }): Interface;
}
