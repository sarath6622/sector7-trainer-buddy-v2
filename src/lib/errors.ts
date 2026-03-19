export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Map AppError codes to HTTP-friendly error responses */
export function toErrorResponse(error: unknown): { error: string; code: string; status: number } {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      status: error.statusCode,
    };
  }

  return {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    status: 500,
  };
}
