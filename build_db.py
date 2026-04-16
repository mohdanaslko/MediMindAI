import pandas as pd
from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
import os
#os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

print("⏳ Reading medical CSV files...")

# ---------------------------------------------------------
# 1. LOAD YOUR DATA
# ---------------------------------------------------------
desc_path = r"C:\Users\anasm\Documents\MediMindAI\datasets\symptom_Description.csv"
prec_path = r"C:\Users\anasm\Documents\MediMindAI\datasets\symptom_precaution.csv"

try:
    desc_df = pd.read_csv(desc_path)
    prec_df = pd.read_csv(prec_path)
except Exception as e:
    print(f"❌ Error loading CSVs. Check your file paths! Details: {e}")
    exit()

# Merge the two files based on the 'Disease' column
merged_df = pd.merge(desc_df, prec_df, on="Disease", how="inner")

# ---------------------------------------------------------
# 2. CONVERT TO AI DOCUMENTS
# ---------------------------------------------------------
docs = []
for _, row in merged_df.iterrows():
    disease = row['Disease']
    desc = row['Description']
    # Grab the 4 precautions and remove any blank spaces (NaN)
    precautions = [str(row[f'Precaution_{i}']) for i in range(1, 5) if pd.notna(row[f'Precaution_{i}'])]
    prec_text = ", ".join(precautions)
    
    # This is the exact text the AI will read later
    content = f"Disease: {disease}\nDescription: {desc}\nPrecautions: {prec_text}"
    
    docs.append(Document(page_content=content, metadata={"disease": disease}))

print(f"✅ Successfully prepared {len(docs)} diseases.")
print("⏳ Downloading local AI model and building database (first time takes a minute)...")

# ---------------------------------------------------------
# 3. BUILD AND SAVE THE LOCAL VECTOR DATABASE
# ---------------------------------------------------------
# Using a powerful, free, offline sentence transformer
embeddings = HuggingFaceEmbeddings(
    model_name="all-MiniLM-L6-v2",
    model_kwargs={'device': 'cpu'}
)

# Create the database and save it locally
vectorstore = Chroma.from_documents(
    documents=docs,
    embedding=embeddings,
    persist_directory="./medical_db" 
)

print("🎉 SUCCESS! Local RAG Database built and saved in the './medical_db' folder.")