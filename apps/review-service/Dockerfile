FROM node:20-alpine
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
WORKDIR /app
COPY dist/apps/review-service/ .
RUN npm ci --omit=dev
CMD ["node", "main.js"]
