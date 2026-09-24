import { defineConfig } from '@hey-api/openapi-ts';

// Generates src/generated/*.gen.ts from the contract. Never edit the output by hand:
// change openapi.yaml (or this config) and run `npm run contract:generate:ts`.
export default defineConfig({
  input: './openapi.yaml',
  output: {
    path: './src/generated',
    clean: true,
  },
  plugins: ['@hey-api/typescript'],
});
