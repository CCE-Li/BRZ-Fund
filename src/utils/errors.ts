export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export class ValidationError extends AppError {
  readonly fields: string[];

  constructor(message: string, fields: string[] = []) {
    super('validation', message);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

export class StorageUnavailableError extends AppError {
  constructor(message = '当前浏览器环境不可用或禁止了 IndexedDB，数据无法持久化保存。') {
    super('storage_unavailable', message);
    this.name = 'StorageUnavailableError';
  }
}

export class StorageError extends AppError {
  constructor(message: string) {
    super('storage', message);
    this.name = 'StorageError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('not_found', message);
    this.name = 'NotFoundError';
  }
}

export class DuplicateError extends AppError {
  constructor(message: string) {
    super('duplicate', message);
    this.name = 'DuplicateError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', message);
    this.name = 'ConflictError';
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
