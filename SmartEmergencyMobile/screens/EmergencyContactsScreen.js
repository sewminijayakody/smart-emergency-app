// screens/EmergencyContactsScreen.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import axios from "axios";
import { API_URL } from "../App";

export default function EmergencyContactsScreen({ route, navigation }) {
  const token = route?.params?.token || null;

  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [contacts, setContacts] = useState([]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");

  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    if (!token) {
      Alert.alert("Error", "Missing authentication token.");
      setLoadingList(false);
      return;
    }

    try {
      setLoadingList(true);
      const res = await axios.get(`${API_URL}/api/auth/emergency-contacts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000,
      });

      setContacts(res.data || []);
    } catch (err) {
      console.log(
        "GET /emergency-contacts error:",
        err.response?.data || err.message
      );
      Alert.alert(
        "Error",
        err.response?.data?.msg || "Failed to load emergency contacts."
      );
    } finally {
      setLoadingList(false);
    }
  };

  const resetForm = () => {
    setName("");
    setPhone("");
    setRelationship("");
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert("Validation", "Name and phone are required.");
      return;
    }

    if (!token) {
      Alert.alert("Error", "Missing authentication token.");
      return;
    }

    try {
      setLoading(true);

      if (editingId) {
        // update existing
        const res = await axios.put(
          `${API_URL}/api/auth/emergency-contacts/${editingId}`,
          {
            name: name.trim(),
            phone: phone.trim(),
            relationship: relationship.trim(),
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeout: 10000,
          }
        );

        setContacts(res.data || []);
        Alert.alert("Success", "Contact updated.");
      } else {
        // create new
        const res = await axios.post(
          `${API_URL}/api/auth/emergency-contacts`,
          {
            name: name.trim(),
            phone: phone.trim(),
            relationship: relationship.trim(),
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeout: 10000,
          }
        );

        setContacts(res.data || []);
        Alert.alert("Success", "Contact added.");
      }

      resetForm();
    } catch (err) {
      console.log(
        "SAVE /emergency-contacts error:",
        err.response?.data || err.message
      );
      Alert.alert(
        "Error",
        err.response?.data?.msg || "Failed to save contact."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (contact) => {
    setEditingId(contact._id);
    setName(contact.name || "");
    setPhone(contact.phone || "");
    setRelationship(contact.relationship || "");
  };

  const handleDelete = async (id) => {
    if (!token) {
      Alert.alert("Error", "Missing authentication token.");
      return;
    }

    Alert.alert("Confirm", "Delete this contact?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            const res = await axios.delete(
              `${API_URL}/api/auth/emergency-contacts/${id}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
                timeout: 10000,
              }
            );

            setContacts(res.data || []);
            Alert.alert("Deleted", "Contact removed.");
          } catch (err) {
            console.log(
              "DELETE /emergency-contacts error:",
              err.response?.data || err.message
            );
            Alert.alert(
              "Error",
              err.response?.data?.msg || "Failed to delete contact."
            );
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const renderContact = ({ item }) => (
    <View style={styles.contactCard}>
      <Text style={styles.contactName}>{item.name}</Text>
      <Text style={styles.contactPhone}>{item.phone}</Text>
      {item.relationship ? (
        <Text style={styles.contactRelationship}>{item.relationship}</Text>
      ) : null}

      <View style={styles.contactActions}>
        <TouchableOpacity
          style={styles.smallButton}
          onPress={() => handleEdit(item)}
        >
          <Text style={styles.smallButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.smallButton, { backgroundColor: "#ef4444" }]}
          onPress={() => handleDelete(item._id)}
        >
          <Text style={styles.smallButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={[styles.title, { marginBottom: 12 }]}>
          Emergency Contacts
        </Text>
        <Text style={styles.subtitle}>
          These people are notified when you trigger an SOS.
        </Text>

        {/* List */}
        {loadingList ? (
          <View style={{ marginTop: 20 }}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : contacts.length === 0 ? (
          <Text style={styles.emptyText}>
            No contacts yet. Add someone you trust.
          </Text>
        ) : (
          <FlatList
            style={{ width: "100%", marginTop: 16 }}
            data={contacts}
            keyExtractor={(item) => item._id}
            renderItem={renderContact}
          />
        )}

        {/* Form */}
        <View style={[styles.form, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>
            {editingId ? "Edit Contact" : "Add New Contact"}
          </Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder="Enter contact name"
            placeholderTextColor="#7a7a7a"
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            style={styles.input}
            placeholder="Enter phone number"
            placeholderTextColor="#7a7a7a"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Relationship (optional)</Text>
          <TextInput
            value={relationship}
            onChangeText={setRelationship}
            style={styles.input}
            placeholder="e.g. Sister, Friend"
            placeholderTextColor="#7a7a7a"
          />

          <TouchableOpacity
            style={[styles.signInButton, loading && styles.disabledButton]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {editingId ? "Update Contact" : "Add Contact"}
              </Text>
            )}
          </TouchableOpacity>

          {editingId && (
            <TouchableOpacity style={styles.backButton} onPress={resetForm}>
              <Text style={[styles.buttonText, { color: "#333" }]}>
                Cancel Edit
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.backButton, { marginTop: 12 }]}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={[styles.buttonText, { color: "#333" }]}>Back</Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#ffb6c1",
    borderRadius: 20,
    width: "100%",
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: "center",
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  subtitle: {
    fontSize: 13,
    color: "#333",
    textAlign: "center",
  },
  emptyText: {
    marginTop: 16,
    color: "#333",
    fontStyle: "italic",
  },
  form: {
    width: "100%",
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: "#333",
    marginBottom: 6,
    marginTop: 10,
    fontStyle: "italic",
  },
  input: {
    backgroundColor: "#ffd9e6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#f2a9c4",
    color: "#333",
  },
  signInButton: {
    backgroundColor: "#f06292",
    paddingVertical: 12,
    borderRadius: 40,
    marginTop: 20,
    alignItems: "center",
  },
  backButton: {
    backgroundColor: "#ffc1e3",
    paddingVertical: 10,
    borderRadius: 40,
    marginTop: 8,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontStyle: "italic",
  },
  contactCard: {
    backgroundColor: "#ffd9e6",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  contactName: {
    fontWeight: "bold",
    color: "#333",
  },
  contactPhone: {
    color: "#333",
    fontSize: 13,
  },
  contactRelationship: {
    color: "#555",
    fontSize: 12,
    fontStyle: "italic",
  },
  contactActions: {
    flexDirection: "row",
    marginTop: 8,
    justifyContent: "flex-end",
  },
  smallButton: {
    backgroundColor: "#f06292",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  smallButtonText: {
    color: "#fff",
    fontSize: 12,
  },
});
