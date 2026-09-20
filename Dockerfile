FROM node:20-slim

# 1. Install Python 3, pip, ffmpeg, curl, and python-is-python3 (creates /usr/bin/python symlink)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python-is-python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Install yt-dlp via pip (ensuring system-wide access)
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Set working directory
WORKDIR /app

# 3. Copy Server package.json and install production dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --production

# 4. Copy Client package.json, install dependencies and build production assets
COPY client/package*.json ./client/
RUN cd client && npm install

COPY client ./client
RUN cd client && npm run build

# 5. Copy Server application files
COPY server ./server

# Expose default port
EXPOSE 8888
ENV PORT=8888
ENV NODE_ENV=production

# 6. Start the Jukebox Server
CMD ["node", "server/server.js"]
