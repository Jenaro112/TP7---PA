FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY services/proyector ./services/proyector

RUN cd shared && npm install && npm run build
RUN cd services/proyector && npm install && npm run build

WORKDIR /app/services/proyector
CMD ["node", "dist/index.js"]
