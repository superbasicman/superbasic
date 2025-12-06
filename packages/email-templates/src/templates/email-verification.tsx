import { Button, Heading, Link, Section, Text } from '@react-email/components';
import { BaseLayout } from './base-layout.js';

export interface EmailVerificationProps {
  verificationUrl: string;
  expiresInHours?: number;
}

export function EmailVerification({
  verificationUrl,
  expiresInHours = 24,
}: EmailVerificationProps) {
  return (
    <BaseLayout preview="Verify your email for SuperBasic">
      <Section style={container}>
        <Heading style={title}>Verify your email</Heading>

        <Text style={body}>
          Confirm this is really you so we can finish setting up your SuperBasic account.
        </Text>

        <Section style={buttonRow}>
          <Button style={primaryButton} href={verificationUrl}>
            Confirm email
          </Button>
        </Section>

        <Text style={hint}>Or open this link in your browser:</Text>

        <Link href={verificationUrl} style={url}>
          {verificationUrl}
        </Link>

        <Text style={meta}>
          Link expires in {expiresInHours} hour{expiresInHours !== 1 ? 's' : ''}.
        </Text>

        <Text style={footnote}>
          If this wasn&apos;t you, you can ignore this message.
        </Text>
      </Section>
    </BaseLayout>
  );
}

export default EmailVerification;

// Styles

const container = {
  margin: '0 auto',
  maxWidth: '480px',
} as const;

const title = {
  margin: '0 0 24px',
  fontSize: '26px',
  fontWeight: 500,
  letterSpacing: '-0.02em',
  color: '#ffffff',
} as const;

const body = {
  margin: '0 0 32px',
  fontSize: '16px',
  lineHeight: 1.7,
  color: 'rgba(248,250,252,0.78)',
} as const;

const buttonRow = {
  textAlign: 'left' as const,
  margin: '0 0 28px',
} as const;

const primaryButton = {
  display: 'inline-block',
  padding: '11px 22px',
  borderRadius: '999px',
  backgroundColor: '#ffffff',
  color: '#020617',
  fontSize: '15px',
  fontWeight: 500,
  textDecoration: 'none',
} as const;

const hint = {
  margin: '0 0 10px',
  fontSize: '13px',
  color: 'rgba(148,163,184,0.9)',
} as const;

const url = {
  fontSize: '12px',
  lineHeight: 1.6,
  color: 'rgba(148,163,184,1)',
  wordBreak: 'break-all' as const,
} as const;

const meta = {
  margin: '28px 0 0',
  fontSize: '12px',
  color: 'rgba(148,163,184,0.9)',
  textAlign: 'left' as const,
} as const;

const footnote = {
  margin: '12px 0 0',
  fontSize: '12px',
  color: 'rgba(148,163,184,0.9)',
} as const;
