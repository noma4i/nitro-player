type CheckAllAndOnly<T, A extends readonly (keyof T)[]> = Exclude<keyof T, A[number]> extends never ? Exclude<A[number], keyof T> extends never ? A : ['Extra keys', Exclude<A[number], keyof T>] : ['Missing keys', Exclude<keyof T, A[number]>];
/**
 * Compile-time guard that an array enumerates exactly the keys of `T`
 * (no missing keys, no extras). Used to keep event registries in sync
 * with their event interfaces.
 */
export declare function allKeysOf<T>(): <A extends readonly (keyof T)[]>(...arr: A) => CheckAllAndOnly<T, A>;
export {};
//# sourceMappingURL=typeHelpers.d.ts.map