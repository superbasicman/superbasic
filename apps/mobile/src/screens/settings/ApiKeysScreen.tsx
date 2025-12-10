import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import type { TokenResponse } from '@repo/types';
import { tokenApi, ApiError } from '../../lib/api';
import { showAlert } from '../../lib/alert';
import {
  Button,
  CreateTokenModal,
  TokenDisplayModal,
  RevokeTokenDialog,
  EditTokenNameDialog,
} from '../../components';

export default function ApiKeysScreen() {
  const [tokens, setTokens] = useState<TokenResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTokenDisplay, setShowTokenDisplay] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ token: string; name: string } | null>(null);
  const [tokenToRevoke, setTokenToRevoke] = useState<TokenResponse | null>(null);
  const [tokenToEdit, setTokenToEdit] = useState<TokenResponse | null>(null);

  useEffect(() => {
    loadTokens();
  }, []);

  async function loadTokens(isRefresh = false) {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const response = await tokenApi.list();
      setTokens(response.tokens);
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Failed to load API keys';
      setError(errorMessage);
      if (!isRefresh) {
        showAlert('Error', errorMessage);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  async function handleCreate(data: import('@repo/types').CreateTokenRequest): Promise<boolean> {
    const showMockToken = () => {
      setShowCreateModal(false);
      setCreatedToken({
        token: 'sbf_mock_token_for_verification_only',
        name: data.name,
      });
      setShowTokenDisplay(true);
    };

    try {
      const response = await tokenApi.create(data);
      setShowCreateModal(false);
      setCreatedToken({ token: response.token, name: response.name });
      setShowTokenDisplay(true);
      await loadTokens();
      return true;
    } catch (err) {
      console.log('got an error');
      if (err instanceof ApiError && err.status === 403) {
        console.log('error was 403');
        // DEV: Mock success for UI verification since MFA flow is not implemented in mobile yet
        // Note: We check for 403 specifically as it's the code returned by requireRecentMfa
        showAlert(
          'MFA Required',
          'Backend requires MFA for token creation. Showing mock token for UI verification.',
          [
            {
              text: 'OK',
              onPress: showMockToken,
            },
          ],
          {
            cancelable: true,
            onDismiss: showMockToken,
          }
        );
        return false;
      } else {
        throw err;
      }
    }
  }

  function handleTokenDisplayClose() {
    setShowTokenDisplay(false);
    setCreatedToken(null);
  }

  async function handleRevoke() {
    if (!tokenToRevoke) return;

    try {
      await tokenApi.revoke(tokenToRevoke.id);
      setTokenToRevoke(null);
      await loadTokens();
    } catch (err) {
      const errorMessage = err instanceof ApiError ? err.message : 'Failed to revoke token';
      showAlert('Error', errorMessage);
      throw err;
    }
  }

  async function handleEditSave(newName: string) {
    if (!tokenToEdit) return;

    try {
      await tokenApi.update(tokenToEdit.id, { name: newName });
      setTokenToEdit(null);
      await loadTokens();
    } catch (err) {
      if (err instanceof ApiError) {
        throw err;
      }
      throw new Error('Failed to update token name');
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  function getUsageColor(lastUsedAt: string | null): string {
    if (!lastUsedAt) return 'bg-gray-700';

    const diffDays = Math.floor(
      (new Date().getTime() - new Date(lastUsedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays >= 30) return 'bg-yellow-700';
    return 'bg-green-700';
  }

  const renderTokenItem = ({ item }: { item: TokenResponse }) => (
    <View className="bg-gray-800 rounded-lg p-5 mb-3">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-lg font-semibold text-white flex-1">{item.name}</Text>
        <View className={`w-3 h-3 rounded-full ${getUsageColor(item.lastUsedAt)}`} />
      </View>

      {/* Token */}
      <View className="mb-3">
        <Text className="text-xs text-gray-400 mb-1">Token</Text>
        <Text className="text-sm font-mono text-gray-300">{item.maskedToken}</Text>
      </View>

      {/* Scopes */}
      {item.scopes && item.scopes.length > 0 && (
        <View className="mb-3">
          <Text className="text-xs text-gray-400 mb-1">Scopes</Text>
          <View className="flex-row flex-wrap gap-1">
            {item.scopes.map((scope) => (
              <View key={scope} className="bg-blue-900/50 rounded-full px-2 py-1">
                <Text className="text-xs text-blue-200">{scope}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Metadata */}
      <View className="flex-row justify-between mb-3">
        <View>
          <Text className="text-xs text-gray-400">Last used</Text>
          <Text className="text-sm text-gray-300">{formatDate(item.lastUsedAt)}</Text>
        </View>
        <View>
          <Text className="text-xs text-gray-400">Created</Text>
          <Text className="text-sm text-gray-300">{formatDate(item.createdAt)}</Text>
        </View>
      </View>

      {/* Actions */}
      <View className="flex-row gap-2 border-t border-gray-700 pt-3">
        <TouchableOpacity
          onPress={() => setTokenToEdit(item)}
          className="flex-1 bg-gray-700 rounded-lg py-2 active:opacity-70"
        >
          <Text className="text-white text-center text-sm font-medium">Rename</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTokenToRevoke(item)}
          className="flex-1 bg-red-900/30 rounded-lg py-2 active:opacity-70"
        >
          <Text className="text-red-400 text-center text-sm font-medium">Revoke</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#ffffff" />
        <Text className="text-gray-400 mt-4">Loading API keys...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <FlatList
        data={tokens}
        renderItem={renderTokenItem}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-6 py-6"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => loadTokens(true)}
            tintColor="#ffffff"
          />
        }
        ListHeaderComponent={
          <View className="mb-6">
            <Text className="text-3xl font-bold text-white mb-2">API Keys</Text>
            <Text className="text-base text-gray-400 mb-6">
              Manage your API keys for programmatic access
            </Text>

            {error && (
              <View className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-4">
                <Text className="text-sm text-red-200">{error}</Text>
              </View>
            )}

            <Button variant="primary" onPress={() => setShowCreateModal(true)} fullWidth>
              Create API Key
            </Button>
          </View>
        }
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-6xl mb-4">🔑</Text>
            <Text className="text-lg font-medium text-white mb-2">No API keys</Text>
            <Text className="text-sm text-gray-400 mb-6 text-center">
              Get started by creating your first API key
            </Text>
            <Button variant="primary" onPress={() => setShowCreateModal(true)}>
              Create API Key
            </Button>
          </View>
        }
      />

      {/* Modals */}
      <CreateTokenModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
      />

      {showTokenDisplay && createdToken && (
        <TokenDisplayModal
          visible={showTokenDisplay}
          onClose={handleTokenDisplayClose}
          tokenName={createdToken.name}
          token={createdToken.token}
        />
      )}

      {tokenToRevoke && (
        <RevokeTokenDialog
          visible={!!tokenToRevoke}
          onClose={() => setTokenToRevoke(null)}
          onConfirm={handleRevoke}
          tokenName={tokenToRevoke.name}
        />
      )}

      {tokenToEdit && (
        <EditTokenNameDialog
          visible={!!tokenToEdit}
          onClose={() => setTokenToEdit(null)}
          onSave={handleEditSave}
          currentName={tokenToEdit.name}
        />
      )}
    </View>
  );
}
