FROM python:3.11-slim
WORKDIR /MediMindAI
COPY /requirements.txt .
COPY . .
RUN pip install --no-cache-dir --upgrade -r /MediMindAI/requirements.txt
EXPOSE 7860
CMD ["uvicorn", "app" , "--host","0.0.0.0", "--port", "7860"]