export function assert(condition: boolean, message?: string): asserts condition {
    if (import.meta.env.DEV && !condition) {
        throw new Error(`(Assertion error) ${message ?? ''}`);
    }
}
