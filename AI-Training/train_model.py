import os
import numpy as np
import librosa
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import classification_report, confusion_matrix
import logging
import json
import joblib
from collections import Counter
import random

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set random seeds for reproducibility
torch.manual_seed(42)
np.random.seed(42)
random.seed(42)

def extract_features(file_path, sr=22050, duration=3.0):
    """Extract features exactly as in inference"""
    try:
        audio, sr = librosa.load(file_path, sr=sr, duration=duration)
        if np.any(np.isnan(audio)) or np.any(np.isinf(audio)) or len(audio) == 0:
            logger.error(f"Invalid audio signal in {file_path}")
            return None

        # MFCC features (20 coefficients)
        mfcc = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=20)
        mfcc_mean = np.mean(mfcc.T, axis=0)
        mfcc_std = np.std(mfcc.T, axis=0)

        # Chroma features
        try:
            chroma = librosa.feature.chroma_stft(y=audio, sr=sr, n_chroma=12)
            chroma_mean = np.mean(chroma.T, axis=0)
        except Exception as e:
            logger.warning(f"Chroma extraction failed for {file_path}: {e}")
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
        logger.error(f"Error processing {file_path}: {e}")
        return None

# Define emotion mappings (EXCLUDING SURPRISED)
folder_to_emotion = {
    "Angry": "angry",
    "Disgusted": "disgust", 
    "Fearful": "fearful",
    "Happy": "happy",
    "Neutral": "neutral",
    "Sad": "sad"
    # "Surprised" is EXCLUDED
}

emotion_map = {
    "neutral": 0,
    "happy": 1,
    "sad": 2,
    "angry": 3,
    "fearful": 4,
    "disgust": 5
    # "surprised": 6 is REMOVED
}

EMOTION_CLASSES = list(emotion_map.keys())
logger.info(f"Training with {len(EMOTION_CLASSES)} emotions: {EMOTION_CLASSES}")

# Load dataset
dataset_dir = 'ravdess_dataset'
audio_files = []
labels = []
emotion_counts = {emotion: 0 for emotion in emotion_map.keys()}

# Collect all files first
all_files_by_emotion = {emotion: [] for emotion in emotion_map.keys()}

for folder in os.listdir(dataset_dir):
    if folder == "Surprised":  # SKIP SURPRISED FOLDER
        logger.info(f"Skipping 'Surprised' folder as requested")
        continue
        
    emotion = folder_to_emotion.get(folder)
    if emotion is None:
        logger.warning(f"Skipping unknown folder: {folder}")
        continue
    
    folder_path = os.path.join(dataset_dir, folder)
    for file_name in os.listdir(folder_path):
        if file_name.endswith('.wav'):
            file_path = os.path.join(folder_path, file_name)
            all_files_by_emotion[emotion].append(file_path)
            emotion_counts[emotion] += 1

# Print original distribution
logger.info("Original dataset distribution (excluding surprised):")
for emotion, count in emotion_counts.items():
    logger.info(f"  {emotion}: {count} files")

# Balance the dataset - use the minimum count or a reasonable target
min_count = min(emotion_counts.values())
target_count = max(min_count, 100)  # At least 100 samples per class

logger.info(f"\nBalancing dataset to {target_count} samples per class...")

balanced_files = []
balanced_labels = []

for emotion in emotion_map.keys():
    files = all_files_by_emotion[emotion]
    
    if len(files) >= target_count:
        # Randomly sample target_count files
        selected_files = random.sample(files, target_count)
    else:
        # Oversample by repeating files
        selected_files = []
        while len(selected_files) < target_count:
            remaining = target_count - len(selected_files)
            if remaining >= len(files):
                selected_files.extend(files)
            else:
                selected_files.extend(random.sample(files, remaining))
    
    balanced_files.extend(selected_files)
    balanced_labels.extend([emotion] * len(selected_files))
    
    logger.info(f"  {emotion}: {len(selected_files)} files (balanced)")

# Shuffle the balanced dataset
combined = list(zip(balanced_files, balanced_labels))
random.shuffle(combined)
audio_files, labels = zip(*combined)
audio_files = list(audio_files)
labels = list(labels)

logger.info(f"\nFinal balanced dataset: {len(audio_files)} files")

# Extract features
X_list = []
y_list = []

for i, file_path in enumerate(audio_files):
    if i % 50 == 0:
        logger.info(f"Processing {i}/{len(audio_files)} files...")
    
    features = extract_features(file_path)
    if features is not None:
        X_list.append(features)
        y_list.append(emotion_map[labels[i]])

X = np.array(X_list)
y = np.array(y_list)

logger.info(f"Processed dataset: {X.shape[0]} samples with {X.shape[1]} features")

# Check final distribution
final_counts = Counter(y)
logger.info("Final dataset distribution:")
for emotion_idx, count in final_counts.items():
    emotion_name = EMOTION_CLASSES[emotion_idx]
    logger.info(f"  {emotion_name}: {count} samples")

# Feature scaling
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Save scaler
joblib.dump(scaler, 'balanced_6emotion_scaler.joblib')
with open('balanced_6emotion_scaler_params.json', 'w') as f:
    json.dump({'mean': scaler.mean_.tolist(), 'scale': scaler.scale_.tolist()}, f)

logger.info("Balanced 6-emotion scaler parameters saved")

# Convert to tensors
X_scaled = torch.tensor(X_scaled, dtype=torch.float32)
y = torch.tensor(y, dtype=torch.long)

# Split data
X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42, stratify=y)
X_train, X_val, y_train, y_val = train_test_split(
    X_train, y_train, test_size=0.2, random_state=42, stratify=y_train)

