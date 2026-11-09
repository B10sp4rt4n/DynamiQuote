/** An HTTP rejection received from Digestor, distinct from a transport failure. */
export class DigestorHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "DigestorHttpError";
  }
}
