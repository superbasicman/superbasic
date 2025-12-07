import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect, useMemo } from 'react';
import type { SessionResponse } from '@repo/types';
import { sessionApi, ApiError } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

type SessionDisplay = SessionResponse & {
  displayIp: string;
  displayAgent: string;
};

function maskIp(ip: string | null): string {
  if (!ip) return 'Unknown';
  if (ip.includes(':')) {
    // IPv6: show first 3 segments
    const segments = ip.split(':');
    return `${segments.slice(0, 3).join(':')}::`;
  }
  // IPv4: mask last octet
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  }
  return ip;
}

function summarizeAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'Mac';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('linux')) return 'Linux';
  return userAgent.slice(0, 60);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default function DevicesScreen() {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState<SessionDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions(isRefresh = false) {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const response = await sessionApi.list();
      const mapped = response.sessions.map((session) => ({
        ...session,
        displayIp: maskIp(session.ipAddress),
        displayAgent: summarizeAgent(session.userAgent),
      }));
      setSessions(mapped);
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Failed to load sessions';
      setError(errorMessage);
      if (!isRefresh) {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  const currentSession = useMemo(
    () => sessions.find((session) => session.isCurrent) ?? null,
    [sessions]
  );

  async function handleRevoke(session: SessionDisplay) {
    const isCurrent = session.isCurrent;
    const confirmMessage = isCurrent
      ? 'Revoke this device? You will be logged out here.'
      : 'Revoke this device? It will be signed out immediately.';

    Alert.alert(
      'Revoke Session',
      confirmMessage,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              setRevokingId(session.id);
              await sessionApi.revoke(session.id);

              if (isCurrent) {
                await logout();
                return;
              }

              await loadSessions();
            } catch (err) {
              const errorMessage = err instanceof ApiError ? err.message : 'Failed to revoke session';
              Alert.alert('Error', errorMessage);
            } finally {
              setRevokingId(null);
            }
          },
        },
      ],
      { cancelable: true }
    );
  }

  const renderSessionItem = ({ item }: { item: SessionDisplay }) => (
    <View className="bg-gray-800 rounded-lg p-5 mb-3">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2 flex-1">
          <Text className="text-lg font-semibold text-white">{item.displayAgent}</Text>
          {item.isCurrent && (
            <View className="bg-green-900/50 rounded-full px-2 py-1">
              <Text className="text-xs text-green-200">Current</Text>
            </View>
          )}
        </View>
      </View>

      {/* Metadata badges */}
      <View className="flex-row flex-wrap gap-1 mb-3">
        <View className="bg-gray-700 rounded-full px-2 py-1">
          <Text className="text-xs text-gray-300">{item.clientType}</Text>
        </View>
        <View className="bg-gray-700 rounded-full px-2 py-1">
          <Text className="text-xs text-gray-300">{item.kind}</Text>
        </View>
      </View>

      {/* Details */}
      <View className="mb-3 space-y-1">
        <View className="flex-row justify-between">
          <Text className="text-xs text-gray-400">Last active</Text>
          <Text className="text-sm text-gray-300">{formatDate(item.lastUsedAt)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-xs text-gray-400">Started</Text>
          <Text className="text-sm text-gray-300">{formatDate(item.createdAt)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-xs text-gray-400">IP Address</Text>
          <Text className="text-sm text-gray-300 font-mono">{item.displayIp}</Text>
        </View>
        {item.deviceName && (
          <View className="flex-row justify-between">
            <Text className="text-xs text-gray-400">Device</Text>
            <Text className="text-sm text-gray-300">{item.deviceName}</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View className="border-t border-gray-700 pt-3">
        <TouchableOpacity
          onPress={() => handleRevoke(item)}
          disabled={revokingId === item.id}
          className="bg-red-900/30 rounded-lg py-2 active:opacity-70"
        >
          <Text className="text-red-400 text-center text-sm font-medium">
            {revokingId === item.id ? 'Revoking...' : 'Revoke'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#ffffff" />
        <Text className="text-gray-400 mt-4">Loading devices...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <FlatList
        data={sessions}
        renderItem={renderSessionItem}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-6 py-6"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadSessions(true)}
            tintColor="#ffffff"
          />
        }
        ListHeaderComponent={
          <View className="mb-6">
            <Text className="text-3xl font-bold text-white mb-2">Manage Devices</Text>
            <Text className="text-base text-gray-400 mb-4">
              Review active sessions and sign out devices you don't recognize.
            </Text>

            {currentSession && (
              <View className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mb-4">
                <Text className="text-sm text-blue-200">
                  Current device: <Text className="font-medium">{currentSession.displayAgent}</Text> · IP {currentSession.displayIp}
                </Text>
              </View>
            )}

            {error && (
              <View className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-4">
                <Text className="text-sm text-red-200">{error}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-6xl mb-4">🔒</Text>
            <Text className="text-lg font-medium text-white mb-2">No active sessions</Text>
            <Text className="text-sm text-gray-400 text-center">
              Sign in from another device to see it appear here.
            </Text>
          </View>
        }
      />
    </View>
  );
}
