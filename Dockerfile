# ==============================================================================
# Minotari Node Monitor Dockerfile
# Production-ready Python 3.12-slim container with gRPC and Protobuf generation
# ==============================================================================
FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install runtime dependencies and certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy protobuf schemas and application code
COPY protos/ ./protos/
COPY app/ ./app/

# Generate Python gRPC stubs from base_node.proto into app/generated
RUN mkdir -p /app/app/generated && \
    python -m grpc_tools.protoc \
    -I./protos \
    --python_out=/app/app/generated \
    --grpc_python_out=/app/app/generated \
    ./protos/base_node.proto

# Create non-privileged user for security
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose web dashboard port
EXPOSE 8000

# Docker healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/healthz || exit 1

# Start FastAPI monitoring application with Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
