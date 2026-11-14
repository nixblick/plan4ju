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

/** A switchable module is off. Subclass of NotFoundError, so pages still answer 404. */
export class ModuleOffError extends NotFoundError {
  constructor(message = "Module off") {
    super(message);
    this.name = "ModuleOffError";
  }
}

export class ConflictError extends Error {
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

/** A routine occurrence cannot be moved onto a day that already has one of the same routine. */
export class DayTakenError extends ConflictError {
  constructor(message = "Day taken") {
    super(message);
    this.name = "DayTakenError";
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
