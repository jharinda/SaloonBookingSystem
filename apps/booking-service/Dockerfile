FROM node:20-alpine
WORKDIR /app
COPY dist/apps/booking-service/ .
RUN npm ci --omit=dev
CMD ["node", "main.js"]
