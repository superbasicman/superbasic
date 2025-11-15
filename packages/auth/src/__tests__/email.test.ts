import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMagicLinkEmail } from "../email.js";

// Mock Resend
const mockSend = vi.fn().mockResolvedValue({ id: "test-email-id" });

vi.mock("resend", () => {
  return {
    Resend: class MockResend {
      emails = {
        send: mockSend,
      };
    },
  };
});

function expectSentEmail(callIndex = 0) {
  const call = mockSend.mock.calls[callIndex]?.[0];
  if (!call) {
    throw new Error("Expected mock email to be sent");
  }
  return call as { html?: string; text?: string; from?: string };
}

describe("sendMagicLinkEmail", () => {
  beforeEach(() => {
    mockSend.mockClear();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "noreply@superbasicfinance.com";
  });

  it("should send email with magic link", async () => {
    const params = {
      to: "test@example.com",
      url: "http://localhost:3000/v1/auth/callback/email?token=test-token",
    };

    await sendMagicLinkEmail(params);

    // Verify Resend send was called
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@example.com",
        from: "noreply@superbasicfinance.com",
        subject: "Your sign-in link for SuperBasic Finance",
      })
    );
  });

  it("should include magic link URL in HTML and text", async () => {
    const params = {
      to: "test@example.com",
      url: "http://localhost:3000/v1/auth/callback/email?token=test-token",
    };

    await sendMagicLinkEmail(params);

    const callArgs = expectSentEmail();
    expect(callArgs.html).toContain(params.url);
    expect(callArgs.text).toContain(params.url);
  });

  it("should include expiration notice", async () => {
    const params = {
      to: "test@example.com",
      url: "http://localhost:3000/v1/auth/callback/email?token=test-token",
    };

    await sendMagicLinkEmail(params);

    const callArgs = expectSentEmail();
    expect(callArgs.html).toContain("24 hours");
    expect(callArgs.text).toContain("24 hours");
  });

  it("should include support contact", async () => {
    const params = {
      to: "test@example.com",
      url: "http://localhost:3000/v1/auth/callback/email?token=test-token",
    };

    await sendMagicLinkEmail(params);

    const callArgs = expectSentEmail();
    expect(callArgs.html).toContain("support@superbasicfinance.com");
    expect(callArgs.text).toContain("support@superbasicfinance.com");
  });

  it("should use EMAIL_FROM environment variable", async () => {
    process.env.EMAIL_FROM = "custom@example.com";

    const params = {
      to: "test@example.com",
      url: "http://localhost:3000/v1/auth/callback/email?token=test-token",
    };

    await sendMagicLinkEmail(params);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "custom@example.com",
      })
    );
  });

  it("should fall back to default sender if EMAIL_FROM not set", async () => {
    delete process.env.EMAIL_FROM;

    const params = {
      to: "test@example.com",
      url: "http://localhost:3000/v1/auth/callback/email?token=test-token",
    };

    await sendMagicLinkEmail(params);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "onboarding@resend.dev",
      })
    );
  });
});
