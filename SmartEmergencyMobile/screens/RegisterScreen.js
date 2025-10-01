import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!name || !email || !password) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post('http://192.168.100.29:5000/api/auth/register', {
        name,
        email,
        password,
      });
      Alert.alert('Success', 'Registered! Please login.');
      navigation.navigate('Login');
    } catch (err) {
      console.log(err.response?.data || err.message);
      Alert.alert('Error', err.response?.data?.msg || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <View style={styles.card}>
        {/* Small Logo with Letters */}
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

        <Text style={[styles.subtitle, { marginBottom: 30 }]}>Create Account</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder="Enter your name"
            placeholderTextColor="#7a7a7a"
            autoCapitalize="words"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#7a7a7a"
            autoCapitalize="none"
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
            onPress={register}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Register</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('Login')}
            disabled={loading}
          >
            <Text style={[styles.buttonText, { color: '#333' }]}>Back to Login</Text>
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
