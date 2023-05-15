module.exports.validateOptions = ({ maxItems }) => {
  if (maxItems !== undefined && maxItems < -1) {
    throw RangeError(
      `Expected options.maxItems to be >= -1, but was given ${maxItems}.`,
    );
  }
}
