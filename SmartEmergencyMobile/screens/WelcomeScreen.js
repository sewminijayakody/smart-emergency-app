import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";

import { API_URL } from "../App";

export default function WelcomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={[styles.subtitle, { marginBottom: 60 }]}>Your safety, one tap away</Text>

        <View style={styles.imageContainer}>
          <Image
            source={require("../assets/safeher.png")}
            style={styles.image}
          />
          {/* Letters around the logo */}
          <Text style={[styles.letter, { top: -15, left: "40%" }]}>H</Text>
          <Text style={[styles.letter, { top: 10, right: -15 }]}>E</Text>
          <Text style={[styles.letter, { top: 50, right: -30 }]}>R</Text>
          <Text style={[styles.letter, { top: 95, right: -20 }]}>D</Text>
          <Text style={[styles.letter, { top: 135, right: 0 }]}>R</Text>
          <Text style={[styles.letter, { bottom: -22, right: "13%" }]}>A</Text>
          <Text style={[styles.letter, { bottom: -25, left: 57 }]}>U</Text>
          <Text style={[styles.letter, { top: 145, left: 20 }]}>G</Text>
        </View>

        <Text style={[styles.subtitle, { marginTop: 40 }]}>
          Because{"\n"}
          SHE{"\n"}
          deserves to feel safe.
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signUpButton}
          onPress={() => navigation.navigate("Register")}
        >
          <Text style={styles.buttonText}>Sign Up</Text>
        </TouchableOpacity>
      </View>
    </View>
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
    borderRadius: 200,
    width: 320,
    height: 700,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  tagline: {
    fontSize: 18,
    fontStyle: "italic",
    marginBottom: 20,
    textAlign: "center",
    color: "#333",
  },
  imageContainer: {
    marginBottom: 20,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  letter: {
    position: "absolute",
    fontSize: 18,
    fontWeight: "bold",
    color: "#000",
  },
  subtitle: {
    fontSize: 16,
    fontStyle: "italic",
    textAlign: "center",
    color: "#333",
  },
  buttonContainer: {
    flexDirection: "row",
    marginTop: 30,
  },
  signInButton: {
    backgroundColor: "#f06292",
    paddingVertical: 13,
    paddingHorizontal: 30,
    borderRadius: 50,
    marginHorizontal: 10,
  },
  signUpButton: {
    backgroundColor: "#ffc1e3",
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 50,
    marginHorizontal: 10,
  },
  buttonText: {
    color: "#333",
    fontSize: 16,
    fontStyle: "italic",
  },
});
