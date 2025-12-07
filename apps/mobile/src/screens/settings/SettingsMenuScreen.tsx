import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type SettingsOption = {
  title: string;
  description: string;
  screen: 'ApiKeys' | 'Devices';
  icon: string;
};

const settingsOptions: SettingsOption[] = [
  {
    title: 'API Keys',
    description: 'Manage your API keys and tokens',
    screen: 'ApiKeys',
    icon: '🔑',
  },
  {
    title: 'Devices',
    description: 'View and manage connected devices',
    screen: 'Devices',
    icon: '📱',
  },
];

export default function SettingsMenuScreen() {
  const navigation = useNavigation<NavigationProp>();

  const handleOptionPress = (screen: 'ApiKeys' | 'Devices') => {
    navigation.navigate('Main', {
      screen: 'SettingsTab',
      params: {
        screen,
      },
    });
  };

  return (
    <ScrollView className="flex-1 bg-black">
      <View className="px-6 py-6">
        {/* Header */}
        <View className="mb-6">
          <Text className="text-3xl font-bold text-white">Settings</Text>
          <Text className="mt-2 text-base text-gray-400">
            Manage your account and preferences
          </Text>
        </View>

        {/* Settings Options */}
        <View className="space-y-3">
          {settingsOptions.map((option) => (
            <TouchableOpacity
              key={option.screen}
              onPress={() => handleOptionPress(option.screen)}
              className="bg-gray-800 rounded-lg p-5 active:opacity-80 flex-row items-center"
            >
              <Text className="text-3xl mr-4">{option.icon}</Text>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-white">
                  {option.title}
                </Text>
                <Text className="text-sm text-gray-400 mt-1">
                  {option.description}
                </Text>
              </View>
              <Text className="text-gray-500 text-xl">›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
