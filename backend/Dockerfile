FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/uploads

EXPOSE 4000
CMD ["node", "src/index.js"]
