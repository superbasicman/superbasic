import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components';
import * as React from 'react';

export interface BaseLayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function BaseLayout({ preview, children }: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          {children}
          <Hr style={hr} />
          <Text style={footer}>
            SuperBasic Finance - Simple personal finance management
          </Text>
          <Text style={footerSmall}>
            If you have questions, contact us at support@superbasicfinance.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Dark / minimalist styles

const main = {
  backgroundColor: '#fff1e5',
  margin: 0,
  padding: '40px 0',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

const container = {
  backgroundColor: '#020617', // near-black
  margin: '0 auto',
  padding: '32px 20px',
  maxWidth: '600px',
  borderRadius: '16px',
};

const hr = {
  borderColor: '#111827',
  marginTop: '32px',
  marginBottom: '24px',
};

const footer = {
  color: '#9ca3af',
  fontSize: '13px',
  textAlign: 'center' as const,
  margin: '0',
};

const footerSmall = {
  color: '#6b7280',
  fontSize: '12px',
  textAlign: 'center' as const,
  marginTop: '8px',
};
