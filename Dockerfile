# Use the official lightweight Node.js 18 Alpine image
FROM node:18-alpine

# Set build and runtime environment
ENV NODE_ENV=production

# Create app directory and set permissions
WORKDIR /usr/src/app

# Copy package.json (and package-lock.json if available)
COPY package*.json ./

# Install only production dependencies (zero dependencies by design)
RUN npm prune --production

# Copy the rest of the application files
COPY . .

# Ensure database directory exists and belongs to the node user
RUN mkdir -p database/data && chown -R node:node /usr/src/app

# Switch to the secure non-root user
USER node

# Expose the default backend port
EXPOSE 4100

# Start the KotaMitra backend server
CMD ["node", "backend/server.js"]
