FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download and install Qdrant binary
RUN curl -L https://github.com/qdrant/qdrant/releases/download/v1.7.0/qdrant-x86_64-unknown-linux-gnu.tar.gz \
    | tar -xz && \
    mv qdrant /usr/local/bin/qdrant && \
    chmod +x /usr/local/bin/qdrant

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY api/ ./api/
COPY knowledge_base/ ./knowledge_base/

# Create Qdrant storage directory and config
RUN mkdir -p /app/qdrant_storage && \
    echo 'log_level: INFO\n\
    storage:\n\
    storage_path: /app/qdrant_storage\n\
    service:\n\
    http_port: 6333\n\
    grpc_port: 6334\n\
    ' > /app/qdrant-config.yaml

# Copy startup script
COPY startup.py ./startup.py

# Create startup script
RUN echo '#!/bin/bash\n\
    set -e\n\
    \n\
    # Start Qdrant in background\n\
    echo "Starting Qdrant..."\n\
    qdrant --config-path /app/qdrant-config.yaml > /tmp/qdrant.log 2>&1 &\n\
    QDRANT_PID=$!\n\
    echo "Qdrant started with PID $QDRANT_PID"\n\
    \n\
    # Wait for Qdrant to be ready\n\
    echo "Waiting for Qdrant to be ready..."\n\
    QDRANT_READY=false\n\
    for i in {1..60}; do\n\
    if curl -s http://localhost:6333/health > /dev/null 2>&1; then\n\
    echo "✓ Qdrant is ready!"\n\
    QDRANT_READY=true\n\
    break\n\
    fi\n\
    if [ $((i % 5)) -eq 0 ]; then\n\
    echo "Still waiting for Qdrant... (${i}s)"\n\
    fi\n\
    sleep 1\n\
    done\n\
    \n\
    if [ "$QDRANT_READY" = false ]; then\n\
    echo "✗ Qdrant failed to start. Logs:"\n\
    tail -20 /tmp/qdrant.log\n\
    exit 1\n\
    fi\n\
    \n\
    # Ensure knowledge base is populated\n\
    echo "Checking knowledge base..."\n\
    python startup.py || echo "⚠ Ingestion had issues, continuing anyway..."\n\
    \n\
    # Start the API\n\
    echo "Starting API server..."\n\
    exec uvicorn api.main:app --host 0.0.0.0 --port 8000\n\
    ' > /app/start.sh && chmod +x /app/start.sh

# Expose ports
EXPOSE 8000 6333 6334

# Use startup script
CMD ["/app/start.sh"]
