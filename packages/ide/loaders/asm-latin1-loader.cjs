module.exports = function asmLatin1Loader(content) {
  const source = Buffer.isBuffer(content) ? content.toString('latin1') : String(content);
  return `export default ${JSON.stringify(source)};`;
};

module.exports.raw = true;

