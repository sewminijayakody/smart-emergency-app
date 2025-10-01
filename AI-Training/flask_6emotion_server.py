from flask import Flask, request, jsonify
from flask_cors import CORS
import onnxruntime as ort
import numpy as np
import librosa
import json
import os
import tempfile
import traceback
from scipy import signal


app = Flask(__name__)
CORS(app)

# Global variables for model and scaler
session = None
scaler_params = None

def initialize_model():
    global session, scaler_params
    try:
        # Load the BALANCED 6-emotion ONNX model
        model_path = "balanced_6emotion_model.onnx"
        if os.path.exists(model_path):
            session = ort.InferenceSession(model_path)
            print("✅ BALANCED 6-Emotion ONNX Model loaded successfully.")
            print(f"Model inputs: {[input.name for input in session.get_inputs()]}")
            print(f"Model outputs: {[output.name for output in session.get_outputs()]}")
            
            # Print expected input shape
            input_shape = session.get_inputs()[0].shape
            print(f"Expected input shape: {input_shape}")
        else:
            print(f"❌ BALANCED 6-emotion ONNX model file not found at: {os.path.abspath(model_path)}")
            return False

        # Load the BALANCED 6-emotion scaler parameters
        scaler_path = 'balanced_6emotion_scaler_params.json'
        if os.path.exists(scaler_path):
            with open(scaler_path, 'r') as f:
                scaler_params = json.load(f)
            print("✅ BALANCED 6-emotion Scaler parameters loaded successfully.")
            print(f"Scaler mean length: {len(scaler_params.get('mean', []))}")
            print(f"Scaler scale length: {len(scaler_params.get('scale', []))}")
        else:
            print(f"❌ BALANCED 6-emotion Scaler parameters file not found at: {os.path.abspath(scaler_path)}")
            return False
            
        return True
    except Exception as e:
        print(f"❌ Model initialization error: {e}")
        traceback.print_exc()
        return False

def preprocess_audio(audio, sr):
    """Enhanced audio preprocessing to match training data better"""
    try:
        # 1. Normalize audio
        if np.max(np.abs(audio)) > 0:
            audio = audio / np.max(np.abs(audio))
        
        # 2. Remove DC offset
        audio = audio - np.mean(audio)
        
        # 3. Apply high-pass filter to remove low-frequency noise
        nyquist = sr / 2
        low_cutoff = 80 / nyquist  # Remove frequencies below 80Hz
        b, a = signal.butter(4, low_cutoff, btype='high')
        audio = signal.filtfilt(b, a, audio)
        
        # 4. Apply gentle low-pass filter to remove high-frequency noise
        high_cutoff = 8000 / nyquist  # Remove frequencies above 8kHz
        b, a = signal.butter(4, high_cutoff, btype='low')
        audio = signal.filtfilt(b, a, audio)
        
        # 5. Trim silence from beginning and end
        audio, _ = librosa.effects.trim(audio, top_db=20)
        
        # 6. Ensure minimum length
        min_length = int(1.0 * sr)  # At least 1 second
        if len(audio) < min_length:
            audio = np.pad(audio, (0, min_length - len(audio)), 'constant')
        
        print(f"Audio preprocessing complete: {len(audio)} samples")
        return audio
        
    except Exception as e:
        print(f"Audio preprocessing error: {e}")
        return audio

