/**
 * Rendered email output with HTML and plain text versions
 */
export interface RenderedEmail {
  html: string;
  text: string;
}

/**
 * Parameters for rendering the email verification template
 */
export interface RenderEmailVerificationParams {
  /** The URL the user should click to verify their email */
  verificationUrl: string;
  /** Number of hours until the verification link expires (default: 24) */
  expiresInHours?: number;
}

/**
 * Renders the email verification template to HTML and plain text
 * @param params - Template parameters
 * @returns Promise containing rendered HTML and text versions
 */
export declare function renderEmailVerification(
  params: RenderEmailVerificationParams
): Promise<RenderedEmail>;
