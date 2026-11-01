const [major, minor] = process.versions.node.split('.').map(Number);
if (major !== 22 || minor < 12) {
  console.error('SevaSathi requires Node.js 22.12 or newer in the Node 22 series.');
  console.error('Run nvm use 22 (install Node 22 first if needed), then retry this command.');
  process.exitCode = 1;
}