def extract_features_enhanced(file_path, sr=22050, duration=3.0):
    """Enhanced feature extraction with better audio preprocessing"""
    try:
        print(f"🎵 Loading audio file: {file_path}")
        
        # Load audio file
        audio, sr = librosa.load(file_path, sr=sr, duration=duration)
        
        # Check for invalid audio
        if np.any(np.isnan(audio)) or np.any(np.isinf(audio)) or len(audio) == 0:
            print(f"❌ Invalid audio signal in {file_path}")
            return None
        
        print(f"Original audio: {len(audio)} samples, duration: {len(audio)/sr:.2f}s")
        
        # Enhanced preprocessing
        audio = preprocess_audio(audio, sr)
        
        print(f"Processed audio: {len(audio)} samples, RMS: {np.sqrt(np.mean(audio**2)):.4f}")
        
        # MFCC features (20 coefficients)
        mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=20, n_fft=2048, hop_length=512)
        mfcc_mean = np.mean(mfcc.T, axis=0)
        mfcc_std = np.std(mfcc.T, axis=0)
        print(f"MFCC mean shape: {mfcc_mean.shape}, MFCC std shape: {mfcc_std.shape}")
        
        # Chroma features
        try:
            chroma = librosa.feature.chroma_stft(y=audio, sr=sr, n_chroma=12, n_fft=2048, hop_length=512)
            chroma_mean = np.mean(chroma.T, axis=0)
            print(f"Chroma mean shape: {chroma_mean.shape}")
        except Exception as e:
            print(f"⚠️ Chroma extraction failed: {e}")
            chroma_mean = np.zeros(12)
        
        # Spectral features
        spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sr, n_fft=2048, hop_length=512)
        spectral_centroid_mean = np.mean(spectral_centroid)
        print(f"Spectral centroid: {spectral_centroid_mean:.1f}")
        
        spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr, n_fft=2048, hop_length=512)
        spectral_rolloff_mean = np.mean(spectral_rolloff)
        print(f"Spectral rolloff: {spectral_rolloff_mean:.1f}")
        
        zcr = librosa.feature.zero_crossing_rate(audio, hop_length=512)
        zcr_mean = np.mean(zcr)
        print(f"ZCR: {zcr_mean:.4f}")
        
        # Combine features
        features = np.concatenate([
            mfcc_mean,              # 20 features
            mfcc_std,               # 20 features
            chroma_mean,            # 12 features
            [spectral_centroid_mean], # 1 feature
            [spectral_rolloff_mean],  # 1 feature
            [zcr_mean]              # 1 feature
        ])
        
        print(f"Features before padding/truncating: {len(features)}")
        
        # Ensure exactly 53 features
        if len(features) > 53:
            features = features[:53]
            print(f"⚠️ Truncated features to 53")
        elif len(features) < 53:
            features = np.pad(features, (0, 53 - len(features)), 'constant')
            print(f"⚠️ Padded features to 53")
        
        print(f"✅ Final features shape: {len(features)}")
        return features
        
    except Exception as e:
        print(f"❌ Feature extraction error: {e}")
        traceback.print_exc()
        return None

def scale_features(features):
    """Scale features using the loaded balanced 6-emotion scaler parameters"""
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

def simple_emotion_detection(file_path):
    """Simple rule-based emotion detection for comparison"""
    try:
        # Load audio
        audio, sr = librosa.load(file_path, sr=22050, duration=3.0)
        
        # Preprocess audio
        audio = preprocess_audio(audio, sr)
        
        # Calculate features
        rms = np.sqrt(np.mean(audio**2))
        zcr = np.mean(librosa.feature.zero_crossing_rate(audio))
        spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=audio, sr=sr))
        
        # Get tempo
        try:
            tempo, _ = librosa.beat.beat_track(y=audio, sr=sr)
        except:
            tempo = 120  # Default
        
        print(f"Simple detection features:")
        print(f"  RMS Energy: {rms:.4f}")
        print(f"  ZCR: {zcr:.4f}")
        print(f"  Spectral Centroid: {spectral_centroid:.1f}")
        print(f"  Tempo: {tempo:.1f}")
        
        # Rule-based classification
        emotion = "neutral"
        confidence = 0.5
        
        # Very high energy = fearful (screaming, panic)
        if rms > 0.1:
            emotion = "fearful"
            confidence = 0.9
        # High energy + high pitch = angry
        elif rms > 0.05 and spectral_centroid > 2500:
            emotion = "angry"
            confidence = 0.8
        # High energy + lower pitch = angry
        elif rms > 0.03 and spectral_centroid < 2000:
            emotion = "angry" 
            confidence = 0.7
        # Moderate energy + high pitch = happy
        elif rms > 0.02 and spectral_centroid > 3000:
            emotion = "happy"
            confidence = 0.7
        # Low energy + low pitch = sad
        elif rms < 0.02 and spectral_centroid < 1800:
            emotion = "sad"
            confidence = 0.7
        # Very low energy = neutral
        elif rms < 0.01:
            emotion = "neutral"
            confidence = 0.8
        # High chaos (high ZCR) = fearful
        elif zcr > 0.15:
            emotion = "fearful"
            confidence = 0.8
            
        print(f"  Rule-based prediction: {emotion} ({confidence:.3f})")
        
        return emotion, confidence
        
    except Exception as e:
        print(f"Simple detection error: {e}")
        return "neutral", 0.5

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "flask-server",
        "model_loaded": session is not None,
        "scaler_loaded": scaler_params is not None,
        "model_type": "balanced_6emotion_model_enhanced",
        "emotions": ["neutral", "happy", "sad", "angry", "fearful", "disgust"],
        "excluded_emotions": ["surprised"],
        "message": "Flask Enhanced 6-Emotion Detection Server is running"
    }), 200

