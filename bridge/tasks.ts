type PendingTask<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const tasks = new Map<string, PendingTask<unknown>>();

export type TaskResult<T> = Promise<T>;

export function createTask<T>(requestId: string, timeoutMs: number): TaskResult<T> {
  if (tasks.has(requestId)) {
    rejectTask(requestId, new Error(`Duplicate task request: ${requestId}`));
  }

  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: Error) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const timeout = setTimeout(() => {
    rejectTask(requestId, new Error('Plugin task timed out'));
  }, timeoutMs);

  tasks.set(requestId, {
    promise,
    resolve: resolvePromise as (value: unknown) => void,
    reject: rejectPromise,
    timeout
  });

  return promise;
}

export function resolveTask<T>(requestId: string, value: T): void {
  const task = tasks.get(requestId);
  if (!task) {
    return;
  }

  clearTimeout(task.timeout);
  tasks.delete(requestId);
  (task.resolve as (result: T) => void)(value);
}

export function rejectTask(requestId: string, error: Error): void {
  const task = tasks.get(requestId);
  if (!task) {
    return;
  }

  clearTimeout(task.timeout);
  tasks.delete(requestId);
  task.reject(error);
}

export function hasTask(requestId: string): boolean {
  return tasks.has(requestId);
}
