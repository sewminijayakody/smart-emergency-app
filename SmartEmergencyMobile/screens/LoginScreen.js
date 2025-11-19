import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import axios from 'axios';
import { API_URL } from "../App";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);

    try {
      const response = await axios({
        method: 'POST',
        url: `${API_URL}/api/auth/login`,
        data: {
          email: email.trim().toLowerCase(),
          password: password.trim()
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      // FIXED: Only expect { token }, not { token, user }
      const { token } = response.data;

      if (!token) {
        throw new Error("No token received");
      }

      Alert.alert('SUCCESS!', 'Welcome back! You are now logged in.');
      navigation.replace('Home', { token }); // replace = no back to login

    } catch (err) {
      console.log('LOGIN ERROR:', err.response?.data || err.message);

      let errorMessage = 'Login failed. Please try again.';
      if (err.response?.data?.msg) {
        errorMessage = err.response.data.msg;
      } else if (err.message.includes('Network')) {
        errorMessage = 'No internet connection';
      } else if (err.code === 'ECONNABORTED') {
        errorMessage = 'Server timeout — try again';
      }

      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: 'height' })}
    >
      <View style={styles.card}>
        {/* Logo */}
        <View style={[styles.logoContainer, { marginBottom: 40 }]}>
          <Image source={require('../assets/safeher.png')} style={styles.image} />
          <Text style={[styles.letter, { top: -8, left: '21%' }]}>H</Text>
          <Text style={[styles.letter, { top: 5, right: -10 }]}>E</Text>
          <Text style={[styles.letter, { top: 28, right: -18 }]}>R</Text>
          <Text style={[styles.letter, { top: 52, right: -14 }]}>D</Text>
          <Text style={[styles.letter, { top: 74, right: -2 }]}>R</Text>
          <Text style={[styles.letter, { bottom: -16, right: '13%' }]}>A</Text>
          <Text style={[styles.letter, { bottom: -14, left: 62 }]}>U</Text>
          <Text style={[styles.letter, { top: 87, left: 16 }]}>G</Text>
        </View>

        <Text style={[styles.subtitle, { marginBottom: 30 }]}>Welcome back</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#7a7a7a"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#7a7a7a"
          />

          <TouchableOpacity
            style={[styles.signInButton, loading && styles.disabledButton]}
            onPress={login}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={[styles.buttonText, { color: '#333' }]}>Back to Register</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffe6eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#ffb6c1',
    borderRadius: 20,
    width: '88%',
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  logoContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  letter: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  subtitle: {
    fontSize: 18,
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#333',
  },
  form: {
    width: '100%',
    marginTop: 10,
  },
  label: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
    marginTop: 12,
    fontStyle: 'italic',
  },
  input: {
    backgroundColor: '#ffd9e6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#f2a9c4',
    color: '#333',
  },
  signInButton: {
    backgroundColor: '#f06292',
    paddingVertical: 14,
    borderRadius: 40,
    marginTop: 20,
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: '#ffc1e3',
    paddingVertical: 12,
    borderRadius: 40,
    marginTop: 12,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontStyle: 'italic',
  },
});