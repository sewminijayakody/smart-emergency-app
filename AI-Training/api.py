from flask import Flask, request, jsonify
from flask_cors import CORS
import onnxruntime as ort
import numpy as np
import librosa
import json
import os
import tempfile
import traceback

app = Flask(__name__)
CORS(app)

# Global variables for model and scaler
session = None
scaler_params = None

def initialize_model():
    global session, scaler_params
    try:
        # Load the BALANCED ONNX model
        model_path = "balanced_emotion_model.onnx"
        if os.path.exists(model_path):
            session = ort.InferenceSession(model_path)
            print("✅ BALANCED ONNX Model loaded successfully.")
            print(f"Model inputs: {[input.name for input in session.get_inputs()]}")
            print(f"Model outputs: {[output.name for output in session.get_outputs()]}")
            
            # Print expected input shape
            input_shape = session.get_inputs()[0].shape
            print(f"Expected input shape: {input_shape}")
        else:
            print(f"❌ BALANCED ONNX model file not found at: {os.path.abspath(model_path)}")
            return False

        # Load the BALANCED scaler parameters
        scaler_path = 'balanced_scaler_params.json'
        if os.path.exists(scaler_path):
            with open(scaler_path, 'r') as f:
                scaler_params = json.load(f)
            print("✅ BALANCED Scaler parameters loaded successfully.")
            print(f"Scaler mean length: {len(scaler_params.get('mean', []))}")
            print(f"Scaler scale length: {len(scaler_params.get('scale', []))}")
        else:
            print(f"❌ BALANCED Scaler parameters file not found at: {os.path.abspath(scaler_path)}")
            return False
            
        return True
    except Exception as e:
        print(f"❌ Model initialization error: {e}")
        traceback.print_exc()
        return False

def extract_features(file_path, sr=22050, duration=3.0):
    """Extract features EXACTLY as in the balanced training script"""
    try:
        print(f"🎵 Loading audio file: {file_path}")
        
        # Load audio file - EXACTLY as in balanced training
        audio, sr = librosa.load(file_path, sr=sr, duration=duration)
        
        # Check for invalid audio - EXACTLY as in balanced training
        if np.any(np.isnan(audio)) or np.any(np.isinf(audio)) or len(audio) == 0:
            print(f"❌ Invalid audio signal in {file_path}")
            return None
            
        print(f"Audio loaded: {len(audio)} samples, duration: {len(audio)/sr:.2f}s")
        
        # MFCC features (20 coefficients) - EXACTLY as in balanced training
        mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=20)
        mfcc_mean = np.mean(mfcc.T, axis=0)
        mfcc_std = np.std(mfcc.T, axis=0)
        print(f"MFCC mean shape: {mfcc_mean.shape}, MFCC std shape: {mfcc_std.shape}")
        
        # Chroma features - EXACTLY as in balanced training
        try:
            chroma = librosa.feature.chroma_stft(y=audio, sr=sr, n_chroma=12)
            chroma_mean = np.mean(chroma.T, axis=0)
            print(f"Chroma mean shape: {chroma_mean.shape}")
        except Exception as e:
            print(f"⚠️ Chroma extraction failed for {file_path}: {e}")
            chroma_mean = np.zeros(12)
        
        # Spectral features - EXACTLY as in balanced training
        spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)
        spectral_centroid_mean = np.mean(spectral_centroid)  # Scalar mean
        print(f"Spectral centroid shape: {spectral_centroid.shape}, Mean: {spectral_centroid_mean}")
        
        spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)
        spectral_rolloff_mean = np.mean(spectral_rolloff)  # Scalar mean
        print(f"Spectral rolloff shape: {spectral_rolloff.shape}, Mean: {spectral_rolloff_mean}")
        
        zcr = librosa.feature.zero_crossing_rate(audio)
        zcr_mean = np.mean(zcr)  # Scalar mean
        print(f"ZCR shape: {zcr.shape}, Mean: {zcr_mean}")
        
        # Combine features - EXACTLY as in balanced training
        features = np.concatenate([
            mfcc_mean,              # 20 features
            mfcc_std,               # 20 features
            chroma_mean,            # 12 features
            [spectral_centroid_mean], # 1 feature
            [spectral_rolloff_mean],  # 1 feature
            [zcr_mean]              # 1 feature
        ])
        
        print(f"Features before padding/truncating: {len(features)}")
        
        # Ensure exactly 53 features (pad or truncate if necessary) - EXACTLY as in balanced training
        if len(features) > 53:
            features = features[:53]  # Truncate if more than 53
            print(f"⚠️ Truncated features to 53")
        elif len(features) < 53:
            features = np.pad(features, (0, 53 - len(features)), 'constant')  # Pad with zeros if less than 53
            print(f"⚠️ Padded features to 53")
        
        print(f"✅ Final features shape: {len(features)}")
        return features
        
    except Exception as e:
        print(f"❌ Feature extraction error: {e}")
        traceback.print_exc()
        return None

def scale_features(features):
    """Scale features using the loaded balanced scaler parameters"""
    try:
        if scaler_params is None:
            print("❌ Scaler parameters not loaded")
            return features
            
        mean = np.array(scaler_params['mean'])
        scale = np.array(scaler_params['scale'])
        
        if len(features) != len(mean):
            print(f"❌ Feature dimension mismatch: {len(features)} vs {len(mean)}")
            return features
            
        scaled = (features - mean) / scale
        print(f"✅ Features scaled successfully")
        return scaled
        
    except Exception as e:
        print(f"❌ Feature scaling error: {e}")
        return features

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "flask-server",
        "model_loaded": session is not None,
        "scaler_loaded": scaler_params is not None,
        "model_type": "balanced_emotion_model",
        "message": "Flask Balanced Emotion Detection Server is running"
    }), 200

