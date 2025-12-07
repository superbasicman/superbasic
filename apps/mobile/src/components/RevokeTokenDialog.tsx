import { Modal, View, Text } from 'react-native';
import { useState } from 'react';
import { Button } from './Button';

interface RevokeTokenDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  tokenName: string;
}

export function RevokeTokenDialog({
  visible,
  onClose,
  onConfirm,
  tokenName,
}: RevokeTokenDialogProps) {
  const [isRevoking, setIsRevoking] = useState(false);

  const handleConfirm = async () => {
    setIsRevoking(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      // Error handling is done by parent component
      console.error('Revoke failed:', error);
    } finally {
      setIsRevoking(false);
    }
  };

  const handleClose = () => {
    if (!isRevoking) {
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
      <View className="flex-1 justify-center items-center bg-black/70 px-6">
        <View className="bg-gray-900 rounded-2xl p-6 w-full max-w-md">
          {/* Icon */}
          <View className="items-center mb-4">
            <View className="w-16 h-16 bg-red-900/20 rounded-full items-center justify-center">
              <Text className="text-3xl">⚠️</Text>
            </View>
          </View>

          {/* Header */}
          <Text className="text-xl font-bold text-white text-center mb-2">
            Revoke API Token?
          </Text>

          {/* Description */}
          <Text className="text-sm text-gray-400 text-center mb-6">
            Are you sure you want to revoke "{tokenName}"? This action cannot be undone and any applications using this token will stop working immediately.
          </Text>

          {/* Actions */}
          <View className="flex-row gap-3">
            <Button
              variant="ghost"
              onPress={handleClose}
              disabled={isRevoking}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onPress={handleConfirm}
              isLoading={isRevoking}
              className="flex-1 bg-red-600 active:bg-red-700"
            >
              Revoke
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
