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

type SingleTarget = 'test' | 'local' | 'prod';
type Target = SingleTarget | 'all';
type Action = 'seed' | 'migrate' | 'reset' | 'generate';

const VALID_TARGETS: Target[] = ['test', 'local', 'prod', 'all'];
const VALID_ACTIONS: Action[] = ['seed', 'migrate', 'reset', 'generate'];

const ARGS = process.argv.slice(2);
const ACTION = ARGS[0] as Action;
const TARGET_FLAG_INDEX = ARGS.indexOf('--target');
const TARGET_INPUT = TARGET_FLAG_INDEX !== -1 ? ARGS[TARGET_FLAG_INDEX + 1] : null;
const DRY_RUN = ARGS.includes('--dry-run');

if (!ACTION || !VALID_ACTIONS.includes(ACTION)) {
    console.error('Usage: tsx tooling/scripts/db-manager.ts <seed|migrate|reset|generate> --target <test|local|prod|all>');
    process.exit(1);
}

if (!TARGET_INPUT && ARGS.includes('--target')) {
    console.error('Error: --target flag provided but no target specified.');
    process.exit(1);
}

if (!TARGET_INPUT) {
    console.error('Error: --target <test|local|prod|all> is required.');
    process.exit(1);
}

if (!VALID_TARGETS.includes(TARGET_INPUT as Target)) {
    console.error(`Error: Invalid target "${TARGET_INPUT}". Use one of: ${VALID_TARGETS.join(', ')}`);
    process.exit(1);
}

const TARGET = TARGET_INPUT as Target;

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

async function executeAction(target: SingleTarget) {
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
        case 'generate':
            await runCommand('pnpm --filter @repo/database exec prisma generate', env);
            break;
    }
}

async function main() {
    const targetsToRun: SingleTarget[] = TARGET === 'all' ? ['test', 'local', 'prod'] : [TARGET];

    for (const target of targetsToRun) {
        await executeAction(target);
    }
}

main().catch(console.error);
