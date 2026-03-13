import fs from 'node:fs';
import path from 'node:path';

const webDir = path.join(process.cwd(), 'mobile-web');
const indexFile = path.join(webDir, 'index.html');

if (!fs.existsSync(webDir)) {
  fs.mkdirSync(webDir, { recursive: true });
}

if (!fs.existsSync(indexFile)) {
  fs.writeFileSync(
    indexFile,
    [
      '<!doctype html>',
      '<html lang="en">',
      '  <head>',
      '    <meta charset="utf-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
      '    <title>Mobile shell</title>',
      '  </head>',
      '  <body>',
      '    <p>Mobile shell ready. Set CAPACITOR_APP_URL for remote web content.</p>',
      '  </body>',
      '</html>',
      '',
    ].join('\n'),
    'utf8'
  );
}

console.log(`mobile-web prepared at ${webDir}`);
