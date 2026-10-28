FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY services/analitica ./services/analitica

RUN cd shared && npm install && npm run build
RUN cd services/analitica && npm install && npm run build

WORKDIR /app/services/analitica
EXPOSE 3002
CMD ["node", "dist/index.js"]
