const fs = require('fs');

const escapeCsv = (str) => {
    if (str === null || str === undefined) return '""';
    const stringified = String(str);
    if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
        return `"${stringified.replace(/"/g, '""')}"`;
    }
    return stringified;
};

// Read parts
const part1 = JSON.parse(fs.readFileSync('data_part1.json', 'utf8'));
const part2 = JSON.parse(fs.readFileSync('data_part2.json', 'utf8'));
const part3 = JSON.parse(fs.readFileSync('data_part3.json', 'utf8'));
const part4 = JSON.parse(fs.readFileSync('data_part4.json', 'utf8'));
const part5 = JSON.parse(fs.readFileSync('data_part5.json', 'utf8'));

// Combine all parts
const allData = [...part1, ...part2, ...part3, ...part4, ...part5];

// Headers
const csvRows = ['Key,Context,Original English,Hebrew (Natural),Hebrew (Formal),Hebrew (Concise),Hebrew (Colloquial),Manual Override,Final Translation'];

// Generate rows
allData.forEach(row => {
    const line = [
        row.key,
        escapeCsv(row.context),
        escapeCsv(row.en),
        escapeCsv(row.he_nat),
        escapeCsv(row.he_form),
        escapeCsv(row.he_con),
        escapeCsv(row.he_col),
        '', // Manual override column
        escapeCsv(row.he_nat) // Pre-fill with natural translation
    ].join(',');
    csvRows.push(line);
});

fs.writeFileSync('translations_catalog.csv', csvRows.join('\n'));
console.log(`Generated translations_catalog.csv with ${allData.length} strings.`);
