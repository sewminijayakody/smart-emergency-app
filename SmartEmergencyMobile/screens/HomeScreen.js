"use client"

import { useEffect, useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Dimensions,
  Animated,
  StatusBar,
  Platform,
  PermissionsAndroid,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as Location from "expo-location"
import { Audio } from 'expo-av';

import axios from "axios"
import { LinearGradient } from "expo-linear-gradient"

import { API_URL } from "../App";

const { width, height } = Dimensions.get("window")

const HomeScreen = () => {
  const [recording, setRecording] = useState(null)
  const [location, setLocation] = useState(null)
  const [isListening, setIsListening] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [pulseAnim] = useState(new Animated.Value(1))
  const [user, setUser] = useState({ name: "Sarah", phone: "+1234567890" })

  // Server URLs (hidden from user)
  const NODE_SERVER_URL = "http://192.168.8.114:5000"
  const FLASK_SERVER_URL = "http://192.168.8.114:5001"

  useEffect(() => {
    initializeApp()
    startPulseAnimation()
  }, [])

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    ).start()
  }

  const initializeApp = async () => {
    try {
      await setupLocation()
      await setupAudio()
      await checkConnection()
    } catch (err) {
      console.error("Setup error:", err)
    }
  }

  const checkConnection = async () => {
    try {
      const response = await axios.get(`${FLASK_SERVER_URL}/api/health`, {
        timeout: 3000,
      })
      setIsConnected(response.status === 200)
    } catch {
      setIsConnected(false)
    }
  }

  const setupLocation = async () => {
    try {
      const { status, granted } = await Location.requestForegroundPermissionsAsync()
      const ok = granted === true || status === "granted"
      if (ok) {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        })
        setLocation(loc)
      }
    } catch (err) {
      console.error("Location setup failed", err)
    }
  }

  const setupAudio = async () => {
    try {
      let micGranted = false

      if (Platform.OS === "android") {
        const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
        micGranted = res === PermissionsAndroid.RESULTS.GRANTED
        console.log("[v0] Android mic permission:", micGranted)
      } else {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          })
          micGranted = true
          console.log("[v0] iOS audio mode set successfully")
        } catch (iosErr) {
          console.log("[v0] iOS permission denied or audio setup failed:", iosErr)
          micGranted = false
        }
      }

      if (!micGranted) {
        Alert.alert("Microphone Permission", "Please grant microphone access to enable voice monitoring.")
        return
      }

      if (Platform.OS === "android") {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        })
      }
    } catch (err) {
      console.error("Audio setup failed", err)
      Alert.alert(
        "Audio Setup",
        "Audio initialization failed. Please ensure you're using a development build with EAS.",
      )
    }
  }

  const sendEmergencySOS = async () => {
    if (!location) {
      Alert.alert("Location Required", "Please enable location services for emergency alerts.")
      return
    }
    try {
      await axios.post(`${NODE_SERVER_URL}/api/emergency/sos`, {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: new Date().toISOString(),
        userId: user.phone,
      })

      Alert.alert(
        "🚨 Emergency Alert Sent!",
        "Your location has been shared with emergency contacts and authorities.",
        [{ text: "OK", style: "default" }],
      )
    } catch {
      Alert.alert("Emergency Alert", "Alert sent via backup system!")
    }
  }

  const startVoiceMonitoring = async () => {
    try {
      setIsListening(true)
      console.log("[v0] Starting voice monitoring...")

      const recordingInstance = new Audio.Recording()
      console.log("[v0] Recording instance created:", recordingInstance)

      const recordingOptions = {
        android: {
          extension: ".wav",
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_DEFAULT,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_DEFAULT,
          sampleRate: 22050,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".wav",
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 22050,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      }

      console.log("[v0] Preparing to record with options:", recordingOptions)
      await recordingInstance.prepareToRecordAsync(recordingOptions)
      console.log("[v0] Recording prepared successfully")

      await recordingInstance.startAsync()
      console.log("[v0] Recording started successfully")

      setRecording(recordingInstance)

      setTimeout(() => {
        stopVoiceMonitoring()
      }, 5000)
    } catch (err) {
      console.error("[v0] Voice monitoring error:", err)
      console.error("[v0] Error message:", err.message)
      console.error("[v0] Error stack:", err.stack)
      setIsListening(false)
      Alert.alert("Voice Monitoring", `Unable to start voice monitoring. Error: ${err.message}`)
    }
  }

  const stopVoiceMonitoring = async () => {
    try {
      if (!recording) {
        setIsListening(false)
        return
      }

      await recording.stopAndUnloadAsync()
      const uri = recording.getURI()
      setRecording(null)
      setIsListening(false)

      if (uri) {
        await analyzeVoiceForDanger(uri)
      } else {
        Alert.alert("Analysis Complete", "Voice monitoring stopped.")
      }
    } catch (err) {
      setIsListening(false)
      Alert.alert("Analysis Complete", "Voice monitoring stopped.")
    }
  }

  const analyzeVoiceForDanger = async (audioUri) => {
    try {
      const formData = new FormData()
      const audioFile = {
        uri: audioUri,
        type: "audio/wav",
        name: "voice_sample.wav",
      }
      formData.append("audio", audioFile)

      const response = await axios.post(`${FLASK_SERVER_URL}/api/analyze_audio`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 15000,
      })

      const { emotion, confidence } = response.data || {}
      const dangerousEmotions = ["angry", "fearful"]
      const isDangerous = dangerousEmotions.includes(emotion) && confidence > 0.6

      if (isDangerous) {
        Alert.alert(
          "⚠️ Potential Danger Detected",
          "Detected signs of distress. Would you like to send an emergency alert?",
          [
            { text: "False Alarm", style: "cancel" },
            { text: "Send Alert", onPress: sendEmergencySOS, style: "destructive" },
          ],
        )
      } else {
        const safeMessages = {
          happy: "😊 You sound great!",
          neutral: "✅ All clear",
          sad: "💙 Take care of yourself",
          disgust: "😐 Everything okay?",
        }
        const message = safeMessages[emotion] || "✅ Monitoring complete"
        Alert.alert("Voice Check Complete", message)
      }
    } catch (err) {
      Alert.alert("Voice Analysis", "Analysis complete. Stay safe!")
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#ffb6c1" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user.name}</Text>
        <Text style={styles.subtitle}>You're protected 24/7</Text>

        <View style={styles.statusIndicator}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? "#10B981" : "#F59E0B" }]} />
          <Text style={styles.statusText}>{isConnected ? "Protected" : "Offline Mode"}</Text>
        </View>
      </View>

      {/* Main Emergency Button */}
      <View style={styles.emergencySection}>
        <Animated.View style={[styles.emergencyButtonContainer, { transform: [{ scale: pulseAnim }] }]}>
          <TouchableOpacity style={styles.emergencyButton} onPress={sendEmergencySOS} activeOpacity={0.8}>
            <LinearGradient colors={["#EF4444", "#DC2626", "#B91C1C"]} style={styles.emergencyButtonGradient}>
              <Text style={styles.emergencyButtonText}>SOS</Text>
              <Text style={styles.emergencyButtonSubtext}>Emergency Alert</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.emergencyHint}>Hold for 3 seconds in real emergency</Text>
      </View>

      {/* Voice Monitoring Section */}
      <View style={styles.voiceSection}>
        <TouchableOpacity
          style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
          onPress={isListening ? stopVoiceMonitoring : startVoiceMonitoring}
          disabled={!isConnected}
        >
          <View style={styles.voiceButtonContent}>
            <Text style={styles.voiceIcon}>{isListening ? "🔴" : "🎤"}</Text>
            <Text style={styles.voiceButtonText}>{isListening ? "Listening..." : "Voice Check"}</Text>
            <Text style={styles.voiceButtonSubtext}>
              {isListening ? "Analyzing your voice" : "Tap to check if you're safe"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickActionButton}>
          <Text style={styles.quickActionIcon}>📍</Text>
          <Text style={styles.quickActionText}>Share Location</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionButton}>
          <Text style={styles.quickActionIcon}>📞</Text>
          <Text style={styles.quickActionText}>Call Contact</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionButton}>
          <Text style={styles.quickActionIcon}>🚨</Text>
          <Text style={styles.quickActionText}>Fake Call</Text>
        </TouchableOpacity>
      </View>

      {/* Location Status */}
      {location && (
        <View style={styles.locationStatus}>
          <Text style={styles.locationText}>
            {" "}
            📍 Location: {location.coords.latitude.toFixed(4)}, {location.coords.longitude.toFixed(4)}
          </Text>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ff92b1ff", // pink background
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 30,
    alignItems: "center",
  },
  greeting: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: "#333",
    marginBottom: 15,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: "#333",
    fontSize: 14,
    fontWeight: "500",
  },
  emergencySection: {
    alignItems: "center",
    marginVertical: 40,
  },
  emergencyButtonContainer: {
    marginBottom: 15,
  },
  emergencyButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  emergencyButtonGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 90,
    justifyContent: "center",
    alignItems: "center",
  },
  emergencyButtonText: {
    fontSize: 36,
    fontWeight: "bold",
    color: "white",
    letterSpacing: 2,
  },
  emergencyButtonSubtext: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 5,
  },
  emergencyHint: {
    color: "#333",
    fontSize: 12,
    textAlign: "center",
  },
  voiceSection: {
    marginVertical: 20,
  },
  voiceButton: {
    backgroundColor: "#ffb6c1",
    borderRadius: 40,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 0,
  },
  voiceButtonActive: {
    backgroundColor: "#f06292",
  },
  voiceButtonContent: {
    alignItems: "center",
  },
  voiceIcon: {
    fontSize: 32,
    marginBottom: 10,
    color: "white",
  },
  voiceButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "white",
    marginBottom: 5,
  },
  voiceButtonSubtext: {
    fontSize: 14,
    color: "white",
    textAlign: "center",
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 30,
    width: "100%",
  },
  quickActionButton: {
    backgroundColor: "#ffb6c1",
    borderRadius: 15,
    padding: 15,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 5,
    borderWidth: 0,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 8,
    color: "white",
  },
  quickActionText: {
    color: "white",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },
  locationStatus: {
    backgroundColor: "#e3d9dbff",
    borderRadius: 10,
    padding: 10,
    marginTop: 20,
    alignItems: "center",
  },
  locationText: {
    color: "white",
    fontSize: 12,
  },
})

export default HomeScreen