@app.route('/api/analyze_audio', methods=['POST'])
def analyze_audio():
    """Analyze audio for emotion detection using the enhanced balanced 6-emotion model"""
    try:
        print("🎵 Received audio analysis request (ENHANCED)")
        
        # Check if model is loaded
        if session is None:
            return jsonify({"msg": "Balanced 6-emotion model not loaded"}), 500
            
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
            # Extract features using ENHANCED method
            features = extract_features_enhanced(temp_path, sr=22050, duration=3.0)
            
            if features is None:
                return jsonify({"msg": "Feature extraction failed"}), 500
            
            # Scale features
            scaled_features = scale_features(features)
            
            # Prepare input for ONNX model
            input_data = np.array(scaled_features, dtype=np.float32).reshape(1, -1)
            input_name = session.get_inputs()[0].name
            output_name = session.get_outputs()[0].name
            
            print(f"🔮 Running inference with enhanced model, input shape: {input_data.shape}")
            
            # Run inference
            result = session.run([output_name], {input_name: input_data})[0]
            print(f"Raw model output: {result[0]}")
            
            # Apply softmax
            softmax_result = np.exp(result[0]) / np.sum(np.exp(result[0]))
            print(f"Softmax probabilities: {softmax_result}")
            
            # Get prediction
            predicted_class = np.argmax(softmax_result)
            confidence = float(softmax_result[predicted_class])
            
            # Map to emotion labels
            emotions = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgust']
            predicted_emotion = emotions[predicted_class]
            
            print(f"🎭 Enhanced model prediction: {predicted_emotion} (confidence: {confidence:.3f})")
            
            # Also get simple rule-based prediction for comparison
            simple_emotion, simple_confidence = simple_emotion_detection(temp_path)
            
            print(f"All probabilities:")
            for i, emotion in enumerate(emotions):
                print(f"  {emotion}: {softmax_result[i]:.3f}")
            
            return jsonify({
                "emotion": predicted_emotion,
                "confidence": confidence,
                "all_predictions": {
                    emotions[i]: float(softmax_result[i]) for i in range(len(emotions))
                },
                "simple_method": {
                    "emotion": simple_emotion,
                    "confidence": simple_confidence
                },
                "model_type": "enhanced_6emotion",
                "model_info": {
                    "total_emotions": len(emotions),
                    "emotions": emotions,
                    "excluded": ["surprised"]
                }
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

@app.route('/api/analyze_audio_simple', methods=['POST'])
def analyze_audio_simple():
    """Analyze audio using simple rule-based method"""
    try:
        print("🎵 Received audio analysis request (SIMPLE METHOD)")
        
        if 'audio' not in request.files:
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
            # Use simple rule-based detection
            emotion, confidence = simple_emotion_detection(temp_path)
            
            print(f"🎭 Simple method prediction: {emotion} (confidence: {confidence:.3f})")
            
            return jsonify({
                "emotion": emotion,
                "confidence": confidence,
                "method": "rule_based_simple",
                "message": "Rule-based emotion detection using audio characteristics"
            }), 200
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                print(f"🗑️ Cleaned up temporary file")
                
    except Exception as e:
        print(f"❌ Simple audio analysis error: {e}")
        traceback.print_exc()
        return jsonify({"msg": f"Simple audio analysis failed: {str(e)}"}), 500

if __name__ == '__main__':
    print("🚀 Starting Flask Enhanced 6-Emotion Detection Server...")
    print(f"📁 Current directory: {os.getcwd()}")
    print(f"📁 Files in directory: {os.listdir('.')}")
    
    # Initialize enhanced model
    if initialize_model():
        print("✅ Flask server initialized successfully with ENHANCED 6-EMOTION model")
        print("🎭 Emotions: neutral, happy, sad, angry, fearful, disgust")
        print("❌ Excluded: surprised")
        print("🔧 Enhanced with better audio preprocessing!")
    else:
        print("❌ Flask server initialization failed")
        print("Please ensure balanced_6emotion_model.onnx and balanced_6emotion_scaler_params.json are in the same directory")
    
    app.run(host='0.0.0.0', port=5001, debug=True)


    