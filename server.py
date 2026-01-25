# ==============================================================================
# INSTRUCTIONS FOR GOOGLE COLAB:
# 1. Copy this entire script.
# 2. Paste it into a code cell in Google Colab.
# 3. Replace 'ENTER_YOUR_NGROK_TOKEN_HERE' with your actual ngrok token.
# 4. Run the cell.
# ==============================================================================

import os
import sys
import subprocess
import shutil
import time
import json
import asyncio
import logging

# --- CONFIGURATION ---
# ⚠️ REPLACE WITH YOUR NGROK TOKEN
NGROK_AUTH_TOKEN = os.getenv("NGROK_AUTH_TOKEN")

# Your provided Hugging Face Token
HF_TOKEN = os.getenv("HF_TOKEN")

# ✅ OPTIMIZATION: Save models to Google Drive
USE_GOOGLE_DRIVE = True

MODEL_ID = "audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim"
EMOTION_DURATION = 10  # 10s context
NOISE_DURATION = 5     # 5s context

# --- 1. SETUP & IMPORTS ---
try:
    import panns_inference
    import fastapi
    import uvicorn
    import nest_asyncio
    import pyngrok
    print("✅ Dependencies detected.")
except ImportError:
    print("🚀 Installing dependencies...")
    subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "speechbrain"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    packages = ["torch", "torchaudio", "transformers", "fastapi", "uvicorn", "python-multipart", "librosa", "pyngrok", "nest_asyncio", "soundfile", "huggingface_hub", "accelerate", "panns-inference"]
    subprocess.check_call([sys.executable, "-m", "pip", "install"] + packages + ["--upgrade", "-q"])
    print("✅ Installation complete.")

import torch
import torch.nn as nn
import librosa
import numpy as np
import uvicorn
import nest_asyncio
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from transformers import AutoProcessor, Wav2Vec2PreTrainedModel, Wav2Vec2Model
from huggingface_hub import login
from pyngrok import ngrok
from typing import Generator
from panns_inference import AudioTagging, labels

# --- 2. START NGROK EARLY (User Request) ---
# We start Ngrok NOW so you get the link immediately, even while models load.
if NGROK_AUTH_TOKEN == "ENTER_YOUR_NGROK_TOKEN_HERE":
    print("\n❌ ERROR: Add your Ngrok Token.\n")
    sys.exit(1)

# Suppress pyngrok "connection refused" warnings while server loads
logging.getLogger("pyngrok").setLevel(logging.ERROR)

ngrok.set_auth_token(NGROK_AUTH_TOKEN)
ngrok.kill()
public_url = ngrok.connect(8000).public_url
print("\n" + "="*60)
print(f"🚀 SERVER LIVE: {public_url}")
print(f"👉 Endpoint: {public_url}/analyze")
print("⚠️  NOTE: Server is loading models. Ignore 'connection refused' logs until '✨ Server ready'.")
print("="*60 + "\n")

# --- 3. STORAGE SETUP ---
hf_cache_dir = None
if USE_GOOGLE_DRIVE:
    print("📂 Mounting Google Drive...")
    try:
        from google.colab import drive
        drive.mount('/content/drive')
        drive_cache_root = "/content/drive/MyDrive/Colab_Audio_Cache"
        os.makedirs(drive_cache_root, exist_ok=True)
        os.environ['HF_HOME'] = drive_cache_root
        hf_cache_dir = drive_cache_root
        print(f"✅ Drive Configured: {drive_cache_root}")
    except Exception as e:
        print(f"⚠️ Drive mount failed: {e}. Using temp storage.")
        USE_GOOGLE_DRIVE = False

