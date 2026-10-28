FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY services/reprogramacion ./services/reprogramacion

RUN cd shared && npm install && npm run build
RUN cd services/reprogramacion && npm install && npm run build

WORKDIR /app/services/reprogramacion
CMD ["node", "dist/index.js"]
