/** Reject a promise if it takes longer than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "Operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Must stay above mongo-connect serverSelectionTimeoutMS (20s) + a small buffer. */
export const MONGO_QUICK_TIMEOUT_MS = 30_000;
