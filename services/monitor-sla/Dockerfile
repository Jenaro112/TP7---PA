FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY services/monitor-sla ./services/monitor-sla

RUN cd shared && npm install && npm run build
RUN cd services/monitor-sla && npm install && npm run build

WORKDIR /app/services/monitor-sla
CMD ["node", "dist/index.js"]
