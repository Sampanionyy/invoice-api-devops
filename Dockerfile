FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

# Fix permissions AVANT de switcher vers user node
RUN chown -R node:node /app

EXPOSE 3000

USER node

CMD ["node", "src/index.js"]