# --- 4. MODEL CLASSES ---
class Wav2Vec2ClassificationHead(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.dense = nn.Linear(config.hidden_size, config.hidden_size)
        self.dropout = nn.Dropout(config.final_dropout)
        self.out_proj = nn.Linear(config.hidden_size, config.num_labels)
    def forward(self, features, **kwargs):
        x = features
        x = self.dropout(x)
        x = self.dense(x)
        x = torch.tanh(x)
        x = self.dropout(x)
        x = self.out_proj(x)
        return x

class Wav2Vec2ForSpeechClassification(Wav2Vec2PreTrainedModel):
    def __init__(self, config):
        super().__init__(config)
        self.num_labels = config.num_labels
        self.pooling_mode = config.pooling_mode
        self.wav2vec2 = Wav2Vec2Model(config)
        self.classifier = Wav2Vec2ClassificationHead(config)
        self.init_weights()
    def forward(self, input_values, attention_mask=None):
        outputs = self.wav2vec2(input_values, attention_mask=attention_mask)
        hidden_states = outputs[0]
        hidden_states = torch.mean(hidden_states, dim=1)
        return self.classifier(hidden_states)

# --- 5. LOAD MODELS ---
print(f"\n🔑 Logging into Hugging Face...")
try: login(token=HF_TOKEN)
except: pass

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🖥️  HARDWARE: {device.upper()}")

# A. Emotion Model
print(f"🔄 Loading Emotion Model...")
try:
    processor = AutoProcessor.from_pretrained(MODEL_ID, token=HF_TOKEN, cache_dir=hf_cache_dir)
    emotion_model = Wav2Vec2ForSpeechClassification.from_pretrained(MODEL_ID, token=HF_TOKEN, cache_dir=hf_cache_dir)
    emotion_model.to(device)
    emotion_model.eval()
    print(f"✅ Emotion Model Ready ({device})")
except Exception as e:
    # Auto-fix corruption
    print(f"⚠️ Error loading Emotion Model: {e}. Clearing cache and retrying...")
    if hf_cache_dir:
        model_path = os.path.join(hf_cache_dir, "models--" + MODEL_ID.replace("/", "--"))
        if os.path.exists(model_path): shutil.rmtree(model_path)
    processor = AutoProcessor.from_pretrained(MODEL_ID, token=HF_TOKEN, cache_dir=hf_cache_dir)
    emotion_model = Wav2Vec2ForSpeechClassification.from_pretrained(MODEL_ID, token=HF_TOKEN, cache_dir=hf_cache_dir)
    emotion_model.to(device)
    emotion_model.eval()
    print(f"✅ Emotion Model Ready (Retry Success)")

# B. PANNs Model (Buffer Fix: Download Local -> Backup to Drive)
print(f"🔄 Loading PANNs (CNN14) Model...")

# Paths
panns_url = "https://zenodo.org/record/3987831/files/Cnn14_mAP=0.431.pth"
local_panns_dir = os.path.expanduser("~/panns_data") # /root/panns_data (Fast Local SSD)
os.makedirs(local_panns_dir, exist_ok=True)
local_panns_path = os.path.join(local_panns_dir, "Cnn14_mAP=0.431.pth")

drive_panns_path = None
if USE_GOOGLE_DRIVE and hf_cache_dir:
    drive_panns_dir = os.path.join(hf_cache_dir, "panns_data")
    os.makedirs(drive_panns_dir, exist_ok=True)
    drive_panns_path = os.path.join(drive_panns_dir, "Cnn14_mAP=0.431.pth")

# --- LOGIC: ENSURE LOCAL FILE EXISTS ---
file_ready = False

# 1. Check Local
if os.path.exists(local_panns_path):
    # Verify size (approx 315MB). If < 200MB, it's corrupted.
    size_mb = os.path.getsize(local_panns_path) / (1024 * 1024)
    if size_mb > 200:
        print(f"✅ Found valid PANNs model locally ({size_mb:.1f} MB).")
        file_ready = True
    else:
        print(f"⚠️ Local file too small ({size_mb:.1f} MB). Deleting...")
        os.remove(local_panns_path)

# 2. If not local, Try Copy from Drive
if not file_ready and drive_panns_path and os.path.exists(drive_panns_path):
    print(f"📂 Found PANNs in Drive. Copying to local runtime (Fast I/O)...")
    try:
        shutil.copy(drive_panns_path, local_panns_path)
        if os.path.getsize(local_panns_path) / (1024 * 1024) > 200:
            print("✅ Restore from Drive complete.")
            file_ready = True
        else:
            print("⚠️ Drive file was corrupted. Deleting...")
            os.remove(drive_panns_path)
    except Exception as e:
        print(f"⚠️ Copy failed: {e}. Will redownload.")

# 3. If still missing, Download from Web
if not file_ready:
    print(f"⬇️ Downloading PANNs model from Web to Local Storage (315 MB)...")
    try:
        # Using wget with progress bar
        subprocess.run(["wget", "-O", local_panns_path, panns_url], check=True)
        print("✅ Download successful.")

        # Backup to Drive
        if drive_panns_path:
            print(f"💾 Backing up PANNs model to Google Drive...")
            shutil.copy(local_panns_path, drive_panns_path)
            print("✅ Backup complete.")
    except Exception as e:
        print(f"❌ Critical Error downloading PANNs: {e}")
        sys.exit(1)

# Load from Local Path
try:
    print("⏳ Loading PANNs weights into GPU... (This can take 10-20 seconds)")
    # We pass the local path explicitly to avoid internal download triggers
    panns_model = AudioTagging(checkpoint_path=local_panns_path, device=device)
    print(f"✅ PANNs Model Ready ({device})")
except Exception as e:
    print(f"❌ Error loading PANNs: {e}")
    sys.exit(1)


# --- 6. APP LOGIC ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

def analyze_audio_stream(file_path: str) -> Generator[str, None, None]:
    try:
        y, sr = librosa.load(file_path, sr=16000)
    except Exception as e:
        yield json.dumps({"error": str(e)}) + "\n"
        return

    total = len(y)
    e_samps = EMOTION_DURATION * sr
    n_samps = NOISE_DURATION * sr

    print(f"   [Processing] {total/sr:.2f}s audio")

    for i in range(0, total, e_samps):
        e_chunk = y[i : i + e_samps]
        if len(e_chunk) < 1 * sr: continue

        # Emotion
        inputs = processor(e_chunk, sampling_rate=16000, return_tensors="pt", padding=True).to(device)
        with torch.no_grad():
            e_scores = emotion_model(input_values=inputs.input_values)[0].cpu().numpy().tolist()

        # Noise
        noise_segs = []
        for j in range(0, len(e_chunk), n_samps):
            sub = e_chunk[j : j + n_samps]
            if len(sub) < 0.5 * sr: continue

            clip_out, _ = panns_model.inference(sub[None, :])
            top_evs = [{"label": labels[idx], "score": round(float(clip_out[0][idx]), 4)}
                       for idx in np.argsort(clip_out[0])[::-1][:20]]

            noise_segs.append({
                "sub_start": round((i + j) / sr, 2),
                "sub_end": round((i + j + len(sub)) / sr, 2),
                "events": top_evs
            })

        yield json.dumps({
            "chunk_id": i // e_samps + 1,
            "start": round(i / sr, 2),
            "end": round((i + len(e_chunk)) / sr, 2),
            "emotions": {"arousal": round(e_scores[0], 4), "dominance": round(e_scores[1], 4), "valence": round(e_scores[2], 4)},
            "classroom_events": noise_segs
        }) + "\n"

@app.get("/")
def home(): return {"status": "Online", "hardware": device}

@app.post("/analyze")
async def analyze_endpoint(file: UploadFile = File(...)):
    t_file = f"temp_{int(time.time())}_{file.filename}"
    with open(t_file, "wb") as b: shutil.copyfileobj(file.file, b)

    def iterfile():
        try: yield from analyze_audio_stream(t_file)
        finally:
            if os.path.exists(t_file): os.remove(t_file)

    return StreamingResponse(iterfile(), media_type="application/x-ndjson")

# --- 7. RUN ---
nest_asyncio.apply()
# FIX: host="0.0.0.0" ensures we accept connections from ngrok on all interfaces (IPv4/IPv6)
config = uvicorn.Config(app, host="0.0.0.0", port=8000)
server = uvicorn.Server(config)
loop = asyncio.get_event_loop()
try:
    print("✨ Server ready. Waiting for requests...")
    loop.run_until_complete(server.serve())
except KeyboardInterrupt:
    print("\n🛑 Stopped.")