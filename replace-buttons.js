const fs = require('fs');
const glob = require('glob');

const files = glob.sync('components/*.tsx');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace standard button classes
  // "bg-blue-600 hover:bg-blue-700 text-white" -> "btn-cadenza bg-cadenza-gradient texture-cadenza text-white"
  // "bg-blue-600 text-white hover:bg-blue-700" -> ...
  // Remove shadow-sm and replace with shadow-cadenza-soft if together.

  let newContent = content.replace(/bg-blue-600 hover:bg-blue-[0-9]{3}( disabled:opacity-[0-9]{2})? text-white/g, 'btn-cadenza bg-cadenza-gradient texture-cadenza text-white$1 shadow-cadenza-soft');
  
  newContent = newContent.replace(/bg-blue-600 text-white hover:bg-blue-[0-9]{3}/g, 'btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft');
  
  newContent = newContent.replace(/text-white px-([0-9]+) py-([0-9]+) bg-blue-600 hover:bg-blue-[0-9]{3}/g, 'btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft px-$1 py-$2');

  // Any hanging "shadow-sm text-sm" where we just added shadow-cadenza-soft? 
  // Let's just fix the double shadows if they happen:
  newContent = newContent.replace(/shadow-cadenza-soft(.*?)shadow-sm/g, 'shadow-cadenza-soft$1');
  
  // What about "shadow-sm shadow-blue-500\/25"? Remove that fully:
  newContent = newContent.replace(/shadow-sm shadow-blue-500\/25/g, 'shadow-cadenza-soft');

  // Fix other cases like: ChartBuilderModal.tsx
  // "bg-blue-600 text-white shadow-sm shadow-blue-500/25" -> "btn-cadenza bg-cadenza-gradient texture-cadenza text-white shadow-cadenza-soft"
  newContent = newContent.replace(/bg-blue-600 text-white/g, (match, offset, str) => {
    // If it's a progress bar (e.g., width: `${uploadProgress}%`), skip it
    if(str.substring(offset-50, offset+50).includes('width:')) return match;
    // Same for indicator dots or similar non-buttons (w-6 h-6, w-8 h-8 rounded-full)
    if(str.substring(offset-60, offset+20).includes('w-8 h-8 rounded-full')) return match;
    if(str.substring(offset-60, offset+20).includes('w-6 h-6 flex items-center justify-center rounded-full')) return match;
    
    return 'btn-cadenza bg-cadenza-gradient texture-cadenza text-white';
  });

  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
  }
}
