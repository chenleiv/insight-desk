import fs from "fs";
import path from "path";

function getAllFiles(dirPath, ext, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, ext, arrayOfFiles);
    } else {
      if (ext.some((e) => file.endsWith(e))) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

const srcPath = path.join(process.cwd(), "src");

// 1. Get all SCSS files
const scssFiles = getAllFiles(srcPath, [".scss"]);
const cssClasses = new Set();
const classToSCSSMap = new Map();

// SCSS class regex (basic)
const classRegex = /\.([a-zA-Z][a-zA-Z0-9_-]+)/g;

scssFiles.forEach((file) => {
  const content = fs.readFileSync(file, "utf8");
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1];
    cssClasses.add(className);
    if (!classToSCSSMap.has(className)) {
        classToSCSSMap.set(className, file);
    }
  }
});

// 2. Get all TSX files
const tsxFiles = getAllFiles(srcPath, [".tsx", ".ts"]);
let allTsxContent = "";
tsxFiles.forEach((file) => {
  allTsxContent += fs.readFileSync(file, "utf8") + "\n";
});

// 3. Find unused classes
const unusedClasses = [];
cssClasses.forEach((className) => {
  // Check if class name exists literally anywhere in the TS/TSX content.
  // We use word boundaries or just `includes` for string matching
  // Note: this is rudimentary but finds definitive orphans safely.
  if (!allTsxContent.includes(className)) {
    unusedClasses.push(className);
  }
});

console.log("Unused CSS Classes:");
unusedClasses.forEach(c => console.log(`- ${c} (in ${classToSCSSMap.get(c).replace(process.cwd(), '')})`));
