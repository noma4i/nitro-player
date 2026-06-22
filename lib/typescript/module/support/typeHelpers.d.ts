type CheckAllAndOnly<T, A extends readonly (keyof T)[]> = Exclude<keyof T, A[number]> extends never ? Exclude<A[number], keyof T> extends never ? A : ['Extra keys', Exclude<A[number], keyof T>] : ['Missing keys', Exclude<keyof T, A[number]>];
/**
 * Compile-time guard that an array enumerates exactly the keys of `T`
 * (no missing keys, no extras). Used to keep event registries in sync
 * with their event interfaces.
 */
export declare function allKeysOf<T>(): <A extends readonly (keyof T)[]>(...arr: A) => CheckAllAndOnly<T, A>;
type CheckExactUnion<T extends string, A extends readonly T[]> = [
    T
] extends [A[number]] ? A : ['Missing union members', Exclude<T, A[number]>];
/**
 * Compile-time guard that a runtime tuple enumerates exactly the members of a
 * string-literal union `T` (no missing members, no extras). Lets a single
 * runtime tuple act as the source of truth for validation while the union type
 * stays an explicit alias — required because Nitrogen rejects `typeof tuple[number]`
 * unions on the native bridge. Drift between the two fails the build.
 */
export declare function unionTuple<T extends string>(): <A extends readonly T[]>(...members: A) => CheckExactUnion<T, A>;
export {};
//# sourceMappingURL=typeHelpers.d.ts.map