#!/usr/bin/env node

import fs from 'fs';

// eslint-disable-next-line import/prefer-default-export
export const modifyFiles = function modifyFiles(files, replacements) {
  files.forEach((file) => {
    let fileContentModified = fs.readFileSync(file, 'utf8');

    replacements.forEach((v) => {
      fileContentModified = fileContentModified.replace(v.regexp, v.replacement);
    });

    fs.writeFileSync(file, fileContentModified, 'utf8');
  });
};
