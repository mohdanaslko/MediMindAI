import joblib as jb
import pandas as pd
from fastapi import FastAPI

app = FastAPI()


try:
    sym_list = jb.load("symptoms_list.joblib")
    model = jb.load("disease_prediction_model.joblib")
    @app.get("/")
    def home():
        return "Welcome to the Disease Prediction API!" 
    
    @app.get("/predict")
    def predict(symptoms:str):
        user_symptoms = [s.strip().lower() for s in symptoms.split(",")]
        vector = [0]*len(sym_list)
        
        for symptom in user_symptoms:
            if symptom in sym_list:
                index = sym_list.index(symptom)
                vector[index] = 1
                
        prediction = model.predict([vector])
        return {"predicted_disease": prediction[0]}
            
except Exception as e:
    print(f"Error occurred: {e}")

