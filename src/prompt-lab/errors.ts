export class PromptLabError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'PromptLabError';
  }

  static isPromptLabError(error: unknown): error is PromptLabError {
    return error instanceof PromptLabError;
  }

  static fromUnknown(error: unknown, defaultMessage = 'Unknown error occurred'): PromptLabError {
    if (PromptLabError.isPromptLabError(error)) {
      return error;
    }
    
    if (error instanceof Error) {
      return new PromptLabError(error.message, 'UNKNOWN_ERROR');
    }
    
    const message = typeof error === 'string' ? error : defaultMessage;
    return new PromptLabError(message, 'UNKNOWN_ERROR');
  }
}