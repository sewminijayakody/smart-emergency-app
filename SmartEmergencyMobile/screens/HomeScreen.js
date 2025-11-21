// screens/HomeScreen.js
"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
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
  Image,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

import { API_URL, AI_URL } from "../App";

// During development, talk directly to Flask for emotion checks
const FLASK_URL = __DEV__
  ? `${AI_URL}/api/analyze_audio`       // 👉 http://192.168.8.114:5001/api/analyze_audio
  : `${API_URL}/api/analyze_audio`;     // In prod, you can still go through Node proxy


const HomeScreen = ({ route, navigation }) => {
  const [recording, setRecording] = useState(null);
  const [location, setLocation] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [user, setUser] = useState({ name: "Sarah", phone: "+1234567890" });
  const [avatarUri, setAvatarUri] = useState(null);

  // 🔔 Fake call state
  const [fakeCallVisible, setFakeCallVisible] = useState(false);
  const [fakeCallStage, setFakeCallStage] = useState("ringing"); // 'ringing' | 'ongoing'
  const [fakeCallSeconds, setFakeCallSeconds] = useState(0);
  const fakeCallTimerRef = useRef(null);
  const fakeCallSoundRef = useRef(null); // holds ringtone sound

  // JWT from navigation
  const token = route?.params?.token || null;

  const stopTimerRef = useRef(null);
  const recordingRef = useRef(null);
  const isPreparingRef = useRef(false);

  // Save token in AsyncStorage so Profile can reuse it
  useEffect(() => {
    const syncToken = async () => {
      try {
        if (token) {
          await AsyncStorage.setItem("authToken", token);
          console.log("[Home] Stored authToken in AsyncStorage");
        }
      } catch (err) {
        console.log("[Home] Error storing token:", err.message);
      }
    };
    syncToken();
  }, [token]);

  // Load avatar whenever Home gains focus
  useFocusEffect(
    useCallback(() => {
      const loadAvatar = async () => {
        try {
          const saved = await AsyncStorage.getItem("userAvatarUri");
          if (saved) {
            setAvatarUri(saved);
            console.log("[Home] Loaded avatarUri from storage");
          }
        } catch (err) {
          console.log("[Home] Load avatar error:", err.message);
        }
      };
      loadAvatar();
    }, [])
  );

  useEffect(() => {
    console.log("[DEBUG] HomeScreen mounted");
    console.log("[DEBUG] API_URL:", API_URL);
    console.log("[DEBUG] FLASK_URL:", FLASK_URL);
    console.log("[DEBUG] Token:", token ? "exists" : "missing");

    startPulseAnimation();
    initializeApp();

    return () => {
      console.log("[DEBUG] HomeScreen unmounting...");
      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
      }
      if (fakeCallTimerRef.current) {
        clearTimeout(fakeCallTimerRef.current);
      }
      stopFakeCallSound(); // stop ringtone on unmount
      try {
        stopVoiceMonitoring().catch((e) =>
          console.warn(
            "[DEBUG] Unmount cleanup (stopVoiceMonitoring):",
            e.message
          )
        );
      } catch (e) {
        console.warn("[DEBUG] Unmount cleanup error:", e.message);
      }
    };
  }, []);

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
      ])
    ).start();
  };

  // Fetch profile with JWT token
  const fetchProfile = async () => {
    if (!token) {
      console.log("[Home] No token, skipping profile fetch");
      return;
    }

    try {
      console.log("[Home] Fetching profile:", `${API_URL}/api/auth/me`);
      const res = await axios.get(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000,
      });

      console.log("[Home] Profile loaded:", res.data);

      setUser({
        name: res.data.name || "Sarah",
        phone: res.data.phone || "+1234567890",
      });
    } catch (err) {
      console.log(
        "[Home] Profile fetch error:",
        err.response?.data || err.message
      );
    }
  };

  // Register push token for FCM
  const registerPushToken = async () => {
    if (!token) {
      console.log("[FCM] No JWT token, skipping push token registration");
      return;
    }

    try {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("[FCM] Push permissions not granted");
        return;
      }

      const devicePushToken = await Notifications.getDevicePushTokenAsync();
      console.log("[FCM] Device push token:", devicePushToken.data);

      await axios.post(
        `${API_URL}/api/auth/register-push-token`,
        { pushToken: devicePushToken.data },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 10000,
        }
      );

      console.log("[FCM] Push token registered with backend");
    } catch (err) {
      console.log(
        "[FCM] Error registering push token:",
        err.response?.data || err.message
      );
    }
  };

  const initializeApp = async () => {
    try {
      console.log("[DEBUG] Initializing app...");
      await setupLocation();
      await setupAudio();
      await checkConnection();
      await fetchProfile();
      await registerPushToken();
    } catch (err) {
      console.error("[DEBUG] Setup error:", err.message);
    }
  };

  const checkConnection = async () => {
    try {
      console.log("[DEBUG] Checking connection to:", `${API_URL}/api/health`);
      const response = await axios.get(`${API_URL}/api/health`, {
        timeout: 5000,
      });
      setIsConnected(response.status === 200);
      console.log("[DEBUG] ✅ Backend connected");
      console.log("[DEBUG] Backend info:", response.data);
    } catch (err) {
      setIsConnected(false);
      console.log("[DEBUG] ❌ Backend disconnected:", err.message);
    }
  };

  const setupLocation = async () => {
    try {
      console.log("[DEBUG] Requesting location permissions...");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setLocation(loc);
        console.log("[DEBUG] ✅ Location obtained:", loc.coords);
      } else {
        console.log("[DEBUG] Location permission denied");
      }
    } catch (err) {
      console.error("[DEBUG] Location error:", err.message);
    }
  };

  const setupAudio = async () => {
    try {
      console.log("[DEBUG] Setting up audio...");
      let micGranted = false;

      if (Platform.OS === "android") {
        const res = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        micGranted = res === PermissionsAndroid.RESULTS.GRANTED;
        console.log("[DEBUG] Android mic permission:", res);
      } else {
        micGranted = true;
      }

      if (!micGranted) {
        Alert.alert(
          "Microphone Permission",
          "Microphone access is required for voice monitoring."
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      console.log("[DEBUG] ✅ Audio setup complete");
    } catch (err) {
      console.error("[DEBUG] Audio setup error:", err.message);
      Alert.alert("Audio Setup Error", err.message);
    }
  };

  // =====================================================
  // ✅ Record short evidence audio (8s)
  // =====================================================
  const recordEvidenceAudio = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        console.log("[Evidence] Mic permission not granted");
        return null;
      }

      const evidenceRec = new Audio.Recording();

      const options = {
        android: {
          extension: ".m4a",
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 22050,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 22050,
          numberOfChannels: 1,
          bitRate: 128000,
        },
      };

      await evidenceRec.prepareToRecordAsync(options);
      await evidenceRec.startAsync();

      console.log("[Evidence] Recording started (8s)");
      await new Promise((r) => setTimeout(r, 8000));

      await evidenceRec.stopAndUnloadAsync();
      const uri = evidenceRec.getURI();
      console.log("[Evidence] Recording saved:", uri);

      return uri;
    } catch (err) {
      console.log("[Evidence] Record error:", err.message);
      return null;
    }
  };

  // =====================================================
  // ✅ Upload evidence to backend -> S3
  // Calls: POST /api/emergency/upload-evidence (field "evidence")
  // =====================================================
  const uploadEvidence = async (uri) => {
    if (!uri || !token) return null;

    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists || fileInfo.size <= 0) {
        console.log("[Evidence] File missing/empty");
        return null;
      }

      const formData = new FormData();
      formData.append("evidence", {
        uri,
        name: "evidence.m4a",
        type: "audio/m4a",
      });

      const res = await axios.post(
        `${API_URL}/api/emergency/upload-evidence`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "multipart/form-data",
          },
          timeout: 30000,
        }
      );

      console.log("[Evidence] Uploaded URL:", res.data?.evidenceUrl);
      return res.data?.evidenceUrl || null;
    } catch (err) {
      console.log("[Evidence] Upload error:", err.response?.data || err.message);
      return null;
    }
  };

  // =====================================================
  // ✅ NORMAL SOS: records + uploads evidence
  // =====================================================
  const sendEmergencySOS = async () => {
    if (!location) {
      Alert.alert(
        "Location Required",
        "Please enable location services for emergency alerts."
      );
      return;
    }

    try {
      console.log("[SOS] Capturing evidence first...");
      const evidenceUri = await recordEvidenceAudio();
      const evidenceUrl = await uploadEvidence(evidenceUri);

      console.log("[DEBUG] 🚨 Sending SOS to backend...");
      console.log("[DEBUG] Location:", location.coords);
      console.log("[DEBUG] Endpoint:", `${API_URL}/api/emergency/sos`);
      console.log("[DEBUG] Evidence URL:", evidenceUrl || "none");

      const headers = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const response = await axios.post(
        `${API_URL}/api/emergency/sos`,
        {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: new Date().toISOString(),
          userId: user.phone,
          evidenceUrl: evidenceUrl || null,
          mode: "NORMAL",
          source: "MOBILE_SOS",
        },
        {
          headers,
          timeout: 10000,
        }
      );

      console.log("[DEBUG] ✅ SOS sent successfully");
      console.log("[DEBUG] Server response:", response.data);
      Alert.alert(
        "🚨 Emergency Alert Sent!",
        "Your location has been shared with authorities and emergency contacts.",
        [{ text: "OK" }]
      );
    } catch (err) {
      console.error("[DEBUG] SOS error:", err.message);
      if (err.response?.data) {
        console.error("[DEBUG] Server error:", err.response.data);
      }
      Alert.alert(
        "Emergency Alert",
        "Alert sent via backup system. Help is coming!"
      );
    }
  };

  // =====================================================
  // ✅ DISCREET SOS (long press tile)
  // =====================================================
  const sendDiscreetSOS = async () => {
    if (!location) {
      Alert.alert("Travel tips", "Unable to refresh content. Try again later.");
      return;
    }

    try {
      console.log("[DISCREET] Capturing evidence...");
      const evidenceUri = await recordEvidenceAudio();
      const evidenceUrl = await uploadEvidence(evidenceUri);

      const headers = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      console.log("[DISCREET] Sending discreet SOS...");
      await axios.post(
        `${API_URL}/api/emergency/sos`,
        {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: new Date().toISOString(),
          userId: user.phone,
          evidenceUrl: evidenceUrl || null,
          mode: "DISCREET",
          source: "DISCREET_TILE",
        },
        {
          headers,
          timeout: 10000,
        }
      );

      console.log("[DISCREET] SOS sent silently.");
      Alert.alert("Travel tips", "Content updated successfully.");
    } catch (err) {
      console.error("[DISCREET] SOS error:", err.message);
      Alert.alert("Travel tips", "Unable to refresh content. Please try again.");
    }
  };

  // ==================== FAKE CALL (with sound) =======================

  const stopFakeCallSound = async () => {
    try {
      if (fakeCallSoundRef.current) {
        await fakeCallSoundRef.current.stopAsync();
        await fakeCallSoundRef.current.unloadAsync();
        fakeCallSoundRef.current = null;
      }
    } catch (e) {
      console.log("[FakeCall] stop sound error:", e.message);
    }
  };

  const resetFakeCall = () => {
    if (fakeCallTimerRef.current) {
      clearTimeout(fakeCallTimerRef.current);
      fakeCallTimerRef.current = null;
    }
    setFakeCallSeconds(0);
  };

  const startFakeCall = async () => {
    resetFakeCall();
    await stopFakeCallSound();

    setFakeCallStage("ringing");
    setFakeCallVisible(true);

    // Load & play ringtone (looping)
    try {
      const { sound } = await Audio.Sound.createAsync(
        // 🔔 Make sure this file exists: assets/fake_ringtone.mp3
        require("../assets/fake_ringtone.mp3"),
        { isLooping: true, volume: 1.0 }
      );
      fakeCallSoundRef.current = sound;
      await sound.playAsync();
    } catch (e) {
      console.log("[FakeCall] Failed to play ringtone:", e.message);
    }

    // Auto-accept after 5s if user does nothing
    fakeCallTimerRef.current = setTimeout(() => {
      setFakeCallStage("ongoing");
      setFakeCallSeconds(0);
      stopFakeCallSound(); // stop ringtone when "connected"
    }, 5000);
  };

  const acceptFakeCall = () => {
    resetFakeCall();
    stopFakeCallSound();
    setFakeCallStage("ongoing");
  };

  const declineFakeCall = () => {
    resetFakeCall();
    stopFakeCallSound();
    setFakeCallVisible(false);
  };

  const endFakeCall = () => {
    resetFakeCall();
    stopFakeCallSound();
    setFakeCallVisible(false);
  };

  // Simple call timer (only when stage = ongoing)
  useEffect(() => {
    if (!fakeCallVisible || fakeCallStage !== "ongoing") return;

    const interval = setInterval(() => {
      setFakeCallSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [fakeCallVisible, fakeCallStage]);

  const formatCallTime = (sec) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ================= VOICE MONITORING (unchanged logic) =================
  const startVoiceMonitoring = async () => {
    if (isPreparingRef.current) {
      console.log(
        "[DEBUG] startVoiceMonitoring skipped: operation in progress"
      );
      return;
    }

    setIsPreparing(true);
    isPreparingRef.current = true;

    try {
      console.log("[DEBUG] 🎤 Starting voice recording...");
      if (recordingRef.current) {
        console.log("[DEBUG] Previous recording exists, cleaning up...");
        try {
          const oldStatus = await recordingRef.current.getStatusAsync();
          console.log(
            "[DEBUG] Previous recording status:",
            JSON.stringify(oldStatus)
          );
          if (oldStatus.isRecording || !oldStatus.isDoneRecording) {
            console.log("[DEBUG] Stopping previous recording...");
            const stopFn = recordingRef.current.stopAndUnloadAsync?.bind(
              recordingRef.current
            );
            if (stopFn) {
              await stopFn();
            } else if (
              typeof recordingRef.current.stopAsync === "function"
            ) {
              await recordingRef.current.stopAsync();
            }
            console.log("[DEBUG] Previous recording stopped/unloaded");
          }
        } catch (cleanupErr) {
          console.warn(
            "[DEBUG] Cleanup error (continuing):",
            cleanupErr.message
          );
        }

        recordingRef.current = null;
        setRecording(null);
        console.log("[DEBUG] Waiting 500ms for Android resource release...");
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log("[DEBUG] Cleanup delay complete");
      }

      const { status } = await Audio.requestPermissionsAsync();
      console.log("[DEBUG] Mic permission status:", status);
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Microphone access is required.");
        setIsListening(false);
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      console.log("[DEBUG] Audio mode reset");

      const newRecording = new Audio.Recording();
      console.log("[DEBUG] New Recording instance created");

      const recordingOptions = {
        android: {
          extension: ".m4a",
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 22050,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 22050,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      };

      console.log("[DEBUG] Preparing to record with options...");
      await newRecording.prepareToRecordAsync(recordingOptions);
      console.log("[DEBUG] ✅ Recording prepared successfully");

      console.log("[DEBUG] Starting recording...");
      await newRecording.startAsync();
      console.log("[DEBUG] ✅ Recording started successfully");

      recordingRef.current = newRecording;
      setRecording(newRecording);
      setIsListening(true);

      stopTimerRef.current = setTimeout(() => {
        console.log("[DEBUG] ⏱️ Auto-stop timeout reached (5 seconds)");
        stopVoiceMonitoring();
      }, 5000);
    } catch (err) {
      console.error("[DEBUG] ❌ startVoiceMonitoring error:", err.message);
      console.error("[DEBUG] Error code:", err.code);
      console.error("[DEBUG] Error stack:", err.stack);
      recordingRef.current = null;
      setRecording(null);
      setIsListening(false);
      Alert.alert("Recording Error", err.message);
    } finally {
      setIsPreparing(false);
      isPreparingRef.current = false;
    }
  };

  const stopVoiceMonitoring = async () => {
    if (isPreparingRef.current) {
      console.log("[DEBUG] stopVoiceMonitoring skipped: operation in progress");
      return;
    }

    setIsPreparing(true);
    isPreparingRef.current = true;

    try {
      console.log("[DEBUG] 🛑 Stopping voice recording...");

      if (stopTimerRef.current) {
        clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
      }

      if (!recordingRef.current) {
        console.log("[DEBUG] No recording to stop");
        setIsListening(false);
        return;
      }

      const recordingToStop = recordingRef.current;
      let uri = null;
      try {
        uri = recordingToStop.getURI();
        console.log("[DEBUG] Recording URI obtained:", uri);
      } catch (uriErr) {
        console.error(
          "[DEBUG] Failed to get URI (continuing):",
          uriErr.message
        );
      }

      try {
        const status = await recordingToStop.getStatusAsync();
        console.log(
          "[DEBUG] Recording status before stop:",
          JSON.stringify(status)
        );

        if (status.isRecording || !status.isDoneRecording) {
          console.log(
            "[DEBUG] Recording is active or not done, calling stop/unload..."
          );
          const stopAndUnload =
            recordingToStop.stopAndUnloadAsync?.bind(recordingToStop);
          if (stopAndUnload) {
            await stopAndUnload();
            console.log("[DEBUG] ✅ Recording stopped and unloaded");
          } else if (typeof recordingToStop.stopAsync === "function") {
            await recordingToStop.stopAsync();
            console.log("[DEBUG] ✅ Recording stopped (stopAsync fallback)");
          } else {
            console.warn(
              "[DEBUG] No stop/unload function available on recording, skipping"
            );
          }
        } else {
          console.log(
            "[DEBUG] Recording not active (already done). No stop needed."
          );
        }
      } catch (stopErr) {
        console.error("[DEBUG] ⚠️ Stop error:", stopErr.message);
      }

      recordingRef.current = null;
      setRecording(null);
      setIsListening(false);

      await new Promise((resolve) => setTimeout(resolve, 200));

      if (uri) {
        try {
          const info = await FileSystem.getInfoAsync(uri);
          console.log(
            "[DEBUG] File info - Size:",
            info.size,
            "bytes | Exists:",
            info.exists
          );

          if (info.exists && info.size > 0) {
            console.log("[DEBUG] ✅ File valid, analyzing...");
            await analyzeVoiceForDanger(uri);
          } else {
            console.error("[DEBUG] ❌ File empty or missing");
            Alert.alert("Error", "Recording file is empty or not found.");
          }
        } catch (fileErr) {
          console.error("[DEBUG] File check error:", fileErr.message);
          Alert.alert("Error", fileErr.message);
        }
      } else {
        console.warn("[DEBUG] No URI obtained from recording");
      }
    } catch (err) {
      console.error("[DEBUG] ❌ stopVoiceMonitoring outer error:", err.message);
      recordingRef.current = null;
      setRecording(null);
      setIsListening(false);
      Alert.alert("Error", err.message);
    } finally {
      setIsPreparing(false);
      isPreparingRef.current = false;
    }
  };

  const analyzeVoiceForDanger = async (audioUri) => {
    try {
      console.log("[DEBUG] 🔍 Analyzing voice for danger...");
      console.log("[DEBUG] Audio URI:", audioUri);
      console.log("[DEBUG] Sending to Flask:", FLASK_URL);

      const formData = new FormData();
      formData.append("audio", {
        uri: audioUri,
        type: "audio/m4a",
        name: "voice_sample.m4a",
      });

      console.log("[DEBUG] FormData prepared, making request...");

      const headers = {
        "Content-Type": "multipart/form-data",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const response = await axios.post(FLASK_URL, formData, {
        headers,
        timeout: 30000,
      });

      console.log("[DEBUG] ✅ Flask response received");
      console.log("[DEBUG] Response data:", response.data);

      const { emotion, confidence } = response.data;
      console.log(
        "[DEBUG] 📊 Emotion:",
        emotion,
        "| Confidence:",
        (confidence * 100).toFixed(0) + "%"
      );

      const dangerousEmotions = ["angry", "fearful"];
      const isDanger = dangerousEmotions.includes(emotion) && confidence > 0.6;

      if (isDanger) {
        console.log("[DEBUG] 🚨🚨🚨 DANGER DETECTED! 🚨🚨🚨");

        // 🔔 Auto-trigger fake call when danger is detected
        startFakeCall();

        Alert.alert(
          "⚠️ DANGER DETECTED",
          `Emotion: ${emotion.toUpperCase()}\nConfidence: ${(
            confidence * 100
          ).toFixed(0)}%\n\nSend emergency alert?`,
          [
            {
              text: "Cancel",
              onPress: () => console.log("[DEBUG] User cancelled SOS"),
              style: "cancel",
            },
            {
              text: "🚨 Send SOS",
              onPress: () => {
                console.log(
                  "[DEBUG] User confirmed SOS - calling sendEmergencySOS()"
                );
                sendEmergencySOS();
              },
              style: "destructive",
            },
          ]
        );
      } else {
        const safeMessages = {
          happy: "✅ You sound safe and happy!",
          neutral: "✅ All clear - you're safe",
          sad: "💙 Sending you support",
          disgust: "👍 Everything okay?",
        };
        const msg =
          safeMessages[emotion] || "✅ Voice check complete - you're safe";
        console.log("[DEBUG] ✅ SAFE emotion detected:", emotion);
        Alert.alert("Voice Analysis Complete", msg);
      }
    } catch (err) {
      console.error("[DEBUG] ❌ Analysis error:", err.message);
      console.error("[DEBUG] Error code:", err.code);

      if (err.response?.status) {
        console.error("[DEBUG] HTTP Status:", err.response.status);
        console.error("[DEBUG] Response data:", err.response.data);
      } else if (err.request) {
        console.error(
          "[DEBUG] No response received - request was sent but no response"
        );
      } else {
        console.error("[DEBUG] Request setup error");
      }

      Alert.alert(
        "Analysis Error",
        `Error: ${err.message}\n\nMake sure Flask server is running at ${FLASK_URL}`
      );
    }
  };

  const initialLetter = user.name?.trim()
    ? user.name.trim()[0].toUpperCase()
    : "U";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#ffb6c1" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Hello, {user.name}</Text>
              <Text style={styles.subtitle}>You're protected 24/7</Text>
            </View>

            {/* Small profile avatar button */}
            <TouchableOpacity
              style={styles.profileAvatarContainer}
              onPress={() => navigation.navigate("Profile", { token })}
              activeOpacity={0.8}
            >
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.profileAvatarImage}
                />
              ) : (
                <View style={styles.profileAvatarCircle}>
                  <Text style={styles.profileAvatarInitial}>
                    {initialLetter}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.statusIndicator}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? "#10B981" : "#F59E0B" },
              ]}
            />
            <Text style={styles.statusText}>
              {isConnected ? "🟢 Connected" : "🔴 Offline"}
            </Text>
          </View>
        </View>

        {/* Main Emergency Button */}
        <View style={styles.emergencySection}>
          <Animated.View
            style={[
              styles.emergencyButtonContainer,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <TouchableOpacity
              style={styles.emergencyButton}
              onPress={sendEmergencySOS}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={["#EF4444", "#DC2626", "#B91C1C"]}
                style={styles.emergencyButtonGradient}
              >
                <Text style={styles.emergencyButtonText}>SOS</Text>
                <Text style={styles.emergencyButtonSubtext}>Emergency</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Voice Monitoring Section */}
        <View style={styles.voiceSection}>
          <TouchableOpacity
            style={[
              styles.voiceButton,
              isListening && styles.voiceButtonActive,
            ]}
            onPress={isListening ? stopVoiceMonitoring : startVoiceMonitoring}
            disabled={!isConnected}
          >
            <Text style={styles.voiceIcon}>{isListening ? "🎙️" : "🎤"}</Text>
            <Text style={styles.voiceButtonText}>
              {isListening ? "Listening..." : "Voice Check"}
            </Text>
            <Text style={styles.voiceButtonSubtext}>
              {isListening
                ? "Recording... (auto-stop in 5s)"
                : "Tap to check your safety"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
         <TouchableOpacity
  style={styles.quickActionButton}
  onPress={() => navigation.navigate("SafetyMap", { token })}
>
  <Text style={styles.quickActionIcon}>📍</Text>
  <Text style={styles.quickActionText}>Location</Text>
</TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => navigation.navigate("EmergencyContacts", { token })}
          >
            <Text style={styles.quickActionIcon}>☎️</Text>
            <Text style={styles.quickActionText}>Contact</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={startFakeCall}
          >
            <Text style={styles.quickActionIcon}>🔔</Text>
            <Text style={styles.quickActionText}>Fake Call</Text>
          </TouchableOpacity>
        </View>

        {/* 🔒 Discreet SOS Tile (long press) */}
        <TouchableOpacity
          style={styles.discreetCard}
          activeOpacity={0.9}
          onLongPress={sendDiscreetSOS}
          delayLongPress={1500}
        >
          <Text style={styles.discreetTitle}>Daily Travel Tips</Text>
          <Text style={styles.discreetText}>
            Stay safe and confident wherever you go. Long-press to refresh
            tips.
          </Text>
          <Text style={styles.discreetHint}>
            (Hidden: long-press silently sends a discreet SOS)
          </Text>
        </TouchableOpacity>

        {/* Location Status */}
        {location && (
          <View style={styles.locationStatus}>
            <Text style={styles.locationText}>
              📍 Lat: {location.coords.latitude.toFixed(4)} | Lng:{" "}
              {location.coords.longitude.toFixed(4)}
            </Text>
          </View>
        )}

        {/* Connection Status Info */}
        {!isConnected && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              ⚠️ Backend not connected. Flask server may not be running.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* 📱 Fake Call Overlay */}
      {fakeCallVisible && (
        <View style={styles.fakeCallOverlay}>
          <View style={styles.fakeCallCard}>
            {fakeCallStage === "ringing" ? (
              <>
                <Text style={styles.fakeCallLabel}>Incoming call</Text>
                <Text style={styles.fakeCallName}>Mum</Text>
                <Text style={styles.fakeCallNumber}>+94 77 123 4567</Text>

                <View style={styles.fakeCallButtonsRow}>
                  <TouchableOpacity
                    style={[styles.fakeCallButton, styles.fakeCallButtonDecline]}
                    onPress={declineFakeCall}
                  >
                    <Text style={styles.fakeCallButtonText}>Decline</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.fakeCallButton, styles.fakeCallButtonAccept]}
                    onPress={acceptFakeCall}
                  >
                    <Text style={styles.fakeCallButtonText}>Accept</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.fakeCallLabel}>On call</Text>
                <Text style={styles.fakeCallName}>Mum</Text>
                <Text style={styles.fakeCallTimer}>
                  {formatCallTime(fakeCallSeconds)}
                </Text>

                <TouchableOpacity
                  style={[styles.fakeCallButton, styles.fakeCallEndButton]}
                  onPress={endFakeCall}
                >
                  <Text style={styles.fakeCallButtonText}>End Call</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ff92b1ff",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 20,
    width: "100%",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    alignSelf: "flex-start",
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
  // Small profile avatar in header
  profileAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffd9e6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#f06292",
  },
  profileAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarInitial: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  profileAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  emergencySection: {
    alignItems: "center",
    marginVertical: 20,
  },
  emergencyButtonContainer: {
    marginBottom: 10,
  },
  emergencyButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  emergencyButtonGradient: {
    width: "100%",
    height: "100%",
    borderRadius: 80,
    justifyContent: "center",
    alignItems: "center",
  },
  emergencyButtonText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
  },
  emergencyButtonSubtext: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 5,
  },
  voiceSection: {
    marginVertical: 20,
    alignItems: "center",
  },
  voiceButton: {
    backgroundColor: "#ffb6c1",
    borderRadius: 30,
    paddingVertical: 20,
    paddingHorizontal: 30,
    alignItems: "center",
    minWidth: 200,
  },
  voiceButtonActive: {
    backgroundColor: "#f06292",
  },
  voiceIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  voiceButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "white",
    marginBottom: 5,
  },
  voiceButtonSubtext: {
    fontSize: 12,
    color: "white",
    textAlign: "center",
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 25,
    width: "100%",
  },
  quickActionButton: {
    backgroundColor: "#ffb6c1",
    borderRadius: 15,
    padding: 15,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 5,
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  quickActionText: {
    color: "white",
    fontSize: 11,
    fontWeight: "500",
  },
  locationStatus: {
    backgroundColor: "#e3d9dbff",
    borderRadius: 10,
    padding: 10,
    marginTop: 15,
    width: "100%",
  },
  locationText: {
    color: "white",
    fontSize: 11,
  },
  warningBanner: {
    backgroundColor: "#F59E0B",
    borderRadius: 10,
    padding: 12,
    marginTop: 15,
    width: "100%",
    marginBottom: 12,
  },
  warningText: {
    color: "white",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },

  // Discreet tile styles
  discreetCard: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    width: "100%",
  },
  discreetTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  discreetText: {
    fontSize: 13,
    color: "#333",
  },
  discreetHint: {
    fontSize: 11,
    color: "#555",
    marginTop: 6,
  },

  // 📱 Fake Call overlay styles
  fakeCallOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  fakeCallCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  fakeCallLabel: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 8,
  },
  fakeCallName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#F9FAFB",
    marginBottom: 4,
  },
  fakeCallNumber: {
    fontSize: 14,
    color: "#D1D5DB",
    marginBottom: 20,
  },
  fakeCallButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 12,
  },
  fakeCallButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    marginHorizontal: 4,
  },
  fakeCallButtonAccept: {
    backgroundColor: "#22C55E",
  },
  fakeCallButtonDecline: {
    backgroundColor: "#EF4444",
  },
  fakeCallButtonText: {
    color: "#F9FAFB",
    fontSize: 14,
    fontWeight: "600",
  },
  fakeCallTimer: {
    fontSize: 18,
    color: "#10B981",
    marginVertical: 16,
  },
  fakeCallEndButton: {
    backgroundColor: "#EF4444",
    paddingVertical: 10,
    paddingHorizontal: 40,
    borderRadius: 999,
    marginTop: 8,
  },
});

export default HomeScreen;
