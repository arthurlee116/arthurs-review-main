export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class NotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
