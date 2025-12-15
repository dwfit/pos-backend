import React from "react";
import { View, Text, Button } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export default function HomeScreen({ navigation }: Props) {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text style={{ fontSize: 26, marginBottom: 20 }}>DWF POS</Text>

      <Text>Point of Sales</Text>

      <View style={{ marginTop: 20 }}>
        <Button
          title="Back to Login"
          onPress={() => navigation.replace("Login")}
        />
      </View>
    </View>
  );
}
