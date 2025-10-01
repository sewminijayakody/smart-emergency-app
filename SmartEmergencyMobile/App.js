import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import WelcomeScreen from './screens/WelcomeScreen';
import RegisterScreen from './screens/RegisterScreen';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
   <Stack.Navigator initialRouteName="Welcome">
  <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
  <Stack.Screen name="Register" component={RegisterScreen} />
  <Stack.Screen name="Login" component={LoginScreen} />
  <Stack.Screen name="Home" component={HomeScreen} />
</Stack.Navigator>
    </NavigationContainer>
  );
}
