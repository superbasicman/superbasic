import { Modal, View, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { Button } from './Button';
import { Input } from './Input';

interface EditTokenNameDialogProps {
  visible: boolean;
  onClose: () => void;
  onSave: (newName: string) => Promise<void>;
  currentName: string;
}

export function EditTokenNameDialog({
  visible,
  onClose,
  onSave,
  currentName,
}: EditTokenNameDialogProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Reset name when modal opens with new currentName
  useEffect(() => {
    if (visible) {
      setName(currentName);
      setError('');
    }
  }, [visible, currentName]);

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      setError('Token name is required');
      return;
    }

    if (name.length > 100) {
      setError('Token name must be less than 100 characters');
      return;
    }

    if (name.trim() === currentName) {
      // No change, just close
      onClose();
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update token name');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      setName(currentName);
      setError('');
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-center items-center bg-black/70 px-6"
      >
        <View className="bg-gray-900 rounded-2xl p-6 w-full max-w-md">
          {/* Header */}
          <Text className="text-xl font-bold text-white mb-4">
            Rename Token
          </Text>

          {/* Form */}
          <View className="mb-6">
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
              editable={!isSaving}
            />
          </View>

          {/* Actions */}
          <View className="flex-row gap-3">
            <Button
              variant="ghost"
              onPress={handleClose}
              disabled={isSaving}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={handleSave}
              isLoading={isSaving}
              className="flex-1"
            >
              Save
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
