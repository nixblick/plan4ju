export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

/** Unknown, expired, revoked or already used invitation (not distinguished towards the client). */
export class InvalidInvitationError extends Error {
  constructor(message = "Invalid invitation") {
    super(message);
    this.name = "InvalidInvitationError";
  }
}

export class RateLimitError extends Error {
  constructor(message = "Too many attempts") {
    super(message);
    this.name = "RateLimitError";
  }
}
