import * as tf from "@tensorflow/tfjs";
import { bundleResourceIO } from "@tensorflow/tfjs-react-native";
import { Asset } from "expo-asset";

export const loadModel = async () => {
  // Load the model JSON using Expo Asset
  const modelJson = require("../assets/model_tfjs/model.json");
  const modelWeights = [
    // Use the expo-asset system for model weights
    Asset.fromModule(require("../assets/model_tfjs/group1-shard1of1.bin")).uri,
  ];

  // Wait for the asset to be fully loaded
  await Asset.loadAsync(modelWeights);

  // Load the model using TensorFlow.js
  const model = await tf.loadLayersModel(
    bundleResourceIO(modelJson, modelWeights)
  );
  return model;
};
