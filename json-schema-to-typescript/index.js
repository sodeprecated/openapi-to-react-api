const { readFileSync } = require("fs");
const { cloneDeep, endsWith, merge } = require("lodash");
const { dirname } = require("path");
const { generate } = require("./generator");
const { normalize } = require("./normalizer");
const { optimize } = require("./optimizer");
const { parse } = require("./parser");
const { error, stripExtension, Try } = require("./utils");
const { validate } = require("./validator");
const { link } = require("./linker");
const { validateOptions } = require("./optionValidator");
const { DEFAULT_OPTIONS } = require("./options");



module.exports.compileFromFile = (filename, options = DEFAULT_OPTIONS) => {
  const contents = Try(
    () => readFileSync(filename),
    () => {
      throw new ReferenceError(`Unable to read file "${filename}"`);
    }
  );
  const schema = Try(
    () => JSON.parse(contents.toString()),
    () => {
      throw new TypeError(`Error parsing JSON in file "${filename}"`);
    }
  );
  return compile(schema, stripExtension(filename), {
    cwd: dirname(filename),
    ...options,
  });
};

module.exports.compile = (schema, name, options = {}) => {
  validateOptions(options);
  const _options = merge({}, DEFAULT_OPTIONS, options);
  // normalize options
  if (!endsWith(_options.cwd, "/")) {
    _options.cwd += "/";
  }
  // Initial clone to avoid mutating the input
  const _schema = cloneDeep(schema);
  /* #region - DISABLE dereferencer */
  // const {dereferencedPaths, dereferencedSchema} = await dereference(_schema, _options)
  // const {dereferencedPaths, dereferencedSchema} = await dereference(_schema, _options)
  const dereferencedSchema = _schema;
  const dereferencedPaths = new WeakMap();
  /* #endregion */
  // dump(dereferencedSchema);
  const linked = link(dereferencedSchema);

  const errors = validate(linked, name);
  if (errors.length) {
    errors.forEach((_) => error(_));
    throw new ValidationError();
  }
  const normalized = normalize(linked, dereferencedPaths, name, _options);
  // dump(normalized);
  const parsed = parse(normalized, _options);
  // dump(parsed);
  const optimized = optimize(parsed, _options);
  const generated = generate(optimized, _options);
  return generated;
};

module.exports.ValidationError = class ValidationError extends Error {};
