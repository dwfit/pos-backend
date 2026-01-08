import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Activation">;

export default function ActivationScreen({ navigation }: Props) {
  const [branchId, setBranchId] = useState("");
  const [code, setCode] = useState("");

  const activate = () => {
    // TODO: API call
    navigation.replace("Login");
  };

  return (
  <View style={styles.root}>
    <Text style={styles.title}>Device Activation</Text>

    <Text style={styles.label}>Branch ID</Text>
    <TextInput
      value={branchId}
      onChangeText={setBranchId}
      placeholder="B01"
      style={styles.input}
    />

    <Text style={styles.label}>Activation Code</Text>
    <TextInput
      value={code}
      onChangeText={setCode}
      placeholder="6-digit code"
      style={styles.input}
    />

    <View style={styles.buttonWrapper}>
      <Button title="Activate" onPress={activate} />
    </View>
  </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 20,
  },
  buttonWrapper: {
    marginTop: 8,
  },
});
