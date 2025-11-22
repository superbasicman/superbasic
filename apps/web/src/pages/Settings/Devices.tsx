import { useEffect, useMemo, useState } from "react";
import { Button } from "@repo/design-system";
import type { SessionResponse } from "@repo/types";
import { sessionApi, ApiError } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { clearTokens } from "../../lib/tokenStorage";

type SessionDisplay = SessionResponse & {
  displayIp: string;
  displayAgent: string;
};

function maskIp(ip: string | null): string {
  if (!ip) return "Unknown";
  if (ip.includes(":")) {
    const segments = ip.split(":");
    return `${segments.slice(0, 3).join(":")}::`;
  }
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  }
  return ip;
}

function summarizeAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad")) return "iPad";
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "Mac";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  return userAgent.slice(0, 60);
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function Devices() {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState<SessionDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setLoading(true);
      setError(null);
      const response = await sessionApi.list();
      const mapped = response.sessions.map((session) => ({
        ...session,
        displayIp: maskIp(session.ipAddress),
        displayAgent: summarizeAgent(session.userAgent),
      }));
      setSessions(mapped);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load sessions");
      }
    } finally {
      setLoading(false);
    }
  }

  const currentSession = useMemo(
    () => sessions.find((session) => session.isCurrent) ?? null,
    [sessions]
  );

  async function revoke(session: SessionDisplay) {
    const isCurrent = session.isCurrent;
    const confirmed = window.confirm(
      isCurrent
        ? "Revoke this device? You will be logged out here."
        : "Revoke this device? It will be signed out immediately."
    );
    if (!confirmed) return;

    try {
      setRevokingId(session.id);
      await sessionApi.revoke(session.id);
      if (isCurrent) {
        clearTokens();
        await logout();
        return;
      }
      await loadSessions();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to revoke session");
      }
    } finally {
      setRevokingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-600 border-r-transparent"></div>
          <p className="mt-2 text-sm text-gray-600">Loading devices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700">
              🔒
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Manage Devices</h1>
              <p className="text-sm text-gray-600">
                Review active sessions and sign out devices you don&apos;t recognize.
              </p>
            </div>
          </div>
          {currentSession && (
            <div className="rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-800">
              Current device: <span className="font-medium">{currentSession.displayAgent}</span>{' '}
              · IP {currentSession.displayIp}
            </div>
          )}
          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-10 text-center">
            <h3 className="text-lg font-semibold text-gray-900">No active sessions</h3>
            <p className="mt-2 text-sm text-gray-600">
              Sign in from another device to see it appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-gray-900">
                        {session.displayAgent}
                      </span>
                      {session.isCurrent && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Current
                        </span>
                      )}
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                        {session.clientType}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                        {session.kind}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      Last active: {formatDate(session.lastUsedAt)}
                    </div>
                    <div className="text-sm text-gray-600">
                      Started: {formatDate(session.createdAt)} · Expires: {formatDate(session.expiresAt)}
                    </div>
                    <div className="text-sm text-gray-600">
                      IP: {session.displayIp}
                      {session.deviceName ? ` · Device: ${session.deviceName}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => revoke(session)}
                      disabled={revokingId === session.id}
                    >
                      {revokingId === session.id ? "Revoking..." : "Revoke"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
