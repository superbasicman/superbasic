import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import type { RootStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, logout, isLoading } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-black">
      <View className="flex-1 items-center justify-center px-6 py-12">
        <View className="w-full max-w-md">
          {/* Header */}
          <View className="text-center mb-8">
            <Text className="text-4xl font-bold text-white text-center">
              SuperBasic Finance
            </Text>
            <Text className="mt-4 text-lg text-gray-200 text-center">
              Your API-first personal finance platform
            </Text>
          </View>

          {/* User Info Card */}
          {user && (
            <View className="mt-8">
              <View className="rounded-lg bg-gray-800 p-6 mb-4">
                <Text className="text-sm text-gray-400">Logged in as</Text>
                <Text className="mt-1 text-lg font-medium text-white">
                  {user.email}
                </Text>
                {user.name && (
                  <Text className="mt-1 text-sm text-gray-300">{user.name}</Text>
                )}
              </View>

              {/* Navigation Buttons */}
              <View className="space-y-3">
                {/* Manage API Keys */}
                <TouchableOpacity
                  onPress={() => navigation.navigate('Main', {
                    screen: 'SettingsTab',
                    params: {
                      screen: 'ApiKeys',
                    },
                  })}
                  className="w-full bg-blue-600 rounded-lg px-6 py-4 active:opacity-80"
                >
                  <Text className="text-white text-center text-base font-semibold">
                    Manage API Keys
                  </Text>
                </TouchableOpacity>

                {/* Manage Devices */}
                <TouchableOpacity
                  onPress={() => navigation.navigate('Main', {
                    screen: 'SettingsTab',
                    params: {
                      screen: 'Devices',
                    },
                  })}
                  className="w-full bg-gray-700 rounded-lg px-6 py-4 active:opacity-80"
                >
                  <Text className="text-white text-center text-base font-semibold">
                    Manage Devices
                  </Text>
                </TouchableOpacity>

                {/* Sign Out */}
                <TouchableOpacity
                  onPress={handleLogout}
                  className="w-full bg-gray-700 rounded-lg px-6 py-4 active:opacity-80"
                >
                  <Text className="text-white text-center text-base font-semibold">
                    Sign out
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
