#!/usr/bin/env tsx
import { execa } from 'execa';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

type Target = 'test' | 'local' | 'prod';
type Action = 'seed' | 'migrate' | 'reset';

const ARGS = process.argv.slice(2);
const ACTION = ARGS[0] as Action;
const TARGET_FLAG_INDEX = ARGS.indexOf('--target');
const TARGET = TARGET_FLAG_INDEX !== -1 ? ARGS[TARGET_FLAG_INDEX + 1] as Target : null;
const DRY_RUN = ARGS.includes('--dry-run');

if (!ACTION || !['seed', 'migrate', 'reset'].includes(ACTION)) {
    console.error('Usage: tsx tooling/scripts/db-manager.ts <seed|migrate|reset> --target <test|local|prod|all>');
    process.exit(1);
}

if (!TARGET && ARGS.includes('--target')) {
    console.error('Error: --target flag provided but no target specified.');
    process.exit(1);
}

if (!TARGET) {
    console.error('Error: --target <test|local|prod|all> is required.');
    process.exit(1);
}

async function confirm(message: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(`${message} (y/N) `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

function loadEnv(filePath: string): Record<string, string> {
    const fullPath = path.resolve(ROOT_DIR, filePath);
    if (!fs.existsSync(fullPath)) {
        console.warn(`Warning: .env file not found at ${fullPath}`);
        return {};
    }
    const result = dotenv.parse(fs.readFileSync(fullPath));
    return result;
}

async function runCommand(command: string, env: Record<string, string> = {}) {
    console.log(`\n> ${command}`);
    if (DRY_RUN) return;

    try {
        await execa(command, {
            shell: true,
            stdio: 'inherit',
            env: { ...process.env, ...env },
            cwd: ROOT_DIR,
        });
    } catch (error) {
        console.error(`Command failed: ${command}`);
        process.exit(1);
    }
}

async function executeAction(target: Target) {
    console.log(`\n=== Running ${ACTION} for target: ${target} ===`);

    let dbUrl = '';
    let additionalRedirectUris = '';

    switch (target) {
        case 'test':
            // Hardcoded local test DB for consistency and safety
            dbUrl = 'postgresql://superbasic:superbasic@localhost:5432/superbasic_test';
            break;
        case 'local':
            const localEnv = loadEnv('apps/api/.env.local');
            dbUrl = localEnv.DATABASE_URL || '';
            additionalRedirectUris = 'https://dev.superbasicfinance.com/auth/callback';
            break;
        case 'prod':
            const prodEnv = loadEnv('packages/database/.env.local');
            dbUrl = prodEnv.PRODUCTION_DATABASE_URL || prodEnv.DATABASE_URL || '';
            additionalRedirectUris = 'https://app.superbasicfinance.com/auth/callback';

            if (!DRY_RUN) {
                const confirmed = await confirm(`⚠️  WARNING: You are about to run "${ACTION}" against PRODUCTION database (${dbUrl}). Are you sure?`);
                if (!confirmed) {
                    console.log('Aborted.');
                    return;
                }
            }
            break;
    }

    if (!dbUrl) {
        console.error(`Error: Could not determine DATABASE_URL for target ${target}`);
        return;
    }

    const env = {
        DATABASE_URL: dbUrl,
        ADDITIONAL_REDIRECT_URIS: additionalRedirectUris,
    };

    switch (ACTION) {
        case 'seed':
            await runCommand('tsx tooling/scripts/seed-oauth-client.ts', env);
            break;
        case 'migrate':
            // For local/prod (Neon), use migrate deploy. For test (local postgres), use migrate dev or deploy.
            // Standardizing on migrate deploy for safety across all, but test might need dev if we want to generate migrations?
            // Actually, migrate deploy is safer for automated tooling.
            await runCommand('pnpm --filter @repo/database exec prisma migrate deploy', env);
            break;
        case 'reset':
            if (target === 'prod') {
                // Extra safety for reset on prod
                if (!DRY_RUN) {
                    const doubleCheck = await confirm(`⚠️  DANGER: This will DELETE ALL DATA in PRODUCTION. Type 'y' to confirm again.`);
                    if (!doubleCheck) return;
                }
            }
            await runCommand('pnpm --filter @repo/database exec prisma migrate reset --force', env);
            // Re-seed after reset
            await runCommand('tsx tooling/scripts/seed-oauth-client.ts', env);
            break;
    }
}

async function main() {
    if (TARGET === 'all' as any) {
        await executeAction('test');
        await executeAction('local');
        await executeAction('prod');
    } else {
        await executeAction(TARGET as Target);
    }
}

main().catch(console.error);
