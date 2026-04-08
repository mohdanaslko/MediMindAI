import joblib as jb
import pandas as pd
from fastapi import FastAPI
import os
app = FastAPI()



try:

    precautions_df = pd.read_csv(r"C:\Users\anasm\Documents\MediMindAI\datasets\symptom_precaution.csv")
    description_df = pd.read_csv(r"C:\Users\anasm\Documents\MediMindAI\datasets\symptom_Description.csv")
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
        
                
        if prediction[0] in description_df['Disease'].values.tolist():
            description = description_df['Disease'].values.tolist().index(prediction[0])
            precaution=[]
            for i in precautions_df.columns[1:]:
                    if precautions_df[i].notnull().any():
                        index = precautions_df['Disease'].values.tolist().index(prediction[0])
                        precaution.append(precautions_df[i][index])

            return {
                "disease": prediction[0],
                "description": description_df['Description'][description],
                "precaution": precaution,
                "note": "This is not a medical diagnosis. Please consult a doctor."
                #"Precautions": precautions_df[precautions_df['Disease'] == prediction[0]].iloc[:, 1:].values.flatten().tolist()
            }
                                                    
        else:
            return "Disease not found in the database."
            
            
except Exception as e:
    print(f"Error occurred: {e}")

