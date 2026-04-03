#!/bin/bash
# Quick check that critical env vars are set before starting services
REQUIRED_VARS=(JWT_ACCESS_SECRET JWT_REFRESH_SECRET MONGODB_URI REDIS_HOST)
MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "ERROR: $var is not set"
    MISSING=1
  fi
done
if [ $MISSING -eq 1 ]; then
  echo "Please copy .env.example to .env and fill in the required values"
  exit 1
fi
echo "All required environment variables are set"
