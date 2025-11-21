# inference_flask_server.py
import os
import json
import tempfile
import traceback

from flask import Flask, request, jsonify
from flask_cors import CORS

import numpy as np
import onnxruntime as ort
import librosa

# Fallback decode for non-WAV (m4a/mp3/ogg/webm/3gp)
# Requires FFmpeg installed and on PATH
from pydub import AudioSegment

MODEL_PATH = "balanced_6emotion_model.onnx"
SCALER_JSON = "balanced_6emotion_scaler_params.json"
EMOTIONS = ["neutral", "happy", "sad", "angry", "fearful", "disgust"]

# 🔹 NEW: threshold for "silence / very quiet audio"
SILENCE_THRESHOLD = 0.001  # you can tune this (see notes below)

app = Flask(__name__)
CORS(app)

session = None
scaler_params = None


def load_scaler():
    global scaler_params
    if not os.path.exists(SCALER_JSON):
        raise FileNotFoundError(f"Missing {SCALER_JSON}")
    with open(SCALER_JSON, "r", encoding="utf-8") as f:
        scaler_params = json.load(f)


def scale(features: np.ndarray) -> np.ndarray:
    mean = np.array(scaler_params["mean"], dtype="float32")
    scale_arr = np.array(scaler_params["scale"], dtype="float32")
    # Avoid divide-by-zero
    scale_safe = np.where(scale_arr == 0, 1.0, scale_arr)
    return (features - mean) / scale_safe


def safe_load_audio(path: str, sr: int = 22050, duration: float = 3.0, mono: bool = True):
    """
    Robust loader:
    1) Try librosa/soundfile directly (WAV/FLAC).
    2) If that fails, decode via pydub (FFmpeg) to temp WAV, then librosa.
    Also trims/pads to 'duration' and enforces mono + target sample rate.
    """
    # Attempt 1: direct load
    try:
        y, _ = librosa.load(path, sr=sr, duration=duration, mono=mono)
        if y is not None and y.size > 0:
            return y, sr
    except Exception:
        pass

    # Attempt 2: decode anything with pydub/ffmpeg, then load
    try:
        seg = AudioSegment.from_file(path)  # ffmpeg-powered
        if mono and seg.channels != 1:
            seg = seg.set_channels(1)
        if seg.frame_rate != sr:
            seg = seg.set_frame_rate(sr)

        target_ms = int(duration * 1000)
        if len(seg) > target_ms:
            seg = seg[:target_ms]
        elif len(seg) < target_ms:
            seg += AudioSegment.silent(duration=target_ms - len(seg), frame_rate=sr)

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmpwav:
            tmp_path = tmpwav.name
        seg.export(tmp_path, format="wav")
        y, _ = librosa.load(tmp_path, sr=sr, mono=mono)
        os.remove(tmp_path)

        if y is None or y.size == 0:
            raise RuntimeError("Decoded but empty audio.")
        return y, sr
    except Exception as e:
        raise RuntimeError(f"Failed to decode audio (need FFmpeg?) -> {e}")


def extract_features(path: str, sr: int = 22050, duration: float = 3.0):
    """
    EXACT same feature recipe as training:
    - 20 MFCC means + 20 MFCC stds = 40
    - 12-dim chroma mean = 12
    - spectral centroid mean = 1
    - spectral rolloff mean = 1
    - zero crossing rate mean = 1
    Total = 55 -> we enforce 53 by trimming to 53 (the same way as your training script).

    Returns:
      feats (np.ndarray) or None,
      is_silence (bool)
    """
    y, sr = safe_load_audio(path, sr=sr, duration=duration, mono=True)
    if y is None or y.size == 0:
        return None, False

    # 🔹 NEW: silence / low-energy detection
    rms = float(np.sqrt(np.mean(y ** 2)))
    print(f"[DEBUG] RMS energy: {rms}")
    if rms < SILENCE_THRESHOLD:
        print("[DEBUG] Detected low-energy / silence")
        return None, True

    # MFCC (20)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
    mfcc_mean = mfcc.T.mean(axis=0)
    mfcc_std = mfcc.T.std(axis=0)

    # Chroma (12)
    try:
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, n_chroma=12)
        chroma_mean = chroma.T.mean(axis=0)
    except Exception:
        chroma_mean = np.zeros(12, dtype=np.float32)

    # Spectral features (3 scalars)
    spectral_centroid = float(librosa.feature.spectral_centroid(y=y, sr=sr).mean())
    spectral_rolloff = float(librosa.feature.spectral_rolloff(y=y, sr=sr).mean())
    zcr_mean = float(librosa.feature.zero_crossing_rate(y).mean())

    feats = np.concatenate([
        mfcc_mean, mfcc_std, chroma_mean,
        [spectral_centroid], [spectral_rolloff], [zcr_mean]
    ])

    # enforce 53-dim exactly like training
    if feats.shape[0] > 53:
        feats = feats[:53]
    elif feats.shape[0] < 53:
        feats = np.pad(feats, (0, 53 - feats.shape[0]), constant_values=0.0)

    return feats.astype("float32"), False


def initialize():
    global session
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Missing {MODEL_PATH}")
    load_scaler()
    session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "model_loaded": session is not None,
        "scaler_loaded": scaler_params is not None,
        "emotions": EMOTIONS
    })


@app.route("/api/analyze_audio", methods=["POST"])
def analyze_audio():
    try:
        if session is None:
            return jsonify({"msg": "Model not loaded"}), 500
        if "audio" not in request.files:
            return jsonify({"msg": "No audio file provided"}), 400

        file = request.files["audio"]

        # quick sanity (empty file)
        file.stream.seek(0, 2)
        size = file.stream.tell()
        file.stream.seek(0)
        if size < 128:
            return jsonify({"msg": "Uploaded file is empty or corrupted"}), 400

        # Save to temp (we accept any format; extractor will handle it)
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=os.path.splitext(file.filename or "")[1] or ".bin"
        ) as tmp:
            file.save(tmp.name)
            temp_path = tmp.name

        feats, is_silence = extract_features(temp_path)
        os.unlink(temp_path)

        # 🔹 If it's silence / very quiet, force NEUTRAL
        if is_silence:
            all_preds = {emo: 0.0 for emo in EMOTIONS}
            all_preds["neutral"] = 1.0
            return jsonify({
                "emotion": "neutral",
                "confidence": 1.0,
                "all_predictions": all_preds
            }), 200

        if feats is None:
            return jsonify({"msg": "Invalid or undecodable audio"}), 400

        feats_scaled = scale(feats).reshape(1, -1).astype("float32")
        out = session.run([session.get_outputs()[0].name],
                          {session.get_inputs()[0].name: feats_scaled})[0][0]

        # softmax
        exps = np.exp(out - np.max(out))
        probs = exps / exps.sum()

        idx = int(np.argmax(probs))
        resp = {
            "emotion": EMOTIONS[idx],
            "confidence": float(probs[idx]),
            "all_predictions": {
                EMOTIONS[i]: float(probs[i]) for i in range(len(EMOTIONS))
            }
        }
        return jsonify(resp), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({"msg": f"Audio analysis failed: {e}"}), 500


if __name__ == "__main__":
    initialize()
    print("✅ Model + scaler loaded.")
    app.run(host="0.0.0.0", port=5001, debug=False)
