// Vercel serverless function entry point for Hono
import app from '../dist/app.js';

export default {
    fetch: app.fetch.bind(app)
};
