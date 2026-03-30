FROM python:3.12-slim

# Install system dev tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    git \
    curl \
    jq \
    tree \
    ripgrep \
    ca-certificates \
    gnupg \
    procps \
    net-tools \
    socat \
    lsof \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages (data science + dev tooling + web frameworks)
RUN pip install --no-cache-dir \
    requests \
    pandas \
    numpy \
    matplotlib \
    pytest \
    pytest-cov \
    ruff \
    black \
    flask \
    fastapi \
    uvicorn \
    && rm -rf /root/.cache/pip

# Create non-root user
RUN groupadd -r sandbox && useradd -r -g sandbox -m -s /bin/bash sandbox

# Create workspace directory
RUN mkdir -p /workspace && chown sandbox:sandbox /workspace

USER sandbox
WORKDIR /workspace

# Keep container alive
CMD ["sleep", "infinity"]