# Create data loaders
train_dataset = torch.utils.data.TensorDataset(X_train, y_train)
val_dataset = torch.utils.data.TensorDataset(X_val, y_val)
test_dataset = torch.utils.data.TensorDataset(X_test, y_test)

train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=32)
test_loader = DataLoader(test_dataset, batch_size=32)

logger.info(f"Training: {X_train.shape}, Validation: {X_val.shape}, Test: {X_test.shape}")

# Define improved model for 6 emotions
class ImprovedEmotionClassifier(nn.Module):
    def __init__(self, input_size=53, num_classes=6):  # Changed to 6 classes
        super(ImprovedEmotionClassifier, self).__init__()
        self.network = nn.Sequential(
            nn.Linear(input_size, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.4),
            
            nn.Linear(256, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.3),
            
            nn.Linear(128, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(0.2),
            
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.1),
            
            nn.Linear(32, num_classes)  # 6 classes instead of 7
        )
    
    def forward(self, x):
        return self.network(x)

# Training setup
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = ImprovedEmotionClassifier().to(device)

# Use balanced class weights
class_weights = compute_class_weight('balanced', classes=np.unique(y_train.numpy()), y=y_train.numpy())
class_weights = torch.tensor(class_weights, dtype=torch.float32).to(device)

criterion = nn.CrossEntropyLoss(weight=class_weights)
optimizer = optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-5)

# Training loop with early stopping
num_epochs = 150
best_val_accuracy = 0
patience = 15
patience_counter = 0
best_model_state = None

train_losses = []
val_losses = []
train_accuracies = []
val_accuracies = []

for epoch in range(num_epochs):
    # Training phase
    model.train()
    train_loss = 0
    train_correct = 0
    train_total = 0
    
    for features, labels in train_loader:
        features, labels = features.to(device), labels.to(device)
        
        optimizer.zero_grad()
        outputs = model(features)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        
        train_loss += loss.item()
        _, predicted = torch.max(outputs, 1)
        train_total += labels.size(0)
        train_correct += (predicted == labels).sum().item()
    
    train_loss /= len(train_loader)
    train_accuracy = train_correct / train_total
    train_losses.append(train_loss)
    train_accuracies.append(train_accuracy)
    
    # Validation phase
    model.eval()
    val_loss = 0
    val_correct = 0
    val_total = 0
    
    with torch.no_grad():
        for features, labels in val_loader:
            features, labels = features.to(device), labels.to(device)
            outputs = model(features)
            loss = criterion(outputs, labels)
            
            val_loss += loss.item()
            _, predicted = torch.max(outputs, 1)
            val_total += labels.size(0)
            val_correct += (predicted == labels).sum().item()
    
    val_loss /= len(val_loader)
    val_accuracy = val_correct / val_total
    val_losses.append(val_loss)
    val_accuracies.append(val_accuracy)
    
    logger.info(f"Epoch {epoch+1}/{num_epochs}, Train Loss: {train_loss:.4f}, Train Acc: {train_accuracy:.4f}, "
                f"Val Loss: {val_loss:.4f}, Val Acc: {val_accuracy:.4f}")
    
    # Early stopping
    if val_accuracy > best_val_accuracy:
        best_val_accuracy = val_accuracy
        best_model_state = model.state_dict().copy()
        patience_counter = 0
    else:
        patience_counter += 1
        if patience_counter >= patience:
            logger.info("Early stopping triggered")
            break

# Load best model and save
model.load_state_dict(best_model_state)
torch.save(model.state_dict(), 'balanced_6emotion_model.pth')
logger.info("Balanced 6-emotion model saved as balanced_6emotion_model.pth")

# Test evaluation
model.eval()
y_pred = []
y_true = []

with torch.no_grad():
    for features, labels in test_loader:
        features, labels = features.to(device), labels.to(device)
        outputs = model(features)
        _, predicted = torch.max(outputs, 1)
        y_pred.extend(predicted.cpu().numpy())
        y_true.extend(labels.cpu().numpy())

test_accuracy = sum(np.array(y_pred) == np.array(y_true)) / len(y_true)
logger.info(f"Test Accuracy: {test_accuracy:.4f}")

print("\nClassification Report:")
print(classification_report(y_true, y_pred, target_names=EMOTION_CLASSES))

# Confusion matrix
plt.figure(figsize=(10, 8))
cm = confusion_matrix(y_true, y_pred)
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
            xticklabels=EMOTION_CLASSES, yticklabels=EMOTION_CLASSES)
plt.title('Balanced 6-Emotion Model - Confusion Matrix')
plt.ylabel('True Label')
plt.xlabel('Predicted Label')
plt.tight_layout()
plt.savefig('balanced_6emotion_confusion_matrix.png')
plt.show()

# Convert to ONNX
model.eval()
dummy_input = torch.randn(1, 53).to(device)
torch.onnx.export(
    model,
    dummy_input,
    'balanced_6emotion_model.onnx',
    input_names=['input'],
    output_names=['output'],
    dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
)

logger.info("Balanced 6-emotion model converted to ONNX: balanced_6emotion_model.onnx")

# Save emotion mapping for reference
emotion_info = {
    "emotion_classes": EMOTION_CLASSES,
    "emotion_map": emotion_map,
    "num_classes": len(EMOTION_CLASSES),
    "excluded_emotions": ["surprised"]
}

with open('emotion_mapping_6classes.json', 'w') as f:
    json.dump(emotion_info, f, indent=2)

logger.info("Emotion mapping saved to emotion_mapping_6classes.json")
logger.info(f"Training complete! Model trained on {len(EMOTION_CLASSES)} emotions: {EMOTION_CLASSES}")