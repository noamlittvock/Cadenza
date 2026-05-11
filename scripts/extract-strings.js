import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const DIRECTORIES_TO_SCAN = ['components', 'context', 'utils', 'chartBuilder'];
const OUTPUT_FILE = path.join(ROOT_DIR, 'translations_extracted.json');

const extracted = [];
let totalFound = 0;
let newFound = 0;

function walk(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            results.push(fullPath);
        }
    });
    return results;
}

// Simple regex to match t('key') or t("key") or t(`key`)
const T_EXPR_REGEX = /t\(\s*(['"`])([^'"`]+)\1\s*\)/g;

generateExtractedStrings();

function generateExtractedStrings() {
    console.log('Starting translation string extraction...');
    let files = [];
    DIRECTORIES_TO_SCAN.forEach(dir => {
        const fullPath = path.join(ROOT_DIR, dir);
        if (fs.existsSync(fullPath)) {
            files = files.concat(walk(fullPath));
        }
    });
    // Also include App.tsx
    if (fs.existsSync(path.join(ROOT_DIR, 'App.tsx'))) {
        files.push(path.join(ROOT_DIR, 'App.tsx'));
    }

    const existingOutput = fs.existsSync(OUTPUT_FILE) ? JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8')) : [];
    const existingKeys = new Set(existingOutput.map(e => e.key));

    const keysMap = new Map(); // key -> { key, screen_group }

    // Maintain existing keys to prevent deletion
    existingOutput.forEach(item => {
        keysMap.set(item.key, item);
    });

    files.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        let match;
        while ((match = T_EXPR_REGEX.exec(content)) !== null) {
            const key = match[2];
            const fileName = path.basename(file, path.extname(file));
            let screenGroup = fileName;

            if (!keysMap.has(key)) {
                keysMap.set(key, {
                    key: key,
                    screen_group: screenGroup
                });
                newFound++;
            }
            totalFound++; // Counting total occurrences, or unique occurrences depending on logic. Let's just track total matched instances.
        }
    });

    const output = Array.from(keysMap.values());

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`Extraction complete. ${Array.from(keysMap.keys()).length} unique keys found across all matching files.`);
    console.log(`${newFound} new keys added to intermediate catalog.`);
    console.log(`Run mapping will be reconciled in the Superadmin UI.`);
}
