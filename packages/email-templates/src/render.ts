import { render } from '@react-email/render';
import * as React from 'react';
import { EmailVerification } from './templates/email-verification.js';

export interface RenderEmailVerificationParams {
  verificationUrl: string;
  expiresInHours?: number;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

/**
 * Renders the email verification template to HTML and plain text.
 */
export async function renderEmailVerification(
  params: RenderEmailVerificationParams
): Promise<RenderedEmail> {
  const element = React.createElement(EmailVerification, params);

  const html = await render(element);
  const text = await render(element, { plainText: true });

  return { html, text };
}
