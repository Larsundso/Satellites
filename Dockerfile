FROM node:25-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

COPY . /app

WORKDIR /app/Ayako/packages/Utility
RUN rm -rf ./dist
RUN pnpm install
RUN pnpm run build

WORKDIR /app/Ayako/packages/Database
RUN rm -rf ./dist
RUN pnpm install
RUN pnpm run build

WORKDIR /app/Ayako/packages/Satellites
COPY ./.env /app/Ayako/packages/Satellites/.env
RUN rm -rf ./dist
RUN pnpm install
RUN pnpm run build
