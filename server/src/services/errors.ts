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
