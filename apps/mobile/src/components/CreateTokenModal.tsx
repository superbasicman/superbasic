import { Modal, View, Text, ScrollView, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { VALID_SCOPES } from '@repo/types';
import type { CreateTokenRequest } from '@repo/types';

interface CreateTokenModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (data: CreateTokenRequest) => Promise<boolean | void>;
}

export function CreateTokenModal({ visible, onClose, onCreate }: CreateTokenModalProps) {
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [error, setError] = useState('');
  const [scopeError, setScopeError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const scopeGroups = [
    { title: 'Transactions', scopes: VALID_SCOPES.filter((s) => s.includes('transactions')) },
    { title: 'Budgets', scopes: VALID_SCOPES.filter((s) => s.includes('budgets')) },
    { title: 'Accounts', scopes: VALID_SCOPES.filter((s) => s.includes('accounts')) },
    { title: 'Profile', scopes: VALID_SCOPES.filter((s) => s.includes('profile')) },
    { title: 'Admin', scopes: VALID_SCOPES.filter((s) => s === 'admin') },
  ];

  const handleScopeToggle = (scope: string) => {
    setSelectedScopes((prev) => {
      const newScopes = prev.includes(scope)
        ? prev.filter((s) => s !== scope)
        : [...prev, scope];

      if (newScopes.length > 0) {
        setScopeError('');
      }
      return newScopes;
    });
  };

  const handleCreate = async () => {
    // Validation
    if (!name.trim()) {
      setError('Token name is required');
      return;
    }

    if (name.length > 100) {
      setError('Token name must be less than 100 characters');
      return;
    }

    if (selectedScopes.length === 0) {
      setScopeError('At least one scope is required');
      return;
    }

    setError('');
    setScopeError('');
    setIsCreating(true);

    try {
      const result = await onCreate({
        name: name.trim(),
        scopes: selectedScopes,
        expiresInDays,
      });
      const shouldClose = result !== false;
      if (shouldClose) {
        // Reset form and close
        setName('');
        setSelectedScopes([]);
        setExpiresInDays(90);
        setError('');
        setScopeError('');
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setName('');
      setSelectedScopes([]);
      setExpiresInDays(90);
      setError('');
      setScopeError('');
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-gray-900 rounded-t-3xl px-6 py-6 max-h-[80%]">
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View className="mb-6">
                <Text className="text-2xl font-bold text-white">
                  Create API Token
                </Text>
                <Text className="text-sm text-gray-400 mt-2">
                  Create a new API token to access your data programmatically
                </Text>
              </View>

              {/* Form */}
              <View className="space-y-4">
                {/* Name Input */}
                <Input
                  label="Token Name"
                  placeholder="e.g., Production API"
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (error) setError('');
                  }}
                  error={error}
                  maxLength={100}
                  autoFocus
                  editable={!isCreating}
                />

                {/* Scopes */}
                <View>
                  <Text className="text-sm font-medium text-gray-300 mb-2">Scopes <Text className="text-red-400">*</Text></Text>
                  <Text className="text-xs text-gray-400 mb-3">Select the permissions this API key should have</Text>
                  <View className="space-y-3">
                    {scopeGroups.filter(({ scopes }) => scopes.length > 0).map(({ title, scopes }) => (
                      <View key={title}>
                        <Text className="text-xs font-medium text-gray-400 mb-2">{title}</Text>
                        {scopes.map((scope) => {
                          const isSelected = selectedScopes.includes(scope);
                          return (
                            <TouchableOpacity
                              key={scope}
                              onPress={() => handleScopeToggle(scope)}
                              className="flex-row items-center py-2"
                              disabled={isCreating}
                            >
                              <View className={`w-5 h-5 rounded border-2 ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-500'} items-center justify-center mr-3`}>
                                {isSelected ? <Text className="text-white text-xs">✓</Text> : null}
                              </View>
                              <Text className="text-sm text-gray-300">{scope}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                  {scopeError ? <Text className="text-sm text-red-400 mt-2">{scopeError}</Text> : null}
                </View>

                {/* Expiration */}
                <View>
                  <Text className="text-sm font-medium text-gray-300 mb-2">Expiration</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {[30, 60, 90, 180, 365].map((days) => (
                      <TouchableOpacity
                        key={days}
                        onPress={() => setExpiresInDays(days)}
                        disabled={isCreating}
                        className={`rounded-lg px-4 py-2 ${expiresInDays === days ? 'bg-blue-600' : 'bg-gray-700'}`}
                      >
                        <Text className={`text-sm ${expiresInDays === days ? 'text-white font-medium' : 'text-gray-300'}`}>
                          {days} days{days === 90 ? ' (rec.)' : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Actions */}
              <View className="flex-row gap-3 mt-6">
                <Button
                  variant="ghost"
                  onPress={handleClose}
                  disabled={isCreating}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onPress={handleCreate}
                  isLoading={isCreating}
                  className="flex-1"
                >
                  Create Token
                </Button>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
