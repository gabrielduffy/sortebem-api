FROM node:20-alpine

WORKDIR /app

# instala dependências primeiro (melhor cache)
COPY package*.json ./
RUN npm install --omit=dev

# copia o restante do projeto
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
