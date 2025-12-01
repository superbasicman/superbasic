
/**
 * Mock Redis implementation for testing
 * Simulates the subset of Redis commands used by the rate limiter
 */
export class MockRedis {
    private data: Map<string, { score: number; member: string }[]> = new Map();
    private expiries: Map<string, number> = new Map();

    constructor() { }

    async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
        const set = this.data.get(key) || [];
        const originalLength = set.length;
        const filtered = set.filter((item) => item.score < min || item.score > max);
        this.data.set(key, filtered);
        return originalLength - filtered.length;
    }

    async zcard(key: string): Promise<number> {
        const set = this.data.get(key);
        return set ? set.length : 0;
    }

    async zadd(key: string, ...args: (string | number | { score: number; member: string })[]): Promise<number> {
        let set = this.data.get(key) || [];
        let added = 0;

        // Handle object argument { score, member }
        if (args.length === 1 && typeof args[0] === 'object') {
            const item = args[0] as { score: number; member: string };
            set.push(item);
            added = 1;
        }
        // Handle score, member arguments
        else if (args.length >= 2) {
            for (let i = 0; i < args.length; i += 2) {
                const score = Number(args[i]);
                const member = String(args[i + 1]);
                set.push({ score, member });
                added++;
            }
        }

        // Sort by score
        set.sort((a, b) => a.score - b.score);
        this.data.set(key, set);
        return added;
    }

    async expire(key: string, seconds: number): Promise<number> {
        this.expiries.set(key, Date.now() + seconds * 1000);
        return 1;
    }

    async zrange(
        key: string,
        min: number,
        max: number,
        options?: { withScores?: boolean }
    ): Promise<(string | number)[]> {
        const set = this.data.get(key) || [];
        // Handle 0, 0 (first element) or 0, -1 (all)
        // Basic implementation for rate limiter usage (getting oldest entry)
        const start = min;
        const end = max === -1 ? set.length : max + 1;

        const slice = set.slice(start, end);

        if (options?.withScores) {
            const result: (string | number)[] = [];
            for (const item of slice) {
                result.push(item.member);
                result.push(item.score);
            }
            return result;
        }

        return slice.map(item => item.member);
    }

    // Helper to clear data between tests
    flushall() {
        this.data.clear();
        this.expiries.clear();
    }
}

export function createMockRedis() {
    return new MockRedis() as any;
}
