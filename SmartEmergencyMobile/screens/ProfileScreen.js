// screens/ProfileScreen.js
"use client";

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_URL } from "../App";

export default function ProfileScreen({ route, navigation }) {
  const tokenFromRoute = route?.params?.token || null;

  const [token, setToken] = useState(tokenFromRoute);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [avatarUri, setAvatarUri] = useState(null);

  // Load token, profile, and avatar
  useEffect(() => {
    const init = async () => {
      try {
        let t = tokenFromRoute;

        // Sync token with AsyncStorage
        if (!t) {
          t = await AsyncStorage.getItem("authToken");
        } else {
          await AsyncStorage.setItem("authToken", t);
        }

        setToken(t);

        // Load avatar
        const savedAvatar = await AsyncStorage.getItem("userAvatarUri");
        if (savedAvatar) {
          setAvatarUri(savedAvatar);
        }

        if (!t) {
          console.log("[Profile] No token found");
          setLoading(false);
          return;
        }

        await fetchProfile(t);
      } catch (err) {
        console.log("[Profile] init error:", err.message);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [tokenFromRoute]);

  const fetchProfile = async (jwt) => {
    try {
      console.log("[Profile] Fetching profile from:", `${API_URL}/api/auth/me`);
      const res = await axios.get(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        timeout: 10000,
      });

      console.log("[Profile] Profile loaded:", res.data);

      setName(res.data.name || "");
      setEmail(res.data.email || "");
      setPhone(res.data.phone || "");
    } catch (err) {
      console.log(
        "[Profile] Fetch profile error:",
        err.response?.data || err.message
      );
      Alert.alert(
        "Error",
        err.response?.data?.msg || "Failed to load profile."
      );
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = async () => {
    setIsEditing(false);
    if (token) {
      await fetchProfile(token); // reload original values
    }
  };

  const handleSave = async () => {
    if (!token) {
      Alert.alert("Error", "Missing authentication token.");
      return;
    }

    if (!name.trim()) {
      Alert.alert("Validation", "Name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone ? phone.trim() : "",
      };

      console.log("[Profile] Saving profile to:", `${API_URL}/api/auth/me`);
      const res = await axios.put(`${API_URL}/api/auth/me`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000,
      });

      console.log("[Profile] Profile saved:", res.data);
      setIsEditing(false);
      Alert.alert("Success", "Profile updated successfully.");
    } catch (err) {
      console.log(
        "[Profile] Save error:",
        err.response?.data || err.message
      );
      Alert.alert(
        "Error",
        err.response?.data?.msg || "Failed to save profile."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem("authToken");
      await AsyncStorage.removeItem("userAvatarUri");
      Alert.alert("Logged out", "You have been logged out.", [
        {
          text: "OK",
          onPress: () => {
            navigation.reset({
              index: 0,
              routes: [{ name: "Login" }],
            });
          },
        },
      ]);
    } catch (err) {
      console.log("[Profile] Logout error:", err.message);
      Alert.alert("Error", "Failed to logout. Please try again.");
    }
  };

  const pickImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          "Permission required",
          "We need access to your photos to set a profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (result.canceled) {
        return;
      }

      const selected = result.assets?.[0];
      if (selected?.uri) {
        setAvatarUri(selected.uri);
        await AsyncStorage.setItem("userAvatarUri", selected.uri);
        console.log("[Profile] Avatar updated:", selected.uri);
        Alert.alert("Profile Picture", "Profile picture updated locally.");
      }
    } catch (err) {
      console.log("[Profile] Image picker error:", err.message);
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  if (loading) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.select({ ios: "padding", android: undefined })}
      >
        <View style={styles.card}>
          <ActivityIndicator size="large" color="#f06292" />
          <Text style={{ marginTop: 10, color: "#333" }}>Loading profile...</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const initialLetter = name?.trim() ? name.trim()[0].toUpperCase() : "U";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <View style={styles.card}>
        {/* Avatar */}
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={pickImage}
          activeOpacity={0.8}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{initialLetter}</Text>
            </View>
          )}
          <Text style={styles.changePhotoText}>Tap to change photo</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { marginBottom: 20 }]}>My Profile</Text>

        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            editable={isEditing}
            style={[
              styles.input,
              !isEditing && styles.inputDisabled,
            ]}
            placeholder="Enter your name"
            placeholderTextColor="#7a7a7a"
          />
        </View>

        {/* Email (read-only) */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            editable={false}
            style={[styles.input, styles.inputDisabled]}
            placeholder="Your email"
            placeholderTextColor="#7a7a7a"
          />
        </View>

        {/* Phone */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            editable={isEditing}
            keyboardType="phone-pad"
            style={[
              styles.input,
              !isEditing && styles.inputDisabled,
            ]}
            placeholder="Enter your phone number"
            placeholderTextColor="#7a7a7a"
          />
        </View>

        {/* Buttons */}
        {isEditing ? (
          <View style={styles.editButtonsRow}>
            <TouchableOpacity
              style={[styles.editButton, styles.saveButton]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.editButtonText}>Save</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.editButton, styles.cancelButton]}
              onPress={handleCancel}
              disabled={saving}
            >
              <Text style={[styles.editButtonText, { color: "#333" }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleEdit}
            >
              <Text style={styles.primaryButtonText}>Edit Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffe6eb",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#ffb6c1",
    borderRadius: 20,
    width: "88%",
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: "center",
  },
  avatarContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#ffd9e6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#f06292",
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#333",
  },
  changePhotoText: {
    marginTop: 8,
    fontSize: 12,
    color: "#333",
    fontStyle: "italic",
  },
  title: {
    fontSize: 20,
    fontStyle: "italic",
    textAlign: "center",
    color: "#333",
    fontWeight: "bold",
  },
  fieldGroup: {
    width: "100%",
    marginTop: 10,
  },
  label: {
    fontSize: 14,
    color: "#333",
    marginBottom: 6,
    fontStyle: "italic",
  },
  input: {
    backgroundColor: "#ffd9e6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#f2a9c4",
    color: "#333",
  },
  inputDisabled: {
    opacity: 0.8,
  },
  editButtonsRow: {
    flexDirection: "row",
    width: "100%",
    marginTop: 20,
    justifyContent: "space-between",
  },
  editButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 40,
    alignItems: "center",
    marginHorizontal: 5,
  },
  saveButton: {
    backgroundColor: "#f06292",
  },
  cancelButton: {
    backgroundColor: "#ffc1e3",
  },
  editButtonText: {
    fontSize: 16,
    fontStyle: "italic",
    color: "#fff",
  },
  primaryButton: {
    backgroundColor: "#f06292",
    paddingVertical: 14,
    borderRadius: 40,
    marginTop: 20,
    alignItems: "center",
    width: "100%",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontStyle: "italic",
  },
  logoutButton: {
    backgroundColor: "#ffc1e3",
    paddingVertical: 12,
    borderRadius: 40,
    marginTop: 12,
    alignItems: "center",
    width: "100%",
  },
  logoutButtonText: {
    color: "#333",
    fontSize: 16,
    fontStyle: "italic",
  },
});
