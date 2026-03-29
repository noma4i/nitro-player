"use strict";

export class NitroPlayerError extends Error {
  get code() {
    return this._code;
  }
  get message() {
    return this._message;
  }
  get stack() {
    return this._stack;
  }

  /**
   * @internal
   */
  constructor(code, message, stack) {
    super(`[${code}]: ${message}`);
    super.name = `[NitroPlay] ${code}`;
    super.message = message;
    this._code = code;
    this._message = message;
    this._stack = stack ?? super.stack;
  }
  toString() {
    let string = `[${this.code}]: ${this.message}`;
    return string;
  }
}
export class NitroPlayerComponentError extends NitroPlayerError {}
export class NitroPlayerRuntimeError extends NitroPlayerError {}
const NATIVE_ERROR_REGEX = /\{%@([^:]+)::([^@]+)@%\}/;
const getCodeAndMessage = message => {
  const match = message.match(NATIVE_ERROR_REGEX);
  if (match && match.length === 3 && typeof match[1] === 'string' && typeof match[2] === 'string') {
    return {
      code: match[1],
      message: match[2]
    };
  }
  return null;
};

/**
 * Check if the error has a stack property
 * If it does, it will try to parse the error message in the stack trace
 * and replace it with the proper code and message
 */
const maybeFixErrorStack = error => {
  if ('stack' in error && typeof error.stack === 'string') {
    const stack = error.stack;
    const match = stack.match(NATIVE_ERROR_REGEX);
    if (match && match.length === 3 && typeof match[1] === 'string' && typeof match[2] === 'string') {
      error.stack = error.stack.replace(NATIVE_ERROR_REGEX, `[${match[1]}]: ${match[2]}`);
    }
  }
};
const isNitroPlayerError = error => typeof error === 'object' && error != null &&
// @ts-expect-error error is still unknown
typeof error.message === 'string' &&
// @ts-expect-error error is still unknown
getCodeAndMessage(error.message) != null;
const hasStack = error => typeof error === 'object' && error != null && 'stack' in error && typeof error.stack === 'string';

/**
 * Tries to parse an error coming from native to a typed JS video error.
 * @param {NitroPlayerError} nativeError The native error instance. This is a JSON in the legacy native module architecture.
 * @returns A {@linkcode NitroPlayerRuntimeError} or {@linkcode NitroPlayerComponentError}, or the `nativeError` itself if it's not parsable
 * @method
 */
export const tryParseNativeNitroPlayerError = nativeError => {
  if (isNitroPlayerError(nativeError)) {
    const result = getCodeAndMessage(nativeError.message);
    if (result == null) {
      return nativeError;
    }
    const {
      code,
      message
    } = result;
    maybeFixErrorStack(nativeError);
    if (code.startsWith('view')) {
      return new NitroPlayerComponentError(code, message, hasStack(nativeError) ? nativeError.stack : undefined);
    }
    return new NitroPlayerRuntimeError(
    // @ts-expect-error the code is string, we narrow it down to TS union.
    code, message, hasStack(nativeError) ? nativeError.stack : undefined);
  }
  return nativeError;
};
//# sourceMappingURL=NitroPlayerError.js.map