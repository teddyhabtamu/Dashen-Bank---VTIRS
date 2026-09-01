export class DuplicateRegistrationError extends Error {
  field: string;
  constructor(field: string, value: string) {
    super(`A registration with ${field} "${value}" already exists`);
    this.field = field;
  }
}

export class DuplicateInsuranceError extends Error {
  field: string;
  constructor(field: string, value: string) {
    super(`An insurance policy with ${field} "${value}" already exists`);
    this.field = field;
  }
}

// A domain/business rule violation that should surface as a 4xx client error
// (422 Validation failed) rather than a 500.
export class ValidationError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}
