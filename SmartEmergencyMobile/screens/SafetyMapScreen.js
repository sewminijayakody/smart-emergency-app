// screens/SafetyMapScreen.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, { Marker, Circle } from "react-native-maps";
import * as Location from "expo-location";
import axios from "axios";
import { API_URL } from "../App";

export default function SafetyMapScreen({ route }) {
  const token = route?.params?.token || null;

  const [position, setPosition] = useState(null);
  const [risk, setRisk] = useState(null);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Ask permission if not already granted
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Location Permission",
            "Location is required to show safety map."
          );
          setLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };

        setPosition(coords);

        // Call backend to assess safety
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.post(
          `${API_URL}/api/location/assess`,
          {
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
          { headers, timeout: 10000 }
        );

        setRisk(res.data);
        setZones(res.data.activeZones || []);
      } catch (err) {
        console.log("[SafetyMap] Error:", err.message);
        Alert.alert(
          "Error",
          "Unable to load safety status. Please try again."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getBannerColor = () => {
    if (!risk?.riskLevel) return "#6B7280"; // grey
    if (risk.riskLevel === "SAFE") return "#16A34A"; // green
    if (risk.riskLevel === "CAUTION") return "#FACC15"; // yellow
    if (risk.riskLevel === "DANGER") return "#DC2626"; // red
    return "#6B7280";
  };

  const getBannerText = () => {
    if (!risk?.riskLevel) return "Safety status unavailable";
    if (risk.riskLevel === "SAFE") return "You are in a SAFE area";
    if (risk.riskLevel === "CAUTION")
      return "You are in a CAUTION area – stay alert";
    if (risk.riskLevel === "DANGER")
      return "You are in a HIGH-RISK area – avoid staying here";
    return "Safety status unavailable";
  };

  if (loading || !position) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f06292" />
        <Text style={styles.loadingText}>Loading your location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Safety Banner */}
      <View style={[styles.banner, { backgroundColor: getBannerColor() }]}>
        <Text style={styles.bannerText}>{getBannerText()}</Text>
        {risk?.nearestZone && (
          <Text style={styles.bannerSub}>
            Nearest zone: {risk.nearestZone.name} (
            {Math.round(risk.nearestZone.distanceMeters)} m)
          </Text>
        )}
      </View>

      {/* Map */}
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: position.latitude,
          longitude: position.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation={true}
        followsUserLocation={true}
      >
        {/* User marker */}
        <Marker coordinate={position} title="You are here" />

        {/* Danger / caution zones */}
        {zones.map((z) => (
          <Circle
            key={z.id}
            center={{
              latitude: z.center.lat,
              longitude: z.center.lng,
            }}
            radius={z.radiusMeters}
            strokeWidth={1}
            strokeColor={
              z.riskLevel === "DANGER"
                ? "rgba(220,38,38,0.9)"
                : "rgba(234,179,8,0.9)"
            }
            fillColor={
              z.riskLevel === "DANGER"
                ? "rgba(220,38,38,0.2)"
                : "rgba(234,179,8,0.2)"
            }
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
  },
  loadingText: {
    marginTop: 12,
    color: "#E5E7EB",
  },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bannerText: {
    color: "#F9FAFB",
    fontSize: 16,
    fontWeight: "600",
  },
  bannerSub: {
    color: "#F9FAFB",
    fontSize: 12,
    marginTop: 4,
  },
  map: {
    flex: 1,
  },
});
