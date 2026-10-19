// Contracts: Error mapping.
export interface AppError {
  code: string; // RouterError.errorType, or an app code such as download_failed or consent_required
  message: string; // plain language, shown to the user
  requestId?: string;
  refusalSubject?: string;
  retry: "auto" | "manual" | "never";
  action?: "add_credits" | "check_key" | "edit_input" | "wait";
  // Seconds the server asked us to wait, for retry: "auto".
  retryAfter?: number;
  // Field paths from an invalid_input detail[].loc, for mapping to form fields.
  fields?: string[];
}
