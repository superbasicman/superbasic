import { Modal, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Button } from './Button';

interface TokenDisplayModalProps {
  visible: boolean;
  onClose: () => void;
  tokenName: string;
  token: string;
}

export function TokenDisplayModal({
  visible,
  onClose,
  tokenName,
  token,
}: TokenDisplayModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy token to clipboard');
    }
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-gray-900 rounded-t-3xl px-6 py-6 max-h-[80%]">
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View className="mb-6">
              <Text className="text-2xl font-bold text-white">
                Token Created Successfully
              </Text>
              <Text className="text-sm text-gray-400 mt-2">
                {tokenName}
              </Text>
            </View>

            {/* Warning */}
            <View className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 mb-6">
              <Text className="text-sm font-semibold text-yellow-200 mb-2">
                ⚠️ Important: Save this token now
              </Text>
              <Text className="text-sm text-yellow-200">
                This is the only time you'll see this token. Make sure to copy and save it securely.
              </Text>
            </View>

            {/* Token Display */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-gray-200 mb-2">
                API Token
              </Text>
              <TouchableOpacity
                onPress={handleCopy}
                className="bg-gray-800 rounded-lg p-4 border-2 border-gray-700 active:border-blue-500"
              >
                <Text
                  className="text-white font-mono text-sm"
                  selectable
                  numberOfLines={3}
                >
                  {token}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCopy}
                className="mt-3 flex-row items-center justify-center"
              >
                <Text className="text-blue-400 text-sm font-medium">
                  {copied ? '✓ Copied!' : '📋 Tap to copy'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Usage Info */}
            <View className="bg-gray-800 rounded-lg p-4 mb-6">
              <Text className="text-sm font-semibold text-gray-200 mb-2">
                Usage
              </Text>
              <Text className="text-sm text-gray-400 mb-2">
                Include this token in your API requests:
              </Text>
              <View className="bg-gray-900 rounded p-3">
                <Text className="text-xs text-gray-300 font-mono">
                  Authorization: Bearer {'{'}your_token{'}'}
                </Text>
              </View>
            </View>

            {/* Action */}
            <Button variant="primary" onPress={handleClose} fullWidth>
              I've saved my token
            </Button>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
