export function assert(condition: boolean, message?: string): asserts condition {
    if (process.env.DEV && !condition) {
        throw new Error(`(Assertion error) ${message ?? ''}`);
    }
}
