from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from google import genai
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI()

# Allow frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Serve static files (HTML, CSS, JS) from the /static folder ──
app.mount("/static", StaticFiles(directory="static"), name="static")

# ── Serve index.html at root so http://127.0.0.1:8000 opens the UI ──
@app.get("/")
async def serve_ui():
    return FileResponse("static/index.html")

print("⏳ Loading Medical Brain (RAG Database)...")

try:
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    vectorstore = Chroma(
        persist_directory="./medical_db",
        embedding_function=embeddings
    )
    print("✅ Medical Brain Loaded! MediMind Server is ready.")
except Exception as e:
    print(f"❌ Error loading database: {e}")
    vectorstore = None


class UserInput(BaseModel):
    message: str


@app.post("/chat")
async def chat_with_medimind(user_request: UserInput):
    if vectorstore is None:
        return {"reply": "❌ Medical database not loaded. Please run build_db.py first."}

    try:
        # Search the local database
        docs = vectorstore.similarity_search(user_request.message, k=3)
        medical_context = "\n\n".join([doc.page_content for doc in docs])

        system_prompt = f"""
        You are MediMind AI, an empathetic and professional health assistant.
        You understand both English and Hinglish.

        MEDICAL CONTEXT (From Verified Database):
        {medical_context}

        YOUR INSTRUCTIONS:
        1. Analyze the user's symptom and compare it to the MEDICAL CONTEXT provided above.
        2. Mention the possible disease(s), explain what it is (Description), and list the Precautions.
        3. BE CONVERSATIONAL: Ask 1 or 2 follow-up questions (e.g., "Kab se ho raha hai?", "Any other symptoms?") to help narrow it down.
        4. Do NOT hallucinate. If the context doesn't match the symptom, say you don't have enough data.
        5. ALWAYS include a brief disclaimer that you are an AI, not a doctor.
        """

        full_prompt = f"{system_prompt}\n\nPatient says: {user_request.message}"

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=full_prompt
        )

        return {"reply": response.text}

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error: {error_msg}")
        return {"reply": f"Error connecting to brain: {error_msg}"}