@app.route('/api/test_predictions', methods=['GET'])
def test_predictions():
    """Test with synthetic data to verify the balanced model works correctly"""
    try:
        if session is None:
            return jsonify({"msg": "Model not loaded"}), 500
        
        # Create synthetic test cases that should predict different emotions
        test_cases = [
            {
                "name": "high_energy_happy",
                "features": np.random.normal(2.0, 0.5, 53)  # High positive values
            },
            {
                "name": "low_energy_sad", 
                "features": np.random.normal(-1.0, 0.3, 53)  # Low negative values
            },
            {
                "name": "neutral_baseline",
                "features": np.random.normal(0.0, 0.2, 53)  # Around zero
            },
            {
                "name": "high_variance_angry",
                "features": np.random.normal(0.5, 1.5, 53)  # High variance
            },
            {
                "name": "fearful_pattern",
                "features": np.random.normal(-0.5, 1.0, 53)  # Negative with high variance
            }
        ]
        
        results = []
        emotions = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgust', 'surprised']
        
        for test_case in test_cases:
            # Scale features
            if scaler_params:
                mean = np.array(scaler_params['mean'])
                scale = np.array(scaler_params['scale'])
                scaled_features = (test_case["features"] - mean) / scale
            else:
                scaled_features = test_case["features"]
            
            # Run inference
            input_data = np.array(scaled_features, dtype=np.float32).reshape(1, -1)
            input_name = session.get_inputs()[0].name
            output_name = session.get_outputs()[0].name
            
            result = session.run([output_name], {input_name: input_data})[0]
            softmax_result = np.exp(result[0]) / np.sum(np.exp(result[0]))
            
            predicted_class = np.argmax(softmax_result)
            confidence = float(softmax_result[predicted_class])
            predicted_emotion = emotions[predicted_class]
            
            results.append({
                "test_case": test_case["name"],
                "predicted_emotion": predicted_emotion,
                "confidence": confidence,
                "all_probabilities": {
                    emotions[i]: float(softmax_result[i]) for i in range(len(emotions))
                }
            })
        
        return jsonify({
            "message": "Synthetic test completed with balanced model",
            "results": results
        }), 200
        
    except Exception as e:
        print(f"❌ Test error: {e}")
        return jsonify({"msg": f"Test failed: {str(e)}"}), 500

@app.route('/api/analyze_audio', methods=['POST'])
def analyze_audio():
    """Analyze audio for emotion detection using the balanced model"""
    try:
        print("🎵 Received audio analysis request")
        
        # Check if model is loaded
        if session is None:
            return jsonify({"msg": "Balanced model not loaded"}), 500
            
        # Check if audio file is provided
        if 'audio' not in request.files:
            print("❌ No audio file in request")
            return jsonify({"msg": "No audio file provided"}), 400
            
        file = request.files['audio']
        if file.filename == '':
            return jsonify({"msg": "No file selected"}), 400
        
        print(f"📁 Received file: {file.filename}")
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            file.save(temp_file.name)
            temp_path = temp_file.name
            print(f"💾 Saved to temporary file: {temp_path}")
        
        try:
            # Extract features using EXACT balanced training method
            features = extract_features(temp_path, sr=22050, duration=3.0)
            
            if features is None:
                return jsonify({"msg": "Feature extraction failed"}), 500
            
            # Scale features using balanced scaler
            scaled_features = scale_features(features)
            
            # Prepare input for ONNX model
            input_data = np.array(scaled_features, dtype=np.float32).reshape(1, -1)
            input_name = session.get_inputs()[0].name
            output_name = session.get_outputs()[0].name
            
            print(f"🔮 Running inference with balanced model, input shape: {input_data.shape}")
            
            # Run inference with balanced model
            result = session.run([output_name], {input_name: input_data})[0]
            print(f"Raw balanced model output: {result[0]}")
            
            # Apply softmax to get proper probabilities
            softmax_result = np.exp(result[0]) / np.sum(np.exp(result[0]))
            print(f"Softmax probabilities: {softmax_result}")
            
            # NO BIAS CORRECTION NEEDED - the balanced model should work correctly
            predicted_class = np.argmax(softmax_result)
            confidence = float(softmax_result[predicted_class])
            
            # Map to emotion labels
            emotions = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgust', 'surprised']
            predicted_emotion = emotions[predicted_class]
            
            print(f"🎭 Balanced model prediction: {predicted_emotion} (confidence: {confidence:.3f})")
            
            print(f"All probabilities:")
            for i, emotion in enumerate(emotions):
                print(f"  {emotion}: {softmax_result[i]:.3f}")
            
            return jsonify({
                "emotion": predicted_emotion,
                "confidence": confidence,
                "all_predictions": {
                    emotions[i]: float(softmax_result[i]) for i in range(len(emotions))
                },
                "model_type": "balanced"
            }), 200
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                print(f"🗑️ Cleaned up temporary file")
                
    except Exception as e:
        print(f"❌ Audio analysis error: {e}")
        traceback.print_exc()
        return jsonify({"msg": f"Audio analysis failed: {str(e)}"}), 500

if __name__ == '__main__':
    print("🚀 Starting Flask Balanced Emotion Detection Server...")
    print(f"📁 Current directory: {os.getcwd()}")
    print(f"📁 Files in directory: {os.listdir('.')}")
    
    # Initialize balanced model and scaler
    if initialize_model():
        print("✅ Flask server initialized successfully with BALANCED model")
    else:
        print("❌ Flask server initialization failed - some features may not work")
        print("Please ensure balanced_emotion_model.onnx and balanced_scaler_params.json are in the same directory")
    
    # CHANGED PORT TO 5001 (Flask server)
    app.run(host='0.0.0.0', port=5001, debug=True)