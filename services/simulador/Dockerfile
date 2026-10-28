FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY services/simulador ./services/simulador

RUN cd shared && npm install && npm run build
RUN cd services/simulador && npm install && npm run build

WORKDIR /app/services/simulador
EXPOSE 3001
CMD ["node", "dist/index.js"]
