import joblib as jb
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from difflib import SequenceMatcher
import os
from fastapi.staticfiles import StaticFiles
import numpy as np

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    precautions_df = pd.read_csv(r"C:\Users\anasm\Documents\MediMindAI\datasets\symptom_precaution.csv")
    description_df = pd.read_csv(r"C:\Users\anasm\Documents\MediMindAI\datasets\symptom_Description.csv")
    sym_list       = jb.load("symptoms_list.joblib")
    model          = jb.load("disease_prediction_model.joblib")
    print("✅ All resources loaded.")
except Exception as e:
    print(f"❌ Error loading resources: {e}")
    sym_list       = []
    model          = None
    precautions_df = pd.DataFrame()
    description_df = pd.DataFrame()


# ════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ════════════════════════════════════════════════════════════════════════════

def similarity_score(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def resolve_symptoms(user_symptoms: list[str]):
    exact_matched = []
    fuzzy_matched = {}
    not_found     = []

    for symptom in user_symptoms:
        symptom = symptom.strip().lower()

        if symptom in sym_list:
            exact_matched.append(symptom)
            continue

        scored = sorted(
            [(s, similarity_score(symptom, s)) for s in sym_list],
            key=lambda x: x[1],
            reverse=True
        )
        top = [s for s, score in scored[:5] if score >= 0.45]

        if top:
            fuzzy_matched[symptom] = top
        else:
            not_found.append(symptom)

    return exact_matched, fuzzy_matched, not_found


def get_disease_info(disease: str) -> dict:
    """Fetch description and precautions for a disease."""
    disease_list = description_df["Disease"].values.tolist()

    description = ""
    if disease in disease_list:
        desc_index  = disease_list.index(disease)
        description = description_df["Description"][desc_index]

    precautions = []
    prec_disease_list = precautions_df["Disease"].values.tolist()
    if disease in prec_disease_list:
        prec_index = prec_disease_list.index(disease)
        for col in precautions_df.columns[1:]:
            val = precautions_df[col][prec_index]
            if pd.notnull(val) and str(val).strip():
                precautions.append(str(val).strip())

    return {"description": description, "precautions": precautions}


def build_prediction(confirmed_symptoms: list[str]) -> dict:
    """
    Returns top 3 predicted diseases with confidence scores.
    Uses predict_proba if available, falls back to predict.
    """
    if model is None:
        return {"error": "Model not loaded. Check server logs."}

    vector = [0] * len(sym_list)
    for s in confirmed_symptoms:
        if s in sym_list:
            vector[sym_list.index(s)] = 1

    top_diseases = []

    # ── Try predict_proba first (RandomForest, SVM with probability=True, etc.) ──
    if hasattr(model, "predict_proba"):
        proba  = model.predict_proba([vector])[0]
        classes = model.classes_

        top3_idx = np.argsort(proba)[::-1][:3]
        for idx in top3_idx:
            disease    = classes[idx]
            confidence = round(float(proba[idx]) * 100, 2)
            info       = get_disease_info(disease)
            top_diseases.append({
                "disease":     disease,
                "confidence":  confidence,   # e.g. 87.34 (%)
                **info,
            })

    # ── Fallback: decision_function (LinearSVC, etc.) ────────────────────────
    elif hasattr(model, "decision_function"):
        scores  = model.decision_function([vector])[0]
        classes = model.classes_

        top3_idx = np.argsort(scores)[::-1][:3]
        # Normalise to a 0-100 scale using softmax for display purposes
        top3_scores = scores[top3_idx]
        exp_scores  = np.exp(top3_scores - top3_scores.max())
        softmax     = exp_scores / exp_scores.sum()

        for rank, idx in enumerate(top3_idx):
            disease    = classes[idx]
            confidence = round(float(softmax[rank]) * 100, 2)
            info       = get_disease_info(disease)
            top_diseases.append({
                "disease":     disease,
                "confidence":  confidence,
                **info,
            })

    # ── Last resort: plain predict → single result at 100% ───────────────────
    else:
        disease = model.predict([vector])[0]
        info    = get_disease_info(disease)
        top_diseases.append({
            "disease":    disease,
            "confidence": 100.0,
            **info,
        })

    if not top_diseases:
        return {"error": "Prediction failed."}

    return {
        "top_predictions": top_diseases,
        "primary_disease": top_diseases[0]["disease"],   # convenience field
        "note": "This is not a medical diagnosis. Please consult a doctor.",
    }


# ════════════════════════════════════════════════════════════════════════════
#  ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.get("/symptoms")
def get_symptoms():
    return {"symptoms": sym_list}


@app.get("/predict")
def predict(symptoms: str):
    user_symptoms = [s.strip().lower() for s in symptoms.split(",") if s.strip()]

    if not user_symptoms:
        return {"status": "error", "message": "No symptoms provided."}

    exact, fuzzy, not_found = resolve_symptoms(user_symptoms)

    if not fuzzy and not not_found:
        return {
            "status":           "predicted",
            "matched_symptoms": exact,
            **build_prediction(exact),
        }

    if fuzzy:
        return {
            "status": "confirmation_required",
            "message": "Some symptoms need confirmation before we can predict.",
            "exact_matched": exact,
            "confirmation_needed": [
                {"you_entered": entered, "did_you_mean": suggestions}
                for entered, suggestions in fuzzy.items()
            ],
            "not_found": not_found,
        }

    return {
        "status":    "no_match",
        "message":   "None of the entered symptoms were recognised.",
        "not_found": not_found,
    }


@app.get("/confirm")
def confirm(symptoms: str):
    user_symptoms = [s.strip().lower() for s in symptoms.split(",") if s.strip()]

    if not user_symptoms:
        return {"status": "error", "message": "No symptoms provided."}

    exact, fuzzy, not_found = resolve_symptoms(user_symptoms)

    unresolved = list(fuzzy.keys()) + not_found
    if unresolved:
        return {
            "status":       "error",
            "message":      "Some symptoms could not be matched even after confirmation.",
            "unresolved":   unresolved,
            "valid_so_far": exact,
        }

    if not exact:
        return {"status": "error", "message": "No valid symptoms to predict from."}

    return {
        "status":             "predicted",
        "confirmed_symptoms": exact,
        **build_prediction(exact),
    }


app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")