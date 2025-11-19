import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';

import WelcomeScreen from './screens/WelcomeScreen';
import RegisterScreen from './screens/RegisterScreen';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import ProfileScreen from './screens/ProfileScreen';
import EmergencyContactsScreen from './screens/EmergencyContactsScreen';

// =======================
// BASE URLs
// =======================

// Node / Express backend (auth, SOS, MongoDB)
export const API_URL = __DEV__
  ? 'http://10.0.2.2:5000'              // Android emulator → host PC
  : 'https://smart-emergency-app.onrender.com'; // Production / Render

// Flask AI server (emotion analysis)
export const AI_URL = __DEV__
  ? 'http://10.0.2.2:5001'              // Android emulator → Flask on host PC
  : 'https://your-flask-ai-server.com'; // TODO: change when you deploy Flask

// 🔔 Configure how notifications behave when received
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Welcome">
        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="EmergencyContacts" component={EmergencyContactsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
