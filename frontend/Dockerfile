FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY frontend ./frontend

RUN cd shared && npm install && npm run build
RUN cd frontend && npm install && npm run build

WORKDIR /app/frontend
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
