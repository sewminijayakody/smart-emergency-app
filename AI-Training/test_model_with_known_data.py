# test_model_with_known_data.py
import os
import numpy as np
import librosa
import onnxruntime as ort
import json

# Load the model and scaler
session = ort.InferenceSession("balanced_6emotion_model.onnx")
with open('balanced_6emotion_scaler_params.json', 'r') as f:
    scaler_params = json.load(f)

def extract_features(file_path, sr=22050, duration=3.0):
    """Same feature extraction as your server"""
    try:
        audio, sr = librosa.load(file_path, sr=sr, duration=duration)
        
        if np.any(np.isnan(audio)) or np.any(np.isinf(audio)) or len(audio) == 0:
            return None
            
        # MFCC features
        mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=20)
        mfcc_mean = np.mean(mfcc.T, axis=0)
        mfcc_std = np.std(mfcc.T, axis=0)
        
        # Chroma features
        try:
            chroma = librosa.feature.chroma_stft(y=audio, sr=sr, n_chroma=12)
            chroma_mean = np.mean(chroma.T, axis=0)
        except:
            chroma_mean = np.zeros(12)
        
        # Spectral features
        spectral_centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)
        spectral_centroid_mean = np.mean(spectral_centroid)
        
        spectral_rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)
        spectral_rolloff_mean = np.mean(spectral_rolloff)
        
        zcr = librosa.feature.zero_crossing_rate(audio)
        zcr_mean = np.mean(zcr)
        
        # Combine features
        features = np.concatenate([
            mfcc_mean, mfcc_std, chroma_mean, 
            [spectral_centroid_mean], [spectral_rolloff_mean], [zcr_mean]
        ])
        
        # Ensure exactly 53 features
        if len(features) > 53:
            features = features[:53]
        elif len(features) < 53:
            features = np.pad(features, (0, 53 - len(features)), 'constant')
        
        return features
    except Exception as e:
        print(f"Error: {e}")
        return None

def test_known_files():
    """Test the model with known emotion files from your dataset"""
    
    folder_to_emotion = {
        "Angry": "angry",
        "Disgusted": "disgust", 
        "Fearful": "fearful",
        "Happy": "happy",
        "Neutral": "neutral",
        "Sad": "sad"
    }
    
    emotions = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgust']
    
    print("Testing model with known emotion files from dataset:")
    print("=" * 60)
    
    for folder_name, true_emotion in folder_to_emotion.items():
        folder_path = os.path.join('ravdess_dataset', folder_name)
        if not os.path.exists(folder_path):
            continue
            
        # Test first 3 files from each emotion
        files = [f for f in os.listdir(folder_path) if f.endswith('.wav')][:3]
        
        print(f"\n{folder_name} ({true_emotion}):")
        print("-" * 30)
        
        correct_predictions = 0
        
        for file_name in files:
            file_path = os.path.join(folder_path, file_name)
            
            # Extract features
            features = extract_features(file_path)
            if features is None:
                continue
                
            # Scale features
            mean = np.array(scaler_params['mean'])
            scale = np.array(scaler_params['scale'])
            scaled_features = (features - mean) / scale
            
            # Run inference
            input_data = np.array(scaled_features, dtype=np.float32).reshape(1, -1)
            result = session.run(['output'], {'input': input_data})[0]
            softmax_result = np.exp(result[0]) / np.sum(np.exp(result[0]))
            
            predicted_class = np.argmax(softmax_result)
            predicted_emotion = emotions[predicted_class]
            confidence = softmax_result[predicted_class]
            
            is_correct = predicted_emotion == true_emotion
            if is_correct:
                correct_predictions += 1
                
            print(f"  {file_name}: {predicted_emotion} ({confidence:.3f}) {'✅' if is_correct else '❌'}")
            
            # Show top 3 predictions
            top_3_indices = np.argsort(softmax_result)[-3:][::-1]
            print(f"    Top 3: ", end="")
            for i, idx in enumerate(top_3_indices):
                print(f"{emotions[idx]}({softmax_result[idx]:.3f})", end="")
                if i < 2:
                    print(", ", end="")
            print()
        
        accuracy = correct_predictions / len(files) if files else 0
        print(f"  Accuracy: {accuracy:.1%} ({correct_predictions}/{len(files)})")

if __name__ == "__main__":
    test_known_files()