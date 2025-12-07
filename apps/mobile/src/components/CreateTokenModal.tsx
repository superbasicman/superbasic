import { Modal, View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { Button } from './Button';
import { Input } from './Input';

interface CreateTokenModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function CreateTokenModal({ visible, onClose, onCreate }: CreateTokenModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

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

    setError('');
    setIsCreating(true);

    try {
      await onCreate(name.trim());
      // Reset form and close
      setName('');
      setError('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setName('');
      setError('');
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
                <Input
                  label="Token Name"
                  placeholder="e.g., Production API"
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (error) setError('');
                  }}
                  error={error}
                  helperText="Choose a descriptive name to identify this token"
                  maxLength={100}
                  autoFocus
                  editable={!isCreating}
                />

                {/* Info */}
                <View className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                  <Text className="text-sm text-blue-200">
                    💡 This token will have full access to your account. Keep it secure and never share it publicly.
                  </Text>
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
